import { Audio } from 'expo-av';
import * as FileSystem from 'expo-file-system';
import { sessionApi } from './apiClient';

// ---------------------------------------------------------------------------
// STTService — Speech-to-text via expo-av + Whisper API
// Includes Voice Activity Detection (VAD): auto-stops on silence
// ---------------------------------------------------------------------------

const VAD_SILENCE_THRESHOLD_DB = -38;  // dB — below = silence
const VAD_SILENCE_DURATION_MS  = 1800; // stop after 1.8 s of silence
const VAD_MIN_SPEECH_MS        = 800;  // don't stop within first 800 ms

export class STTService {
  private recording: Audio.Recording | null = null;
  private isRecording = false;
  private recordingStartTime = 0;

  private onLevelChange: ((level: number) => void) | null = null;
  private onAutoStop: (() => void) | null = null;

  private vadEnabled = true;
  private silenceTimer: ReturnType<typeof setTimeout> | null = null;
  private hasSpeechStarted = false;

  // ── Permissions ─────────────────────────────────────────────────────────

  async requestPermissions(): Promise<boolean> {
    const { status } = await Audio.requestPermissionsAsync();
    return status === 'granted';
  }

  // ── Recording ────────────────────────────────────────────────────────────

  async startRecording(): Promise<void> {
    if (this.isRecording) return;

    const granted = await this.requestPermissions();
    if (!granted) throw new Error('Microphone permission not granted');

    await Audio.setAudioModeAsync({
      allowsRecordingIOS: true,
      playsInSilentModeIOS: true,
      staysActiveInBackground: false,
      shouldDuckAndroid: true,
    });

    this.silenceTimer = null;
    this.hasSpeechStarted = false;
    this.recordingStartTime = Date.now();

    const { recording } = await Audio.Recording.createAsync(
      {
        ...Audio.RecordingOptionsPresets.HIGH_QUALITY,
        android: {
          ...Audio.RecordingOptionsPresets.HIGH_QUALITY.android,
          extension: '.m4a',
          outputFormat: Audio.AndroidOutputFormat.MPEG_4,
          audioEncoder: Audio.AndroidAudioEncoder.AAC,
          sampleRate: 16000,
          numberOfChannels: 1,
          bitRate: 128000,
        },
        ios: {
          ...Audio.RecordingOptionsPresets.HIGH_QUALITY.ios,
          extension: '.m4a',
          outputFormat: Audio.IOSOutputFormat.MPEG4AAC,
          audioQuality: Audio.IOSAudioQuality.HIGH,
          sampleRate: 16000,
          numberOfChannels: 1,
          bitRate: 128000,
          linearPCMBitDepth: 16,
          linearPCMIsBigEndian: false,
          linearPCMIsFloat: false,
        },
        isMeteringEnabled: true,
      },
      (status) => {
        if (!status.isRecording) return;

        if (status.metering !== undefined) {
          // Normalise dB (-160..0) to 0..1 for waveform display
          const normalized = Math.max(0, (status.metering + 160) / 160);
          this.onLevelChange?.(normalized);

          // ── VAD ────────────────────────────────────────────────────────
          if (this.vadEnabled && this.onAutoStop) {
            const elapsed = Date.now() - this.recordingStartTime;

            if (status.metering > VAD_SILENCE_THRESHOLD_DB) {
              // Speech detected — cancel any pending silence timer
              this.hasSpeechStarted = true;
              this._clearSilenceTimer();
            } else if (this.hasSpeechStarted && elapsed >= VAD_MIN_SPEECH_MS) {
              // Silence after speech — start countdown
              if (!this.silenceTimer) {
                this.silenceTimer = setTimeout(() => {
                  this.silenceTimer = null;
                  if (this.isRecording) {
                    this.onAutoStop?.();
                  }
                }, VAD_SILENCE_DURATION_MS);
              }
            }
          }
        }
      },
      100, // metering update every 100 ms
    );

    this.recording = recording;
    this.isRecording = true;
  }

  async stopRecording(): Promise<string | null> {
    if (!this.isRecording || !this.recording) return null;

    this.isRecording = false;
    this._clearSilenceTimer();

    try {
      await this.recording.stopAndUnloadAsync();
    } catch (err) {
      console.warn('[STTService] Stop error:', err);
    }

    await Audio.setAudioModeAsync({
      allowsRecordingIOS: false,
      playsInSilentModeIOS: true,
    });

    const uri = this.recording.getURI();
    this.recording = null;
    if (!uri) return null;

    try {
      return await this._transcribeAudio(uri);
    } finally {
      FileSystem.deleteAsync(uri, { idempotent: true }).catch(console.warn);
    }
  }

  async cancelRecording(): Promise<void> {
    if (!this.isRecording || !this.recording) return;
    this.isRecording = false;
    this._clearSilenceTimer();
    try { await this.recording.stopAndUnloadAsync(); } catch {}
    const uri = this.recording.getURI();
    this.recording = null;
    if (uri) FileSystem.deleteAsync(uri, { idempotent: true }).catch(console.warn);
    await Audio.setAudioModeAsync({
      allowsRecordingIOS: false,
      playsInSilentModeIOS: true,
    });
  }

  // ── State ─────────────────────────────────────────────────────────────────

  getIsRecording(): boolean { return this.isRecording; }

  // ── Callbacks & config ────────────────────────────────────────────────────

  setLevelChangeCallback(cb: ((level: number) => void) | null): void {
    this.onLevelChange = cb;
  }

  /** Fires automatically when VAD detects end-of-speech silence */
  setAutoStopCallback(cb: (() => void) | null): void {
    this.onAutoStop = cb;
  }

  setVadEnabled(enabled: boolean): void {
    this.vadEnabled = enabled;
    if (!enabled) this._clearSilenceTimer();
  }

  isVadEnabled(): boolean { return this.vadEnabled; }

  // ── Private ───────────────────────────────────────────────────────────────

  private _clearSilenceTimer(): void {
    if (this.silenceTimer) {
      clearTimeout(this.silenceTimer);
      this.silenceTimer = null;
    }
  }

  private async _transcribeAudio(uri: string): Promise<string | null> {
    const base64 = await FileSystem.readAsStringAsync(uri, {
      encoding: FileSystem.EncodingType.Base64,
    });
    const response = await sessionApi.transcribe({
      audio_base64: base64,
      mime_type: 'audio/m4a',
    });
    return response.data.transcript ?? null;
  }
}

export const sttService = new STTService();
