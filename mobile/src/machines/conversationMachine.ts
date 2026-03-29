import { assign, createMachine, fromPromise } from 'xstate';
import { sessionApi, ChatMessage, Session } from '../services/apiClient';
import { persistenceService } from '../services/persistenceService';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ConversationNode =
  | 'idle'
  | 'loading'
  | 'intro'
  | 'agreement_metadata'
  | 'employee_types_intro'
  | 'emp_type_basics'
  | 'shift_definitions'
  | 'day_scenarios'
  | 'public_holiday_rules'
  | 'leave_rules'
  | 'night_shift_rules'
  | 'workers_comp_rules'
  | 'allowances'
  | 'leave_paycodes'
  | 'wage_rate_table'
  | 'kronos_config'
  | 'payrule_mappings'
  | 'review'
  | 'submitting'
  | 'complete'
  | 'error';

export interface ConversationContext {
  sessionId: string | null;
  messages: ChatMessage[];
  currentNode: ConversationNode;
  extractedData: Record<string, unknown>;
  isRecording: boolean;
  isSpeaking: boolean;
  error: string | null;
  pendingUserMessage: string | null;
  mode: 'voice' | 'chat';
  sessionTitle: string;
}

export type ConversationEvent =
  | { type: 'SEND_MESSAGE'; content: string }
  | { type: 'RECEIVE_REPLY'; reply: string; node: ConversationNode; extracted: Record<string, unknown> }
  | { type: 'NODE_ADVANCE'; node: ConversationNode }
  | { type: 'SESSION_LOADED'; session: Session }
  | { type: 'RECORDING_START' }
  | { type: 'RECORDING_STOP' }
  | { type: 'SPEAKING_START' }
  | { type: 'SPEAKING_STOP' }
  | { type: 'TOGGLE_MODE' }
  | { type: 'ERROR'; message: string }
  | { type: 'RETRY' }
  | { type: 'GO_BACK' }
  | { type: 'END_SESSION' }
  | { type: 'SESSION_COMPLETE' };

export const NODE_LABELS: Record<ConversationNode, string> = {
  idle: 'Idle',
  loading: 'Loading',
  intro: 'Introduction',
  agreement_metadata: 'Agreement Details',
  employee_types_intro: 'Employee Types',
  emp_type_basics: 'Employee Basics',
  shift_definitions: 'Shift Definitions',
  day_scenarios: 'Day Scenarios',
  public_holiday_rules: 'Public Holidays',
  leave_rules: 'Leave Rules',
  night_shift_rules: 'Night Shift',
  workers_comp_rules: "Workers' Comp",
  allowances: 'Allowances',
  leave_paycodes: 'Leave Paycodes',
  wage_rate_table: 'Wage Rates',
  kronos_config: 'Kronos Config',
  payrule_mappings: 'Pay Rule Mappings',
  review: 'Review',
  submitting: 'Submitting',
  complete: 'Complete',
  error: 'Error',
};

export const NODE_ORDER: ConversationNode[] = [
  'intro',
  'agreement_metadata',
  'employee_types_intro',
  'emp_type_basics',
  'shift_definitions',
  'day_scenarios',
  'public_holiday_rules',
  'leave_rules',
  'night_shift_rules',
  'workers_comp_rules',
  'allowances',
  'leave_paycodes',
  'wage_rate_table',
  'kronos_config',
  'payrule_mappings',
  'review',
];

// ---------------------------------------------------------------------------
// Machine
// ---------------------------------------------------------------------------

export const conversationMachine = createMachine(
  {
    id: 'conversation',
    types: {} as {
      context: ConversationContext;
      events: ConversationEvent;
    },
    context: {
      sessionId: null,
      messages: [],
      currentNode: 'idle',
      extractedData: {},
      isRecording: false,
      isSpeaking: false,
      error: null,
      pendingUserMessage: null,
      mode: 'voice',
      sessionTitle: 'New Interview',
    },
    initial: 'idle',
    states: {
      idle: {
        on: {
          SESSION_LOADED: {
            target: 'active',
            actions: assign(({ event }) => ({
              sessionId: event.session.id,
              messages: event.session.messages,
              currentNode: (event.session.current_node as ConversationNode) ?? 'intro',
              extractedData: event.session.extracted_data ?? {},
              sessionTitle: event.session.title,
              error: null,
            })),
          },
          // Allow mode toggle even before session loads
          TOGGLE_MODE: {
            actions: assign(({ context }) => ({
              mode: context.mode === 'voice' ? 'chat' : 'voice',
            })),
          },
          // If session creation fails, surface the error
          ERROR: {
            target: 'error',
            actions: assign(({ event }) => ({ error: event.message })),
          },
          // Allow ending before session loads (just resets)
          END_SESSION: {
            target: 'error',
            actions: assign({ error: 'Session ended before it could start.' }),
          },
        },
      },

      loading: {
        invoke: {
          src: fromPromise(async ({ input }: { input: { sessionId: string | null; title: string } }) => {
            if (input.sessionId) {
              const res = await sessionApi.get(input.sessionId);
              return res.data;
            }
            const res = await sessionApi.create(input.title);
            return res.data;
          }),
          input: ({ context }: { context: ConversationContext }) => ({
            sessionId: context.sessionId,
            title: context.sessionTitle,
          }),
          onDone: {
            target: 'active',
            actions: [
              assign(({ event }) => ({
                sessionId: (event.output as Session).id,
                messages: (event.output as Session).messages,
                currentNode: ((event.output as Session).current_node as ConversationNode) ?? 'intro',
                extractedData: (event.output as Session).extracted_data ?? {},
                sessionTitle: (event.output as Session).title,
                error: null,
              })),
              ({ context, event }) => {
                const session = event.output as Session;
                persistenceService.saveSessionState({
                  sessionId: session.id,
                  currentNode: (session.current_node as ConversationNode) ?? 'intro',
                  messages: session.messages,
                  extractedData: session.extracted_data ?? {},
                  lastUpdated: new Date().toISOString(),
                });
              },
            ],
          },
          onError: {
            target: 'error',
            actions: assign(({ event }) => ({
              error: (event.error as Error)?.message ?? 'Failed to load session',
            })),
          },
        },
      },

      active: {
        type: 'parallel',
        states: {
          conversation: {
            initial: 'ready',
            states: {
              ready: {
                on: {
                  SEND_MESSAGE: {
                    target: 'sending',
                    actions: assign(({ context, event }) => {
                      const userMsg: ChatMessage = {
                        role: 'user',
                        content: event.content,
                        timestamp: new Date().toISOString(),
                      };
                      return {
                        pendingUserMessage: event.content,
                        messages: [...context.messages, userMsg],
                        error: null,
                      };
                    }),
                  },
                  RECORDING_START: {
                    actions: assign({ isRecording: true }),
                  },
                  RECORDING_STOP: {
                    actions: assign({ isRecording: false }),
                  },
                  SPEAKING_START: {
                    actions: assign({ isSpeaking: true }),
                  },
                  SPEAKING_STOP: {
                    actions: assign({ isSpeaking: false }),
                  },
                  NODE_ADVANCE: {
                    actions: assign(({ event }) => ({
                      currentNode: event.node,
                    })),
                  },
                  END_SESSION: {
                    target: '#conversation.submitting',
                  },
                },
              },

              sending: {
                invoke: {
                  src: fromPromise(
                    async ({
                      input,
                    }: {
                      input: {
                        sessionId: string;
                        content: string;
                        mode: 'voice' | 'chat';
                      };
                    }) => {
                      const res = await sessionApi.sendMessage({
                        session_id: input.sessionId,
                        content: input.content,
                        mode: input.mode,
                      });
                      return res.data;
                    },
                  ),
                  input: ({
                    context,
                  }: {
                    context: ConversationContext;
                  }) => ({
                    sessionId: context.sessionId!,
                    content: context.pendingUserMessage!,
                    mode: context.mode,
                  }),
                  onDone: {
                    target: 'ready',
                    actions: [
                      assign(({ context, event }) => {
                        const reply = event.output.reply as string;
                        const assistantMsg: ChatMessage = {
                          role: 'assistant',
                          content: reply,
                          timestamp: new Date().toISOString(),
                        };
                        const updatedMessages = [
                          ...context.messages,
                          assistantMsg,
                        ];
                        const newNode = (event.output.current_node as ConversationNode) ?? context.currentNode;
                        return {
                          messages: updatedMessages,
                          currentNode: newNode,
                          extractedData: event.output.extracted_data ?? context.extractedData,
                          pendingUserMessage: null,
                          error: null,
                        };
                      }),
                      ({ context, event }) => {
                        if (context.sessionId) {
                          persistenceService.saveSessionState({
                            sessionId: context.sessionId,
                            currentNode: (event.output.current_node as ConversationNode) ?? context.currentNode,
                            messages: context.messages,
                            extractedData: event.output.extracted_data ?? context.extractedData,
                            lastUpdated: new Date().toISOString(),
                          });
                        }
                      },
                    ],
                  },
                  onError: {
                    target: 'ready',
                    actions: assign(({ event }) => ({
                      error:
                        (event.error as Error)?.message ??
                        'Failed to send message',
                      pendingUserMessage: null,
                    })),
                  },
                },
              },
            },
          },

          mode: {
            initial: 'voice',
            states: {
              voice: {
                on: {
                  TOGGLE_MODE: 'chat',
                },
              },
              chat: {
                on: {
                  TOGGLE_MODE: 'voice',
                },
              },
            },
          },
        },

        on: {
          TOGGLE_MODE: {
            actions: assign(({ context }) => ({
              mode: context.mode === 'voice' ? 'chat' : 'voice',
            })),
          },
          SESSION_COMPLETE: {
            target: 'complete',
          },
          ERROR: {
            target: 'error',
            actions: assign(({ event }) => ({
              error: event.message,
            })),
          },
        },
      },

      submitting: {
        invoke: {
          src: fromPromise(
            async ({ input }: { input: { sessionId: string } }) => {
              const res = await sessionApi.complete(input.sessionId);
              return res.data;
            },
          ),
          input: ({ context }: { context: ConversationContext }) => ({
            sessionId: context.sessionId!,
          }),
          onDone: {
            target: 'complete',
            actions: [
              assign({ currentNode: 'complete' as ConversationNode }),
              ({ context }) => {
                persistenceService.clearActiveSession().catch(console.warn);
              },
            ],
          },
          onError: {
            target: 'error',
            actions: assign(({ event }) => ({
              error:
                (event.error as Error)?.message ?? 'Failed to submit session',
              currentNode: 'error' as ConversationNode,
            })),
          },
        },
      },

      complete: {
        type: 'final',
        entry: assign({ currentNode: 'complete' as ConversationNode }),
      },

      error: {
        on: {
          RETRY: {
            target: 'idle',
            actions: assign({
              error: null,
              sessionId: null,
              messages: [],
              currentNode: 'idle' as ConversationNode,
              extractedData: {},
            }),
          },
          GO_BACK: {
            target: 'idle',
            actions: assign({
              error: null,
              sessionId: null,
              messages: [],
              currentNode: 'idle' as ConversationNode,
              extractedData: {},
            }),
          },
          // Allow mode toggle from error screen
          TOGGLE_MODE: {
            actions: assign(({ context }) => ({
              mode: context.mode === 'voice' ? 'chat' : 'voice',
            })),
          },
        },
      },
    },
  },
);
