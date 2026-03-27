import AsyncStorage from '@react-native-async-storage/async-storage';
import { ChatMessage } from './apiClient';

// ---------------------------------------------------------------------------
// PersistenceService — AsyncStorage + server reconciliation
// ---------------------------------------------------------------------------

const KEYS = {
  activeSession: 'gator_active_session_id',
  sessionState: (id: string) => `gator_session_state_${id}`,
  conversationMode: 'gator_conversation_mode',
  voiceEnabled: 'gator_voice_enabled',
  selectedVoiceId: 'gator_selected_voice_id',
  llmProvider: 'gator_llm_provider',
  ollamaUrl: 'gator_ollama_url',
};

export interface PersistedSessionState {
  sessionId: string;
  currentNode: string;
  messages: ChatMessage[];
  extractedData: Record<string, unknown>;
  lastUpdated: string;
}

export interface PersistedSettings {
  voiceEnabled: boolean;
  selectedVoiceId: string | null;
  llmProvider: 'anthropic' | 'ollama';
  ollamaUrl: string;
  conversationMode: 'voice' | 'chat';
}

class PersistenceService {
  // ---------------------------------------------------------------------------
  // Session state
  // ---------------------------------------------------------------------------

  async saveSessionState(state: PersistedSessionState): Promise<void> {
    try {
      const json = JSON.stringify({ ...state, lastUpdated: new Date().toISOString() });
      await AsyncStorage.setItem(KEYS.sessionState(state.sessionId), json);
      await AsyncStorage.setItem(KEYS.activeSession, state.sessionId);
    } catch (err) {
      console.warn('[PersistenceService] Failed to save session state:', err);
    }
  }

  async loadSessionState(
    sessionId: string,
  ): Promise<PersistedSessionState | null> {
    try {
      const json = await AsyncStorage.getItem(KEYS.sessionState(sessionId));
      if (!json) return null;
      return JSON.parse(json) as PersistedSessionState;
    } catch {
      return null;
    }
  }

  async getActiveSessionId(): Promise<string | null> {
    try {
      return await AsyncStorage.getItem(KEYS.activeSession);
    } catch {
      return null;
    }
  }

  async clearActiveSession(): Promise<void> {
    try {
      const id = await this.getActiveSessionId();
      if (id) {
        await AsyncStorage.removeItem(KEYS.sessionState(id));
      }
      await AsyncStorage.removeItem(KEYS.activeSession);
    } catch (err) {
      console.warn('[PersistenceService] Failed to clear session:', err);
    }
  }

  async appendMessage(
    sessionId: string,
    message: ChatMessage,
  ): Promise<void> {
    const state = await this.loadSessionState(sessionId);
    if (state) {
      state.messages = [...state.messages, message];
      state.lastUpdated = new Date().toISOString();
      await this.saveSessionState(state);
    }
  }

  // ---------------------------------------------------------------------------
  // Settings
  // ---------------------------------------------------------------------------

  async saveSettings(settings: Partial<PersistedSettings>): Promise<void> {
    const ops: Promise<void>[] = [];

    if (settings.voiceEnabled !== undefined) {
      ops.push(
        AsyncStorage.setItem(
          KEYS.voiceEnabled,
          String(settings.voiceEnabled),
        ),
      );
    }
    if (settings.selectedVoiceId !== undefined) {
      ops.push(
        AsyncStorage.setItem(
          KEYS.selectedVoiceId,
          settings.selectedVoiceId ?? '',
        ),
      );
    }
    if (settings.llmProvider !== undefined) {
      ops.push(
        AsyncStorage.setItem(KEYS.llmProvider, settings.llmProvider),
      );
    }
    if (settings.ollamaUrl !== undefined) {
      ops.push(AsyncStorage.setItem(KEYS.ollamaUrl, settings.ollamaUrl));
    }
    if (settings.conversationMode !== undefined) {
      ops.push(
        AsyncStorage.setItem(
          KEYS.conversationMode,
          settings.conversationMode,
        ),
      );
    }

    await Promise.all(ops);
  }

  async loadSettings(): Promise<PersistedSettings> {
    try {
      const [
        voiceEnabledStr,
        selectedVoiceId,
        llmProvider,
        ollamaUrl,
        conversationMode,
      ] = await Promise.all([
        AsyncStorage.getItem(KEYS.voiceEnabled),
        AsyncStorage.getItem(KEYS.selectedVoiceId),
        AsyncStorage.getItem(KEYS.llmProvider),
        AsyncStorage.getItem(KEYS.ollamaUrl),
        AsyncStorage.getItem(KEYS.conversationMode),
      ]);

      return {
        voiceEnabled: voiceEnabledStr !== 'false',
        selectedVoiceId: selectedVoiceId || null,
        llmProvider:
          (llmProvider as 'anthropic' | 'ollama') ?? 'anthropic',
        ollamaUrl: ollamaUrl ?? 'http://localhost:11434',
        conversationMode:
          (conversationMode as 'voice' | 'chat') ?? 'voice',
      };
    } catch {
      return {
        voiceEnabled: true,
        selectedVoiceId: null,
        llmProvider: 'anthropic',
        ollamaUrl: 'http://localhost:11434',
        conversationMode: 'voice',
      };
    }
  }

  // ---------------------------------------------------------------------------
  // App state reconciliation — merge local + server state
  // ---------------------------------------------------------------------------

  reconcileMessages(
    local: ChatMessage[],
    server: ChatMessage[],
  ): ChatMessage[] {
    // Server is source of truth for historical messages.
    // Append any local messages that aren't in server (optimistic updates).
    const serverTimestamps = new Set(server.map((m) => m.timestamp));
    const localOnly = local.filter((m) => !serverTimestamps.has(m.timestamp));
    return [...server, ...localOnly];
  }
}

export const persistenceService = new PersistenceService();
