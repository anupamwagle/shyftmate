import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Switch,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Alert,
  SafeAreaView,
  Platform,
} from 'react-native';
import { useRouter } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { StatusBar } from 'expo-status-bar';
import * as Speech from 'expo-speech';
import { voiceService } from '../../src/services/voiceService';
import { persistenceService } from '../../src/services/persistenceService';
import { useAuthStore } from '../../src/stores/authStore';
import {
  Colors,
  Spacing,
  FontSize,
  BorderRadius,
  Shadow,
} from '../../src/constants/theme';

export default function SettingsScreen() {
  const router = useRouter();
  const { user, logout } = useAuthStore();

  const [voiceEnabled, setVoiceEnabled]     = useState(true);
  const [femaleVoices, setFemaleVoices]     = useState<Speech.Voice[]>([]);
  const [selectedVoiceId, setSelectedVoiceId] = useState<string | null>(null);
  const [isLoadingVoices, setIsLoadingVoices] = useState(false);
  const [isSaving, setIsSaving]             = useState(false);
  const [saveSuccess, setSaveSuccess]       = useState(false);

  useEffect(() => {
    loadSettings();
    loadVoices();
  }, []);

  const loadSettings = async () => {
    const s = await persistenceService.loadSettings();
    setVoiceEnabled(s.voiceEnabled);
    setSelectedVoiceId(s.selectedVoiceId);
  };

  const loadVoices = async () => {
    setIsLoadingVoices(true);
    try {
      const voices = await voiceService.getAvailableFemaleVoices();
      setFemaleVoices(voices);
      const current = voiceService.getSelectedVoice();
      if (current) setSelectedVoiceId(current.identifier);
    } catch {
      // not critical
    } finally {
      setIsLoadingVoices(false);
    }
  };

  const handleVoiceToggle = (value: boolean) => {
    setVoiceEnabled(value);
    voiceService.setEnabled(value);
  };

  const handleVoiceSelect = (voiceId: string) => {
    setSelectedVoiceId(voiceId);
    voiceService.setVoice(voiceId);
    voiceService.speak("Hi, I'm Aria. How does this voice sound?").catch(console.warn);
  };

  const handleSave = async () => {
    setIsSaving(true);
    setSaveSuccess(false);
    try {
      await persistenceService.saveSettings({ voiceEnabled, selectedVoiceId });
      voiceService.setEnabled(voiceEnabled);
      if (selectedVoiceId) voiceService.setVoice(selectedVoiceId);
      setSaveSuccess(true);
      setTimeout(() => {
        setSaveSuccess(false);
        router.back();
      }, 800);
    } catch (err: any) {
      Alert.alert('Error', err?.message ?? 'Failed to save settings.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleLogout = () => {
    Alert.alert(
      'Sign Out',
      'Are you sure you want to sign out?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Sign Out',
          style: 'destructive',
          onPress: async () => {
            await logout();
            router.replace('/(auth)/login');
          },
        },
      ],
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar style="dark" />

      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => router.back()}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <MaterialCommunityIcons name="close" size={22} color={Colors.text.primary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Settings</Text>
        <TouchableOpacity onPress={handleSave} disabled={isSaving}>
          {isSaving ? (
            <ActivityIndicator size="small" color={Colors.brand[600]} />
          ) : saveSuccess ? (
            <MaterialCommunityIcons name="check" size={22} color={Colors.green[500]} />
          ) : (
            <Text style={styles.saveText}>Save</Text>
          )}
        </TouchableOpacity>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* User card */}
        {user && (
          <View style={styles.userCard}>
            <View style={styles.userAvatar}>
              <Text style={styles.userAvatarText}>
                {user.full_name?.charAt(0)?.toUpperCase() ?? 'U'}
              </Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.userName}>{user.full_name}</Text>
              <Text style={styles.userEmail}>{user.email}</Text>
              <Text style={styles.userRole}>{user.role}</Text>
            </View>
          </View>
        )}

        {/* ── Voice ───────────────────────────────────────────────────────── */}
        <SectionHeader title="Voice" icon="microphone-outline" />

        <View style={styles.card}>
          <SettingRow
            label="Voice Responses"
            description="Aria reads responses aloud using AI text-to-speech"
          >
            <Switch
              value={voiceEnabled}
              onValueChange={handleVoiceToggle}
              trackColor={{ false: Colors.gray[200], true: Colors.brand[400] }}
              thumbColor={voiceEnabled ? Colors.brand[600] : Colors.gray[400]}
            />
          </SettingRow>
        </View>

        {/* Info chips showing what's powering voice */}
        <View style={styles.infoRow}>
          <InfoChip icon="waveform" label="AI Voice" value="Kokoro (local)" />
          <InfoChip icon="microphone" label="Speech-to-text" value="Whisper (local)" />
        </View>

        {/* Fallback device voices — only shown when voice is enabled */}
        {voiceEnabled && (
          <View style={[styles.card, { marginTop: Spacing.sm }]}>
            <View style={styles.voiceListHeader}>
              <View style={{ flex: 1 }}>
                <Text style={styles.settingLabel}>Fallback Voice</Text>
                <Text style={styles.settingDescription}>
                  Used when the AI voice server is unreachable
                </Text>
              </View>
              {isLoadingVoices && (
                <ActivityIndicator size="small" color={Colors.brand[600]} />
              )}
            </View>

            {!isLoadingVoices && femaleVoices.length === 0 && (
              <Text style={styles.noVoicesText}>
                No device voices found — system default will be used.
              </Text>
            )}

            {femaleVoices.map((voice) => (
              <TouchableOpacity
                key={voice.identifier}
                style={[
                  styles.voiceOption,
                  selectedVoiceId === voice.identifier && styles.voiceOptionSelected,
                ]}
                onPress={() => handleVoiceSelect(voice.identifier)}
                activeOpacity={0.8}
              >
                <View style={styles.voiceOptionLeft}>
                  <MaterialCommunityIcons
                    name="account-voice"
                    size={18}
                    color={
                      selectedVoiceId === voice.identifier
                        ? Colors.brand[600]
                        : Colors.gray[500]
                    }
                  />
                  <View>
                    <Text
                      style={[
                        styles.voiceName,
                        selectedVoiceId === voice.identifier && styles.voiceNameSelected,
                      ]}
                    >
                      {voice.name}
                    </Text>
                    <Text style={styles.voiceLanguage}>{voice.language}</Text>
                  </View>
                </View>
                {selectedVoiceId === voice.identifier && (
                  <MaterialCommunityIcons
                    name="check-circle"
                    size={18}
                    color={Colors.brand[600]}
                  />
                )}
              </TouchableOpacity>
            ))}
          </View>
        )}

        {/* ── Account ─────────────────────────────────────────────────────── */}
        <SectionHeader title="Account" icon="account-outline" />

        <View style={styles.card}>
          <TouchableOpacity
            style={styles.logoutButton}
            onPress={handleLogout}
            activeOpacity={0.8}
          >
            <MaterialCommunityIcons name="logout" size={18} color={Colors.red[600]} />
            <Text style={styles.logoutText}>Sign Out</Text>
          </TouchableOpacity>
        </View>

        <View style={{ height: Spacing.xl }} />
      </ScrollView>
    </SafeAreaView>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function SectionHeader({ title, icon }: { title: string; icon: string }) {
  return (
    <View style={styles.sectionHeader}>
      <MaterialCommunityIcons name={icon as any} size={14} color={Colors.text.secondary} />
      <Text style={styles.sectionTitle}>{title.toUpperCase()}</Text>
    </View>
  );
}

function SettingRow({
  label,
  description,
  children,
}: {
  label: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <View style={styles.settingRow}>
      <View style={styles.settingRowLeft}>
        <Text style={styles.settingLabel}>{label}</Text>
        {description && <Text style={styles.settingDescription}>{description}</Text>}
      </View>
      {children}
    </View>
  );
}

function InfoChip({
  icon,
  label,
  value,
}: {
  icon: string;
  label: string;
  value: string;
}) {
  return (
    <View style={styles.infoChip}>
      <MaterialCommunityIcons name={icon as any} size={13} color={Colors.brand[600]} />
      <View>
        <Text style={styles.infoChipLabel}>{label}</Text>
        <Text style={styles.infoChipValue}>{value}</Text>
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
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    backgroundColor: Colors.white,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    ...Shadow.sm,
  },
  headerTitle: {
    fontSize: FontSize.lg,
    fontFamily: 'Inter_600SemiBold',
    color: Colors.text.primary,
  },
  saveText: {
    fontSize: FontSize.base,
    color: Colors.brand[600],
    fontFamily: 'Inter_600SemiBold',
  },
  scroll: { flex: 1 },
  scrollContent: { padding: Spacing.md },

  // User card
  userCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.white,
    borderRadius: BorderRadius.xl,
    padding: Spacing.md,
    marginBottom: Spacing.lg,
    gap: Spacing.md,
    ...Shadow.sm,
  },
  userAvatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: Colors.brand[600],
    alignItems: 'center',
    justifyContent: 'center',
  },
  userAvatarText: {
    color: Colors.white,
    fontSize: FontSize.xl,
    fontFamily: 'Inter_700Bold',
  },
  userName: {
    fontSize: FontSize.base,
    fontFamily: 'Inter_600SemiBold',
    color: Colors.text.primary,
  },
  userEmail: {
    fontSize: FontSize.sm,
    color: Colors.text.secondary,
    fontFamily: 'Inter_400Regular',
  },
  userRole: {
    fontSize: FontSize.xs,
    color: Colors.brand[600],
    fontFamily: 'Inter_500Medium',
    textTransform: 'capitalize',
    marginTop: 2,
  },

  // Section header
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    paddingHorizontal: Spacing.xs,
    marginBottom: Spacing.sm,
    marginTop: Spacing.lg,
  },
  sectionTitle: {
    fontSize: FontSize.xs,
    fontFamily: 'Inter_600SemiBold',
    color: Colors.text.secondary,
    letterSpacing: 0.8,
  },

  // Card
  card: {
    backgroundColor: Colors.white,
    borderRadius: BorderRadius.xl,
    padding: Spacing.md,
    ...Shadow.sm,
  },

  // Setting row
  settingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.md,
  },
  settingRowLeft: { flex: 1 },
  settingLabel: {
    fontSize: FontSize.base,
    fontFamily: 'Inter_500Medium',
    color: Colors.text.primary,
    marginBottom: 2,
  },
  settingDescription: {
    fontSize: FontSize.xs,
    fontFamily: 'Inter_400Regular',
    color: Colors.text.secondary,
    lineHeight: FontSize.xs * 1.5,
  },

  // Info chips row
  infoRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
    marginTop: Spacing.sm,
  },
  infoChip: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    backgroundColor: Colors.brand[50],
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    borderColor: Colors.brand[100],
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.sm,
  },
  infoChipLabel: {
    fontSize: 10,
    fontFamily: 'Inter_400Regular',
    color: Colors.text.secondary,
    lineHeight: 14,
  },
  infoChipValue: {
    fontSize: FontSize.xs,
    fontFamily: 'Inter_600SemiBold',
    color: Colors.brand[700],
    lineHeight: 16,
  },

  // Voice list
  voiceListHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginBottom: Spacing.sm,
  },
  noVoicesText: {
    fontSize: FontSize.sm,
    color: Colors.gray[400],
    fontFamily: 'Inter_400Regular',
    fontStyle: 'italic',
    paddingVertical: Spacing.sm,
  },
  voiceOption: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.sm,
    borderRadius: BorderRadius.lg,
    borderWidth: 1.5,
    borderColor: Colors.border,
    marginTop: Spacing.xs,
  },
  voiceOptionSelected: {
    borderColor: Colors.brand[500],
    backgroundColor: Colors.brand[50],
  },
  voiceOptionLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  voiceName: {
    fontSize: FontSize.sm,
    fontFamily: 'Inter_500Medium',
    color: Colors.text.primary,
  },
  voiceNameSelected: { color: Colors.brand[700] },
  voiceLanguage: {
    fontSize: FontSize.xs,
    color: Colors.text.secondary,
    fontFamily: 'Inter_400Regular',
  },

  // Logout
  logoutButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    paddingVertical: Spacing.xs,
  },
  logoutText: {
    fontSize: FontSize.base,
    color: Colors.red[600],
    fontFamily: 'Inter_500Medium',
  },
});
