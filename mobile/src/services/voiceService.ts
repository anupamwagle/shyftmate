import * as Speech from 'expo-speech';
import { Audio } from 'expo-av';
import * as FileSystem from 'expo-file-system';

// ---------------------------------------------------------------------------
// VoiceService — TTS with two modes:
//   1. API mode  — calls backend /chat/tts (OpenAI nova, natural female voice)
//   2. Device mode — expo-speech fallback (uses best device female voice)
// Automatically falls back to device if API call fails.
// ---------------------------------------------------------------------------

export class VoiceService {
  private selectedVoice: Speech.Voice | null = null;
  private enabled = true;
  private isSpeaking = false;
  private onSpeakingChange: ((speaking: boolean) => void) | null = null;
  private sound: Audio.Sound | null = null;

  private static FEMALE_KEYWORDS = [
    'female', 'woman', 'girl', 'olivia', 'samantha', 'karen', 'kate',
    'victoria', 'moira', 'fiona', 'veena', 'tessa', 'ava', 'allison',
    'susan', 'zoe', 'nova', 'shimmer',
  ];

  // ── Init ──────────────────────────────────────────────────────────────────

  async init(): Promise<void> {
    try {
      const voices = await Speech.getAvailableVoicesAsync();
      const female = this._filterFemaleVoices(voices);
      if (female.length > 0) {
        const enAU = female.find((v) => v.language?.toLowerCase().startsWith('en-au'));
        const enUS = female.find((v) => v.language?.toLowerCase().startsWith('en-us'));
        const en   = female.find((v) => v.language?.toLowerCase().startsWith('en'));
        this.selectedVoice = enAU ?? enUS ?? en ?? female[0];
      }
    } catch (err) {
      console.warn('[VoiceService] Could not load voices:', err);
    }
  }

  // ── Main speak — tries OpenAI API TTS, falls back to expo-speech ──────────

  async speak(text: string): Promise<void> {
    if (!this.enabled || !text.trim()) return;
    this.stop();

    this.isSpeaking = true;
    this.onSpeakingChange?.(true);

    try {
      await this._speakViaApi(text);
    } catch (err) {
      console.warn('[VoiceService] API TTS failed, using device voice:', err);
      try {
        await this._speakViaDevice(text);
      } catch (e2) {
        console.warn('[VoiceService] Device TTS also failed:', e2);
      }
    } finally {
      this.isSpeaking = false;
      this.onSpeakingChange?.(false);
    }
  }

  stop(): void {
    // Stop expo-av sound
    if (this.sound) {
      this.sound.stopAsync().catch(() => {});
      this.sound.unloadAsync().catch(() => {});
      this.sound = null;
    }
    // Stop expo-speech
    try { Speech.stop(); } catch {}
    if (this.isSpeaking) {
      this.isSpeaking = false;
      this.onSpeakingChange?.(false);
    }
  }

  // ── Config ────────────────────────────────────────────────────────────────

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    if (!enabled) this.stop();
  }

  isEnabled(): boolean { return this.enabled; }

  setVoice(voiceId: string): void {
    Speech.getAvailableVoicesAsync()
      .then((voices) => {
        const v = voices.find((v) => v.identifier === voiceId);
        if (v) this.selectedVoice = v;
      })
      .catch(console.error);
  }

  getSelectedVoice(): Speech.Voice | null { return this.selectedVoice; }

  setSpeakingChangeCallback(cb: ((speaking: boolean) => void) | null): void {
    this.onSpeakingChange = cb;
  }

  async getAvailableFemaleVoices(): Promise<Speech.Voice[]> {
    try {
      return this._filterFemaleVoices(await Speech.getAvailableVoicesAsync());
    } catch { return []; }
  }

  // ── OpenAI TTS via backend ────────────────────────────────────────────────

  private async _speakViaApi(text: string): Promise<void> {
    // Lazy-import to avoid circular dep at module load time
    const { apiClient } = await import('./apiClient');

    const res = await (apiClient as any).post<{ audio_base64: string }>(
      '/chat/tts',
      { text, voice: 'nova' },
    );

    const { audio_base64, format = 'mp3' } = res.data;
    const uri = (FileSystem.cacheDirectory ?? '') + `aria_${Date.now()}.${format}`;

    await FileSystem.writeAsStringAsync(uri, audio_base64, {
      encoding: FileSystem.EncodingType.Base64,
    });

    // Switch audio mode to playback
    await Audio.setAudioModeAsync({
      allowsRecordingIOS: false,
      playsInSilentModeIOS: true,
      staysActiveInBackground: false,
      shouldDuckAndroid: true,
    });

    const { sound } = await Audio.Sound.createAsync(
      { uri },
      { shouldPlay: true, volume: 1.0 },
    );
    this.sound = sound;

    // Wait until playback finishes
    await new Promise<void>((resolve) => {
      sound.setOnPlaybackStatusUpdate((status) => {
        if (!status.isLoaded) return;
        if (status.didJustFinish) resolve();
      });
    });

    try {
      await sound.unloadAsync();
      this.sound = null;
      await FileSystem.deleteAsync(uri, { idempotent: true });
    } catch {}
  }

  // ── Device TTS fallback (expo-speech) ────────────────────────────────────

  private async _speakViaDevice(text: string): Promise<void> {
    return new Promise((resolve) => {
      Speech.speak(text, {
        language: this.selectedVoice?.language ?? 'en-AU',
        voice:    this.selectedVoice?.identifier ?? undefined,
        rate:  0.95,
        pitch: 1.05,
        onDone:    resolve,
        onStopped: resolve,
        onError:   (err) => { console.warn('[VoiceService]', err); resolve(); },
      });
    });
  }

  private _filterFemaleVoices(voices: Speech.Voice[]): Speech.Voice[] {
    return voices.filter((v) => {
      const id   = (v.identifier ?? '').toLowerCase();
      const name = (v.name ?? '').toLowerCase();
      return VoiceService.FEMALE_KEYWORDS.some((kw) => id.includes(kw) || name.includes(kw));
    });
  }
}

export const voiceService = new VoiceService();
