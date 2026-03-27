import * as Speech from 'expo-speech';

// ---------------------------------------------------------------------------
// VoiceService — TTS using expo-speech with female voice preference
// ---------------------------------------------------------------------------

export class VoiceService {
  private selectedVoice: Speech.Voice | null = null;
  private enabled: boolean = true;
  private isSpeaking: boolean = false;
  private onSpeakingChange: ((speaking: boolean) => void) | null = null;

  // Priority keywords for female voice selection (order matters)
  private static FEMALE_KEYWORDS = [
    'female',
    'woman',
    'girl',
    'olivia',
    'samantha',
    'karen',
    'kate',
    'victoria',
    'moira',
    'fiona',
    'veena',
    'tessa',
    'ava',
    'allison',
    'susan',
    'zoe',
  ];

  async init(): Promise<void> {
    try {
      const voices = await Speech.getAvailableVoicesAsync();
      const femaleVoices = this.filterFemaleVoices(voices);
      if (femaleVoices.length > 0) {
        // Prefer en-AU first (matching backend Olivia voice), then en-US
        const enAU = femaleVoices.find((v) =>
          v.language?.toLowerCase().startsWith('en-au'),
        );
        const enUS = femaleVoices.find((v) =>
          v.language?.toLowerCase().startsWith('en-us'),
        );
        const en = femaleVoices.find((v) =>
          v.language?.toLowerCase().startsWith('en'),
        );
        this.selectedVoice = enAU ?? enUS ?? en ?? femaleVoices[0];
      }
    } catch (err) {
      console.warn('[VoiceService] Could not load voices:', err);
    }
  }

  async speak(text: string): Promise<void> {
    if (!this.enabled || !text.trim()) return;

    // Stop any current speech
    this.stop();

    return new Promise((resolve) => {
      this.isSpeaking = true;
      this.onSpeakingChange?.(true);

      const options: Speech.SpeechOptions = {
        language: this.selectedVoice?.language ?? 'en-AU',
        voice: this.selectedVoice?.identifier ?? undefined,
        rate: 0.95,
        pitch: 1.05,
        onDone: () => {
          this.isSpeaking = false;
          this.onSpeakingChange?.(false);
          resolve();
        },
        onStopped: () => {
          this.isSpeaking = false;
          this.onSpeakingChange?.(false);
          resolve();
        },
        onError: (err) => {
          console.warn('[VoiceService] Speech error:', err);
          this.isSpeaking = false;
          this.onSpeakingChange?.(false);
          resolve();
        },
      };

      Speech.speak(text, options);
    });
  }

  stop(): void {
    if (this.isSpeaking) {
      Speech.stop();
      this.isSpeaking = false;
      this.onSpeakingChange?.(false);
    }
  }

  async getAvailableFemaleVoices(): Promise<Speech.Voice[]> {
    try {
      const voices = await Speech.getAvailableVoicesAsync();
      return this.filterFemaleVoices(voices);
    } catch {
      return [];
    }
  }

  setVoice(voiceId: string): void {
    Speech.getAvailableVoicesAsync()
      .then((voices) => {
        const voice = voices.find((v) => v.identifier === voiceId);
        if (voice) this.selectedVoice = voice;
      })
      .catch(console.error);
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    if (!enabled) this.stop();
  }

  isEnabled(): boolean {
    return this.enabled;
  }

  getSelectedVoice(): Speech.Voice | null {
    return this.selectedVoice;
  }

  setSpeakingChangeCallback(
    cb: ((speaking: boolean) => void) | null,
  ): void {
    this.onSpeakingChange = cb;
  }

  private filterFemaleVoices(voices: Speech.Voice[]): Speech.Voice[] {
    return voices.filter((v) => {
      const id = (v.identifier ?? '').toLowerCase();
      const name = (v.name ?? '').toLowerCase();
      return VoiceService.FEMALE_KEYWORDS.some(
        (keyword) => id.includes(keyword) || name.includes(keyword),
      );
    });
  }
}

// Singleton instance
export const voiceService = new VoiceService();
