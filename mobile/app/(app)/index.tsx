import React, {
  useState,
  useEffect,
  useRef,
  useCallback,
} from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  SafeAreaView,
  Alert,
  AppState,
  AppStateStatus,
  Platform,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useMachine } from '@xstate/react';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { StatusBar } from 'expo-status-bar';

import { conversationMachine, NODE_LABELS } from '../../src/machines/conversationMachine';
import { voiceService } from '../../src/services/voiceService';
import { sttService } from '../../src/services/sttService';
import { persistenceService } from '../../src/services/persistenceService';
import { sessionApi } from '../../src/services/apiClient';
import { useAuthStore } from '../../src/stores/authStore';

import { MicButton } from '../../src/components/MicButton';
import { ChatBubble } from '../../src/components/ChatBubble';
import { ChatHistory } from '../../src/components/ChatHistory';
import { NodeProgress } from '../../src/components/NodeProgress';
import { VoiceWaveform } from '../../src/components/VoiceWaveform';

import { Colors, Spacing, FontSize, BorderRadius, Shadow } from '../../src/constants/theme';

export default function ConversationScreen() {
  const router = useRouter();
  const { accessToken, user } = useAuthStore();
  const isAuthenticated = !!(accessToken && user);
  const [state, send] = useMachine(conversationMachine);

  const [chatInput, setChatInput] = useState('');
  const [audioLevel, setAudioLevel] = useState(0);
  const [isSendingChat, setIsSendingChat] = useState(false);
  const [isAwaitingReply, setIsAwaitingReply] = useState(false);
  // Track whether the initial session API call is in-flight
  const [sessionLoading, setSessionLoading] = useState(false);

  const isVoiceMode = state.context.mode === 'voice';
  const isRecording = state.context.isRecording;
  const isSpeaking = state.context.isSpeaking;
  const messages = state.context.messages;
  const currentNode = state.context.currentNode;
  const sessionId = state.context.sessionId;
  const error = state.context.error;

  const lastAssistantMessage = [...messages]
    .reverse()
    .find((m) => m.role === 'assistant');

  const appStateRef = useRef(AppState.currentState);
  const prevSpeakingRef = useRef(false);

  // ---------------------------------------------------------------------------
  // Session init — only when authenticated
  // ---------------------------------------------------------------------------
  useEffect(() => {
    if (isAuthenticated) {
      initSession();
    }
  }, [isAuthenticated]);

  // Re-run initSession when machine returns to idle (e.g. after RETRY from error)
  useEffect(() => {
    if (isAuthenticated && state.matches('idle') && !sessionLoading) {
      initSession();
    }
  }, [state.value]);

  const initSession = async () => {
    setSessionLoading(true);
    try {
      // Check for persisted session
      const savedId = await persistenceService.getActiveSessionId();
      if (savedId) {
        const savedState = await persistenceService.loadSessionState(savedId);
        if (savedState) {
          // Try to reconcile with server
          try {
            const serverRes = await sessionApi.get(savedId);
            const server = serverRes.data;
            const reconciled = persistenceService.reconcileMessages(
              savedState.messages,
              server.messages,
            );
            send({
              type: 'SESSION_LOADED',
              session: { ...server, messages: reconciled },
            });
          } catch {
            // Server fetch failed — use local state (offline mode)
            send({
              type: 'SESSION_LOADED',
              session: {
                id: savedState.sessionId,
                title: 'Resumed Interview',
                current_node: savedState.currentNode,
                messages: savedState.messages,
                extracted_data: savedState.extractedData,
                status: 'active',
                created_at: savedState.lastUpdated,
                updated_at: savedState.lastUpdated,
              },
            });
          }
          return;
        }
      }

      // Create new session on the server
      const res = await sessionApi.create('New Interview');
      send({ type: 'SESSION_LOADED', session: res.data });
    } catch (err: any) {
      const msg = err?.message ?? 'Failed to connect to server';
      send({ type: 'ERROR', message: `Could not start session: ${msg}` });
    } finally {
      setSessionLoading(false);
    }
  };

  // ---------------------------------------------------------------------------
  // Speak AI greeting when session first loads
  // ---------------------------------------------------------------------------
  useEffect(() => {
    if (
      state.matches('active') &&
      messages.length > 0 &&
      lastAssistantMessage
    ) {
      const last = messages[messages.length - 1];
      if (last.role === 'assistant') {
        speakMessage(last.content);
      }
    }
  }, [messages.length]);

  // ---------------------------------------------------------------------------
  // AppState — save to AsyncStorage when backgrounded
  // ---------------------------------------------------------------------------
  useEffect(() => {
    const sub = AppState.addEventListener(
      'change',
      (nextState: AppStateStatus) => {
        if (
          appStateRef.current === 'active' &&
          nextState.match(/inactive|background/)
        ) {
          if (sessionId) {
            persistenceService.saveSessionState({
              sessionId,
              currentNode,
              messages,
              extractedData: state.context.extractedData,
              lastUpdated: new Date().toISOString(),
            });
          }
          // Stop recording and speech if backgrounded
          if (isRecording) {
            handleStopRecording();
          }
          voiceService.stop();
        }
        appStateRef.current = nextState;
      },
    );
    return () => sub.remove();
  }, [sessionId, currentNode, messages, isRecording]);

  // ---------------------------------------------------------------------------
  // Audio level callback for waveform
  // ---------------------------------------------------------------------------
  useEffect(() => {
    sttService.setLevelChangeCallback(setAudioLevel);
    return () => sttService.setLevelChangeCallback(null);
  }, []);

  // ---------------------------------------------------------------------------
  // VAD auto-stop — fires when silence detected after speech
  // ---------------------------------------------------------------------------
  useEffect(() => {
    sttService.setAutoStopCallback(() => {
      if (sttService.getIsRecording()) {
        handleStopRecording();
      }
    });
    return () => sttService.setAutoStopCallback(null);
  }, []);

  // ---------------------------------------------------------------------------
  // Voice service speaking state sync
  // ---------------------------------------------------------------------------
  useEffect(() => {
    voiceService.setSpeakingChangeCallback((speaking) => {
      if (speaking) {
        send({ type: 'SPEAKING_START' });
      } else {
        send({ type: 'SPEAKING_STOP' });
      }
    });
    return () => voiceService.setSpeakingChangeCallback(null);
  }, []);

  // ---------------------------------------------------------------------------
  // Auto-continue loop — after AI finishes speaking, restart mic automatically
  // ---------------------------------------------------------------------------
  useEffect(() => {
    const wasJustSpeaking = prevSpeakingRef.current && !isSpeaking;
    prevSpeakingRef.current = isSpeaking;

    if (
      wasJustSpeaking &&
      isVoiceMode &&
      state.matches('active') &&
      !isRecording &&
      !isAwaitingReply
    ) {
      const t = setTimeout(() => {
        handleStartRecording();
      }, 600);
      return () => clearTimeout(t);
    }
  }, [isSpeaking]);

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------
  const speakMessage = useCallback(
    async (text: string) => {
      if (!voiceService.isEnabled()) return;
      await voiceService.speak(text);
    },
    [],
  );

  const handleMicPress = useCallback(async () => {
    if (isRecording) {
      await handleStopRecording();
    } else {
      await handleStartRecording();
    }
  }, [isRecording]);

  const handleStartRecording = async () => {
    voiceService.stop();
    try {
      await sttService.startRecording();
      send({ type: 'RECORDING_START' });
    } catch (err: any) {
      Alert.alert(
        'Microphone Error',
        err?.message ?? 'Could not start recording. Check microphone permissions.',
        [{ text: 'OK' }],
      );
    }
  };

  const handleStopRecording = async () => {
    send({ type: 'RECORDING_STOP' });
    setIsAwaitingReply(true);
    try {
      const transcript = await sttService.stopRecording();
      if (transcript && transcript.trim()) {
        send({ type: 'SEND_MESSAGE', content: transcript.trim() });
      } else {
        // Empty transcript — STT not configured or no speech detected
        setIsAwaitingReply(false);
        Alert.alert(
          'No Speech Detected',
          'Could not transcribe speech. Voice transcription requires an OpenAI API key on the server.\n\nSwitch to Chat mode to type your message instead.',
          [
            { text: 'Switch to Chat', onPress: () => send({ type: 'TOGGLE_MODE' }) },
            { text: 'OK', style: 'cancel' },
          ],
        );
      }
    } catch (err: any) {
      setIsAwaitingReply(false);
      const msg: string = err?.message ?? 'Transcription failed';
      // STT not configured — guide user to chat mode
      if (
        msg.includes('not configured') ||
        msg.includes('STT_NOT_CONFIGURED') ||
        msg.includes('503')
      ) {
        Alert.alert(
          'Voice Transcription Unavailable',
          'The server is not configured for speech-to-text.\n\nSwitch to Chat mode to type your message.',
          [
            { text: 'Switch to Chat', onPress: () => send({ type: 'TOGGLE_MODE' }) },
            { text: 'OK', style: 'cancel' },
          ],
        );
      } else {
        Alert.alert('Transcription Error', msg, [{ text: 'OK' }]);
      }
    }
  };

  const handleSendChat = useCallback(async () => {
    const text = chatInput.trim();
    if (!text || isSendingChat) return;
    setChatInput('');
    send({ type: 'SEND_MESSAGE', content: text });
  }, [chatInput, isSendingChat]);

  const handleEndSession = () => {
    // If no active session yet (loading or error), just go back to home
    const inIdle = state.matches('idle');
    const inError = state.matches('error');
    if (inIdle || inError || !sessionId) {
      voiceService.stop();
      if (isRecording) {
        sttService.cancelRecording().catch(console.warn);
      }
      // Clear any persisted session so next open starts fresh
      persistenceService.clearActiveSession().catch(console.warn);
      router.replace('/(app)');
      return;
    }

    Alert.alert(
      'End Interview',
      'Are you sure you want to end this session? The captured data will be saved.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'End Session',
          style: 'destructive',
          onPress: () => {
            voiceService.stop();
            if (isRecording) {
              sttService.cancelRecording().catch(console.warn);
              send({ type: 'RECORDING_STOP' });
            }
            send({ type: 'END_SESSION' });
          },
        },
      ],
    );
  };

  // Track when machine transitions to sending state to show loading
  useEffect(() => {
    const inSending = state.matches({ active: { conversation: 'sending' } });
    setIsAwaitingReply(inSending);
  }, [state.value]);

  // ---------------------------------------------------------------------------
  // Render: Complete state
  // ---------------------------------------------------------------------------
  if (state.matches('complete')) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.completeContainer}>
          <View style={styles.completeIcon}>
            <MaterialCommunityIcons
              name="check-circle-outline"
              size={64}
              color={Colors.green[500]}
            />
          </View>
          <Text style={styles.completeTitle}>Interview Complete</Text>
          <Text style={styles.completeSubtitle}>
            The award rule spec has been captured and saved. Your admin will review
            and provision the account.
          </Text>
          <TouchableOpacity
            style={styles.newSessionButton}
            onPress={() => {
              // Reset and start new
              router.replace('/(app)');
            }}
          >
            <Text style={styles.newSessionButtonText}>Start New Interview</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  // ---------------------------------------------------------------------------
  // Render: Error state
  // ---------------------------------------------------------------------------
  if (state.matches('error')) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.errorContainer}>
          <MaterialCommunityIcons
            name="alert-circle-outline"
            size={48}
            color={Colors.red[500]}
          />
          <Text style={styles.errorTitle}>Something went wrong</Text>
          <Text style={styles.errorMessage}>{error}</Text>
          <TouchableOpacity
            style={styles.retryButton}
            onPress={() => send({ type: 'RETRY' })}
          >
            <Text style={styles.retryButtonText}>Try Again</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.backLinkButton}
            onPress={() => send({ type: 'GO_BACK' })}
          >
            <Text style={styles.backLinkText}>Start over</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  // ---------------------------------------------------------------------------
  // Main render
  // ---------------------------------------------------------------------------
  return (
    <SafeAreaView style={styles.container}>
      <StatusBar style="dark" />

      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => router.back()}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          style={styles.headerButton}
        >
          <MaterialCommunityIcons
            name="arrow-left"
            size={22}
            color={Colors.text.primary}
          />
        </TouchableOpacity>

        <View style={styles.headerCenter}>
          <Text style={styles.headerTitle} numberOfLines={1}>
            {state.context.sessionTitle || 'Interview'}
          </Text>
          {currentNode !== 'idle' && currentNode !== 'loading' && (
            <Text style={styles.headerSubtitle}>
              {NODE_LABELS[currentNode]}
            </Text>
          )}
        </View>

        {isAuthenticated ? (
          <TouchableOpacity
            onPress={() => router.push('/(app)/settings')}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            style={styles.headerButton}
          >
            <MaterialCommunityIcons
              name="cog-outline"
              size={22}
              color={Colors.text.primary}
            />
          </TouchableOpacity>
        ) : (
          <TouchableOpacity
            onPress={() => router.push('/(auth)/login')}
            style={styles.signInButton}
          >
            <Text style={styles.signInButtonText}>Sign in</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Progress indicator */}
      {state.matches('active') && (
        <NodeProgress currentNode={currentNode} compact />
      )}

      {/* Body */}
      {isVoiceMode ? (
        <VoiceModeBody
          lastAssistantMessage={lastAssistantMessage?.content}
          isRecording={isRecording}
          isSpeaking={isSpeaking}
          isLoading={isAwaitingReply || state.matches('loading') || sessionLoading}
          audioLevel={audioLevel}
          onMicPress={handleMicPress}
          onToggleMode={() => send({ type: 'TOGGLE_MODE' })}
          onEndSession={handleEndSession}
          onSignIn={() => router.push('/(auth)/login')}
          isAuthenticated={isAuthenticated}
          error={error}
          sessionLoading={sessionLoading}
          onRetry={initSession}
        />
      ) : (
        <ChatModeBody
          messages={messages}
          chatInput={chatInput}
          onChatInputChange={setChatInput}
          onSend={handleSendChat}
          isLoading={isAwaitingReply}
          onToggleMode={() => send({ type: 'TOGGLE_MODE' })}
          onEndSession={handleEndSession}
          error={error}
        />
      )}
    </SafeAreaView>
  );
}

// ---------------------------------------------------------------------------
// Voice Mode Body
// ---------------------------------------------------------------------------
interface VoiceModeBodyProps {
  lastAssistantMessage?: string;
  isRecording: boolean;
  isSpeaking: boolean;
  isLoading: boolean;
  audioLevel: number;
  onMicPress: () => void;
  onToggleMode: () => void;
  onEndSession: () => void;
  onSignIn: () => void;
  isAuthenticated: boolean;
  error: string | null;
  sessionLoading?: boolean;
  onRetry?: () => void;
}

function VoiceModeBody({
  lastAssistantMessage,
  isRecording,
  isSpeaking,
  isLoading,
  audioLevel,
  onMicPress,
  onToggleMode,
  onEndSession,
  onSignIn,
  isAuthenticated,
  error,
  sessionLoading,
  onRetry,
}: VoiceModeBodyProps) {
  return (
    <View style={styles.voiceBody}>
      {/* AI message bubble */}
      <View style={styles.voiceBubbleArea}>
        {!isAuthenticated ? (
          <View style={styles.voiceEmptyState}>
            <MaterialCommunityIcons
              name="robot-outline"
              size={48}
              color={Colors.brand[300]}
            />
            <Text style={styles.voiceEmptyTitle}>Welcome to Gator</Text>
            <Text style={styles.voiceEmptyText}>
              Sign in to start your award rule interview
            </Text>
            <TouchableOpacity
              style={styles.signInPromptButton}
              onPress={onSignIn}
            >
              <Text style={styles.signInPromptButtonText}>Sign in</Text>
            </TouchableOpacity>
          </View>
        ) : lastAssistantMessage ? (
          <View style={styles.voiceAiBubble}>
            <View style={styles.voiceAiAvatar}>
              <MaterialCommunityIcons
                name="robot-outline"
                size={18}
                color={Colors.brand[600]}
              />
            </View>
            <View style={styles.voiceAiBubbleContent}>
              <Text style={styles.voiceAiText}>{lastAssistantMessage}</Text>
            </View>
          </View>
        ) : (
          <View style={styles.voiceEmptyState}>
            <MaterialCommunityIcons
              name="robot-outline"
              size={32}
              color={error ? Colors.red[300] : Colors.brand[200]}
            />
            {error ? (
              <>
                <Text style={[styles.voiceEmptyText, { color: Colors.red[600], textAlign: 'center' }]}>
                  {error}
                </Text>
                {onRetry && (
                  <TouchableOpacity style={styles.signInPromptButton} onPress={onRetry}>
                    <Text style={styles.signInPromptButtonText}>Retry</Text>
                  </TouchableOpacity>
                )}
                <TouchableOpacity
                  style={[styles.toggleModeButton, { marginTop: 8 }]}
                  onPress={onToggleMode}
                >
                  <MaterialCommunityIcons name="message-text-outline" size={14} color={Colors.brand[600]} />
                  <Text style={styles.toggleModeText}>Use Chat Mode Instead</Text>
                </TouchableOpacity>
              </>
            ) : (
              <Text style={styles.voiceEmptyText}>
                {sessionLoading ? 'Connecting to server...' : 'Tap the mic to begin'}
              </Text>
            )}
          </View>
        )}

        {/* Speaking indicator */}
        {isSpeaking && (
          <View style={styles.speakingIndicator}>
            <VoiceWaveform
              isActive={isSpeaking}
              color={Colors.brand[600]}
              barCount={7}
              height={24}
            />
            <Text style={styles.speakingText}>Speaking...</Text>
          </View>
        )}
      </View>

      {/* Error inline */}
      {error && (
        <View style={styles.inlineError}>
          <MaterialCommunityIcons
            name="alert-circle-outline"
            size={14}
            color={Colors.red[600]}
          />
          <Text style={styles.inlineErrorText} numberOfLines={2}>
            {error}
          </Text>
        </View>
      )}

      {/* Recording status */}
      {isRecording && (
        <View style={styles.recordingStatus}>
          <View style={styles.recordingDot} />
          <Text style={styles.recordingText}>Listening — stops on silence</Text>
          <VoiceWaveform
            isActive={isRecording}
            audioLevel={audioLevel}
            color={Colors.red[500]}
            barCount={5}
            height={20}
          />
        </View>
      )}

      {/* Mic button */}
      {isAuthenticated && (
        <View style={styles.micArea}>
          <MicButton
            isRecording={isRecording}
            isLoading={isLoading && !isRecording}
            onPress={onMicPress}
            disabled={isSpeaking || isLoading}
            size={88}
          />
        </View>
      )}

      {/* Bottom controls */}
      <View style={styles.bottomControls}>
        <TouchableOpacity
          style={styles.toggleModeButton}
          onPress={onToggleMode}
          activeOpacity={0.8}
        >
          <MaterialCommunityIcons
            name="message-text-outline"
            size={16}
            color={Colors.brand[600]}
          />
          <Text style={styles.toggleModeText}>Switch to Chat</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.endButton}
          onPress={onEndSession}
          activeOpacity={0.8}
        >
          <MaterialCommunityIcons
            name="stop-circle-outline"
            size={16}
            color={Colors.red[600]}
          />
          <Text style={styles.endButtonText}>End</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Chat Mode Body
// ---------------------------------------------------------------------------
interface ChatModeBodyProps {
  messages: any[];
  chatInput: string;
  onChatInputChange: (text: string) => void;
  onSend: () => void;
  isLoading: boolean;
  onToggleMode: () => void;
  onEndSession: () => void;
  error: string | null;
}

function ChatModeBody({
  messages,
  chatInput,
  onChatInputChange,
  onSend,
  isLoading,
  onToggleMode,
  onEndSession,
  error,
}: ChatModeBodyProps) {
  return (
    <View style={styles.chatBody}>
      {/* Error inline */}
      {error && (
        <View style={styles.inlineError}>
          <MaterialCommunityIcons
            name="alert-circle-outline"
            size={14}
            color={Colors.red[600]}
          />
          <Text style={styles.inlineErrorText} numberOfLines={2}>
            {error}
          </Text>
        </View>
      )}

      {/* Chat history */}
      <ChatHistory messages={messages} isLoading={isLoading} />

      {/* Input row */}
      <View style={styles.chatInputRow}>
        <View style={styles.chatInputWrapper}>
          <TextInput
            style={styles.chatInput}
            value={chatInput}
            onChangeText={onChatInputChange}
            placeholder="Type your message..."
            placeholderTextColor={Colors.gray[400]}
            multiline
            maxLength={2000}
            returnKeyType="send"
            onSubmitEditing={onSend}
            blurOnSubmit={false}
            editable={!isLoading}
          />
        </View>
        <TouchableOpacity
          style={[
            styles.sendButton,
            (!chatInput.trim() || isLoading) && styles.sendButtonDisabled,
          ]}
          onPress={onSend}
          disabled={!chatInput.trim() || isLoading}
          activeOpacity={0.85}
        >
          <MaterialCommunityIcons
            name="send"
            size={20}
            color={Colors.white}
          />
        </TouchableOpacity>
      </View>

      {/* Bottom controls */}
      <View style={styles.bottomControls}>
        <TouchableOpacity
          style={styles.toggleModeButton}
          onPress={onToggleMode}
          activeOpacity={0.8}
        >
          <MaterialCommunityIcons
            name="microphone-outline"
            size={16}
            color={Colors.brand[600]}
          />
          <Text style={styles.toggleModeText}>Switch to Voice</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.endButton}
          onPress={onEndSession}
          activeOpacity={0.8}
        >
          <MaterialCommunityIcons
            name="stop-circle-outline"
            size={16}
            color={Colors.red[600]}
          />
          <Text style={styles.endButtonText}>End</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------
const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm + 2,
    backgroundColor: Colors.white,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    ...Shadow.sm,
  },
  headerButton: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerCenter: {
    flex: 1,
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: FontSize.base,
    fontFamily: 'Inter_600SemiBold',
    color: Colors.text.primary,
  },
  headerSubtitle: {
    fontSize: FontSize.xs,
    fontFamily: 'Inter_400Regular',
    color: Colors.brand[600],
    marginTop: 1,
  },

  // Voice mode
  voiceBody: {
    flex: 1,
    paddingBottom: Spacing.sm,
  },
  voiceBubbleArea: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: Spacing.xl,
    paddingTop: Spacing.xl,
  },
  voiceAiBubble: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    maxWidth: '100%',
  },
  voiceAiAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Colors.brand[50],
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: Spacing.sm,
    flexShrink: 0,
    borderWidth: 1.5,
    borderColor: Colors.brand[100],
  },
  voiceAiBubbleContent: {
    flex: 1,
    backgroundColor: Colors.white,
    borderRadius: BorderRadius.xl,
    borderTopLeftRadius: BorderRadius.sm,
    padding: Spacing.md + 2,
    ...Shadow.md,
  },
  voiceAiText: {
    fontSize: FontSize.lg,
    lineHeight: FontSize.lg * 1.6,
    color: Colors.text.primary,
    fontFamily: 'Inter_400Regular',
  },
  voiceEmptyState: {
    alignItems: 'center',
    gap: Spacing.md,
  },
  voiceEmptyTitle: {
    fontSize: FontSize.xl,
    fontFamily: 'Inter_700Bold',
    color: Colors.text.primary,
    textAlign: 'center',
  },
  voiceEmptyText: {
    fontSize: FontSize.base,
    color: Colors.gray[400],
    fontFamily: 'Inter_400Regular',
    textAlign: 'center',
  },
  signInButton: {
    backgroundColor: Colors.brand[600],
    borderRadius: BorderRadius.lg,
    paddingVertical: Spacing.xs + 2,
    paddingHorizontal: Spacing.md,
  },
  signInButtonText: {
    color: Colors.white,
    fontSize: FontSize.sm,
    fontFamily: 'Inter_600SemiBold',
  },
  signInPromptButton: {
    backgroundColor: Colors.brand[600],
    borderRadius: BorderRadius.lg,
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.xl,
    marginTop: Spacing.sm,
    ...Shadow.md,
  },
  signInPromptButtonText: {
    color: Colors.white,
    fontSize: FontSize.base,
    fontFamily: 'Inter_600SemiBold',
  },
  speakingIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    marginTop: Spacing.md,
    backgroundColor: Colors.brand[50],
    borderRadius: BorderRadius.full,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
  },
  speakingText: {
    fontSize: FontSize.xs,
    color: Colors.brand[600],
    fontFamily: 'Inter_500Medium',
  },

  // Recording status
  recordingStatus: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
    paddingVertical: Spacing.sm,
    marginHorizontal: Spacing.xl,
    backgroundColor: '#FEF2F2',
    borderRadius: BorderRadius.full,
    marginBottom: Spacing.sm,
  },
  recordingDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: Colors.red[500],
  },
  recordingText: {
    fontSize: FontSize.sm,
    color: Colors.red[600],
    fontFamily: 'Inter_500Medium',
  },

  // Mic
  micArea: {
    alignItems: 'center',
    paddingBottom: Spacing.lg,
  },

  // Inline error
  inlineError: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FEF2F2',
    marginHorizontal: Spacing.md,
    marginVertical: Spacing.xs,
    borderRadius: BorderRadius.lg,
    padding: Spacing.sm,
    gap: Spacing.xs,
    borderWidth: 1,
    borderColor: '#FECACA',
  },
  inlineErrorText: {
    flex: 1,
    fontSize: FontSize.xs,
    color: Colors.red[600],
    fontFamily: 'Inter_400Regular',
  },

  // Bottom controls
  bottomControls: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: Spacing.lg,
    paddingBottom: Platform.OS === 'ios' ? Spacing.md : Spacing.sm,
    paddingTop: Spacing.sm,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    backgroundColor: Colors.white,
  },
  toggleModeButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    backgroundColor: Colors.brand[50],
    borderRadius: BorderRadius.full,
    paddingVertical: Spacing.sm - 2,
    paddingHorizontal: Spacing.md,
  },
  toggleModeText: {
    fontSize: FontSize.sm,
    color: Colors.brand[600],
    fontFamily: 'Inter_500Medium',
  },
  endButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    backgroundColor: '#FEF2F2',
    borderRadius: BorderRadius.full,
    paddingVertical: Spacing.sm - 2,
    paddingHorizontal: Spacing.md,
  },
  endButtonText: {
    fontSize: FontSize.sm,
    color: Colors.red[600],
    fontFamily: 'Inter_500Medium',
  },

  // Chat mode
  chatBody: {
    flex: 1,
  },
  chatInputRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingHorizontal: Spacing.md,
    paddingTop: Spacing.sm,
    paddingBottom: Spacing.sm,
    backgroundColor: Colors.white,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    gap: Spacing.sm,
  },
  chatInputWrapper: {
    flex: 1,
    backgroundColor: Colors.gray[100],
    borderRadius: BorderRadius.xl,
    paddingHorizontal: Spacing.md,
    paddingVertical: Platform.OS === 'ios' ? Spacing.sm : Spacing.xs,
    minHeight: 44,
    maxHeight: 120,
    justifyContent: 'center',
  },
  chatInput: {
    fontSize: FontSize.base,
    color: Colors.text.primary,
    fontFamily: 'Inter_400Regular',
    maxHeight: 100,
  },
  sendButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: Colors.brand[600],
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  sendButtonDisabled: {
    backgroundColor: Colors.gray[300],
  },

  // Complete state
  completeContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing.xl,
  },
  completeIcon: {
    marginBottom: Spacing.xl,
  },
  completeTitle: {
    fontSize: FontSize['2xl'],
    fontFamily: 'Inter_700Bold',
    color: Colors.text.primary,
    marginBottom: Spacing.md,
    textAlign: 'center',
  },
  completeSubtitle: {
    fontSize: FontSize.base,
    color: Colors.text.secondary,
    fontFamily: 'Inter_400Regular',
    textAlign: 'center',
    lineHeight: FontSize.base * 1.6,
    marginBottom: Spacing['2xl'],
  },
  newSessionButton: {
    backgroundColor: Colors.brand[600],
    borderRadius: BorderRadius.lg,
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.xl,
    ...Shadow.md,
  },
  newSessionButtonText: {
    color: Colors.white,
    fontSize: FontSize.base,
    fontFamily: 'Inter_600SemiBold',
  },

  // Error state
  errorContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing.xl,
    gap: Spacing.md,
  },
  errorTitle: {
    fontSize: FontSize.xl,
    fontFamily: 'Inter_700Bold',
    color: Colors.text.primary,
    textAlign: 'center',
  },
  errorMessage: {
    fontSize: FontSize.sm,
    color: Colors.text.secondary,
    fontFamily: 'Inter_400Regular',
    textAlign: 'center',
    lineHeight: FontSize.sm * 1.6,
  },
  retryButton: {
    backgroundColor: Colors.brand[600],
    borderRadius: BorderRadius.lg,
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.xl,
    marginTop: Spacing.sm,
  },
  retryButtonText: {
    color: Colors.white,
    fontSize: FontSize.base,
    fontFamily: 'Inter_600SemiBold',
  },
  backLinkButton: {
    paddingVertical: Spacing.sm,
  },
  backLinkText: {
    fontSize: FontSize.sm,
    color: Colors.gray[400],
    fontFamily: 'Inter_400Regular',
  },
});
