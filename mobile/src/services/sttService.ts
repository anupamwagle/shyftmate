import { Audio } from 'expo-av';
import * as FileSystem from 'expo-file-system';
import { sessionApi } from './apiClient';

// ---------------------------------------------------------------------------
// STTService — Speech-to-text via expo-av recording + backend Whisper API
// ---------------------------------------------------------------------------

export class STTService {
  private recording: Audio.Recording | null = null;
  private isRecording: boolean = false;
  private onLevelChange: ((level: number) => void) | null = null;
  private levelInterval: ReturnType<typeof setInterval> | null = null;

  async requestPermissions(): Promise<boolean> {
    const { status } = await Audio.requestPermissionsAsync();
    return status === 'granted';
  }

  async startRecording(): Promise<void> {
    if (this.isRecording) return;

    const granted = await this.requestPermissions();
    if (!granted) {
      throw new Error('Microphone permission not granted');
    }

    // Configure audio mode for recording
    await Audio.setAudioModeAsync({
      allowsRecordingIOS: true,
      playsInSilentModeIOS: true,
      staysActiveInBackground: false,
      shouldDuckAndroid: true,
    });

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
        if (status.isRecording && status.metering !== undefined) {
          // Normalize metering from dB (-160 to 0) to 0–1
          const normalized = Math.max(0, (status.metering + 160) / 160);
          this.onLevelChange?.(normalized);
        }
      },
      100, // Update interval ms
    );

    this.recording = recording;
    this.isRecording = true;
  }

  async stopRecording(): Promise<string | null> {
    if (!this.isRecording || !this.recording) return null;

    this.isRecording = false;
    this.clearLevelInterval();

    try {
      await this.recording.stopAndUnloadAsync();
    } catch (err) {
      console.warn('[STTService] Error stopping recording:', err);
    }

    // Restore audio mode to playback
    await Audio.setAudioModeAsync({
      allowsRecordingIOS: false,
      playsInSilentModeIOS: true,
    });

    const uri = this.recording.getURI();
    this.recording = null;

    if (!uri) return null;

    try {
      return await this.transcribeAudio(uri);
    } finally {
      // Clean up temporary file
      FileSystem.deleteAsync(uri, { idempotent: true }).catch(console.warn);
    }
  }

  async cancelRecording(): Promise<void> {
    if (!this.isRecording || !this.recording) return;

    this.isRecording = false;
    this.clearLevelInterval();

    try {
      await this.recording.stopAndUnloadAsync();
    } catch {}

    const uri = this.recording.getURI();
    this.recording = null;

    if (uri) {
      FileSystem.deleteAsync(uri, { idempotent: true }).catch(console.warn);
    }

    await Audio.setAudioModeAsync({
      allowsRecordingIOS: false,
      playsInSilentModeIOS: true,
    });
  }

  getIsRecording(): boolean {
    return this.isRecording;
  }

  setLevelChangeCallback(cb: ((level: number) => void) | null): void {
    this.onLevelChange = cb;
  }

  private async transcribeAudio(uri: string): Promise<string | null> {
    try {
      // Read file as base64
      const base64 = await FileSystem.readAsStringAsync(uri, {
        encoding: FileSystem.EncodingType.Base64,
      });

      const response = await sessionApi.transcribe({
        audio_base64: base64,
        mime_type: 'audio/m4a',
      });

      return response.data.transcript ?? null;
    } catch (err) {
      console.error('[STTService] Transcription failed:', err);
      throw err;
    }
  }

  private clearLevelInterval(): void {
    if (this.levelInterval) {
      clearInterval(this.levelInterval);
      this.levelInterval = null;
    }
  }
}

// Singleton instance
export const sttService = new STTService();
