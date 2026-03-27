import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Switch,
  TouchableOpacity,
  TextInput,
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

type LLMProvider = 'anthropic' | 'ollama';

export default function SettingsScreen() {
  const router = useRouter();
  const { user, logout } = useAuthStore();

  const [voiceEnabled, setVoiceEnabled] = useState(true);
  const [femaleVoices, setFemaleVoices] = useState<Speech.Voice[]>([]);
  const [selectedVoiceId, setSelectedVoiceId] = useState<string | null>(null);
  const [llmProvider, setLlmProvider] = useState<LLMProvider>('anthropic');
  const [ollamaUrl, setOllamaUrl] = useState('http://localhost:11434');
  const [isLoadingVoices, setIsLoadingVoices] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  // Load persisted settings on mount
  useEffect(() => {
    loadSettings();
    loadVoices();
  }, []);

  const loadSettings = async () => {
    const settings = await persistenceService.loadSettings();
    setVoiceEnabled(settings.voiceEnabled);
    setSelectedVoiceId(settings.selectedVoiceId);
    setLlmProvider(settings.llmProvider);
    setOllamaUrl(settings.ollamaUrl);
  };

  const loadVoices = async () => {
    setIsLoadingVoices(true);
    try {
      const voices = await voiceService.getAvailableFemaleVoices();
      setFemaleVoices(voices);
      const current = voiceService.getSelectedVoice();
      if (current) setSelectedVoiceId(current.identifier);
    } catch {
      // Voice loading failed — not critical
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

    // Preview selected voice
    voiceService.speak('Hello, I\'m your Gator AI assistant.').catch(console.warn);
  };

  const handleSave = async () => {
    setIsSaving(true);
    setSaveSuccess(false);

    try {
      await persistenceService.saveSettings({
        voiceEnabled,
        selectedVoiceId,
        llmProvider,
        ollamaUrl: llmProvider === 'ollama' ? ollamaUrl : undefined,
      });

      voiceService.setEnabled(voiceEnabled);
      if (selectedVoiceId) {
        voiceService.setVoice(selectedVoiceId);
      }

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
          <MaterialCommunityIcons
            name="close"
            size={22}
            color={Colors.text.primary}
          />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Settings</Text>
        <TouchableOpacity
          onPress={handleSave}
          disabled={isSaving}
        >
          {isSaving ? (
            <ActivityIndicator size="small" color={Colors.brand[600]} />
          ) : saveSuccess ? (
            <MaterialCommunityIcons
              name="check"
              size={22}
              color={Colors.green[500]}
            />
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
        {/* User info */}
        {user && (
          <View style={styles.userCard}>
            <View style={styles.userAvatar}>
              <Text style={styles.userAvatarText}>
                {user.full_name?.charAt(0)?.toUpperCase() ?? 'U'}
              </Text>
            </View>
            <View>
              <Text style={styles.userName}>{user.full_name}</Text>
              <Text style={styles.userEmail}>{user.email}</Text>
              <Text style={styles.userRole}>{user.role}</Text>
            </View>
          </View>
        )}

        {/* Voice section */}
        <SectionHeader title="Voice" icon="microphone-outline" />

        <View style={styles.card}>
          <SettingRow
            label="Voice Responses"
            description="AI reads responses aloud using text-to-speech"
          >
            <Switch
              value={voiceEnabled}
              onValueChange={handleVoiceToggle}
              trackColor={{ false: Colors.gray[200], true: Colors.brand[400] }}
              thumbColor={voiceEnabled ? Colors.brand[600] : Colors.gray[400]}
            />
          </SettingRow>
        </View>

        {voiceEnabled && (
          <View style={[styles.card, { marginTop: Spacing.xs }]}>
            <View style={styles.voiceListHeader}>
              <Text style={styles.settingLabel}>Voice Selection</Text>
              {isLoadingVoices && (
                <ActivityIndicator size="small" color={Colors.brand[600]} />
              )}
            </View>
            <Text style={styles.settingDescription}>
              Female voices available on this device
            </Text>

            {!isLoadingVoices && femaleVoices.length === 0 && (
              <Text style={styles.noVoicesText}>
                No female voices found. The system default will be used.
              </Text>
            )}

            {femaleVoices.map((voice) => (
              <TouchableOpacity
                key={voice.identifier}
                style={[
                  styles.voiceOption,
                  selectedVoiceId === voice.identifier &&
                    styles.voiceOptionSelected,
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
                        selectedVoiceId === voice.identifier &&
                          styles.voiceNameSelected,
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

        {/* LLM Provider section */}
        <SectionHeader title="AI Provider" icon="brain" />

        <View style={styles.card}>
          <Text style={styles.settingLabel}>Language Model</Text>
          <Text style={styles.settingDescription}>
            Select the AI provider for conversation intelligence
          </Text>

          <View style={styles.providerOptions}>
            <ProviderOption
              id="anthropic"
              label="Anthropic Cloud"
              description="Claude (requires internet)"
              icon="cloud-outline"
              selected={llmProvider === 'anthropic'}
              onSelect={() => setLlmProvider('anthropic')}
            />
            <ProviderOption
              id="ollama"
              label="Ollama Local"
              description="Run models on your server"
              icon="server-outline"
              selected={llmProvider === 'ollama'}
              onSelect={() => setLlmProvider('ollama')}
            />
          </View>

          {llmProvider === 'ollama' && (
            <View style={styles.ollamaUrlContainer}>
              <Text style={styles.ollamaUrlLabel}>Ollama Server URL</Text>
              <View style={styles.ollamaUrlInput}>
                <MaterialCommunityIcons
                  name="link-variant"
                  size={16}
                  color={Colors.gray[400]}
                  style={{ marginRight: Spacing.xs }}
                />
                <TextInput
                  style={styles.urlInput}
                  value={ollamaUrl}
                  onChangeText={setOllamaUrl}
                  placeholder="http://localhost:11434"
                  placeholderTextColor={Colors.gray[400]}
                  keyboardType="url"
                  autoCapitalize="none"
                  autoCorrect={false}
                />
              </View>
            </View>
          )}
        </View>

        {/* Danger zone */}
        <SectionHeader title="Account" icon="account-outline" />

        <View style={styles.card}>
          <TouchableOpacity
            style={styles.logoutButton}
            onPress={handleLogout}
            activeOpacity={0.8}
          >
            <MaterialCommunityIcons
              name="logout"
              size={18}
              color={Colors.red[600]}
            />
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

function SectionHeader({
  title,
  icon,
}: {
  title: string;
  icon: string;
}) {
  return (
    <View style={styles.sectionHeader}>
      <MaterialCommunityIcons
        name={icon as any}
        size={14}
        color={Colors.text.secondary}
      />
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
        {description && (
          <Text style={styles.settingDescription}>{description}</Text>
        )}
      </View>
      {children}
    </View>
  );
}

interface ProviderOptionProps {
  id: string;
  label: string;
  description: string;
  icon: string;
  selected: boolean;
  onSelect: () => void;
}

function ProviderOption({
  label,
  description,
  icon,
  selected,
  onSelect,
}: ProviderOptionProps) {
  return (
    <TouchableOpacity
      style={[styles.providerOption, selected && styles.providerOptionSelected]}
      onPress={onSelect}
      activeOpacity={0.8}
    >
      <View
        style={[
          styles.providerIconCircle,
          selected && styles.providerIconCircleSelected,
        ]}
      >
        <MaterialCommunityIcons
          name={icon as any}
          size={20}
          color={selected ? Colors.brand[600] : Colors.gray[500]}
        />
      </View>
      <View style={styles.providerTextContainer}>
        <Text
          style={[
            styles.providerLabel,
            selected && styles.providerLabelSelected,
          ]}
        >
          {label}
        </Text>
        <Text style={styles.providerDescription}>{description}</Text>
      </View>
      {selected && (
        <MaterialCommunityIcons
          name="check-circle"
          size={18}
          color={Colors.brand[600]}
        />
      )}
    </TouchableOpacity>
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
  scroll: {
    flex: 1,
  },
  scrollContent: {
    padding: Spacing.md,
  },

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

  // Section
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
  settingRowLeft: {
    flex: 1,
  },
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
    marginBottom: Spacing.sm,
  },

  // Voice list
  voiceListHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 2,
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
    marginTop: Spacing.sm,
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
  voiceNameSelected: {
    color: Colors.brand[700],
  },
  voiceLanguage: {
    fontSize: FontSize.xs,
    color: Colors.text.secondary,
    fontFamily: 'Inter_400Regular',
  },

  // Provider options
  providerOptions: {
    gap: Spacing.sm,
    marginTop: Spacing.sm,
  },
  providerOption: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: Colors.border,
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
    gap: Spacing.md,
  },
  providerOptionSelected: {
    borderColor: Colors.brand[500],
    backgroundColor: Colors.brand[50],
  },
  providerIconCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: Colors.gray[100],
    alignItems: 'center',
    justifyContent: 'center',
  },
  providerIconCircleSelected: {
    backgroundColor: Colors.brand[100],
  },
  providerTextContainer: {
    flex: 1,
  },
  providerLabel: {
    fontSize: FontSize.base,
    fontFamily: 'Inter_500Medium',
    color: Colors.text.primary,
  },
  providerLabelSelected: {
    color: Colors.brand[700],
    fontFamily: 'Inter_600SemiBold',
  },
  providerDescription: {
    fontSize: FontSize.xs,
    color: Colors.text.secondary,
    fontFamily: 'Inter_400Regular',
    marginTop: 1,
  },

  // Ollama URL
  ollamaUrlContainer: {
    marginTop: Spacing.md,
    paddingTop: Spacing.md,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
  ollamaUrlLabel: {
    fontSize: FontSize.sm,
    fontFamily: 'Inter_500Medium',
    color: Colors.text.primary,
    marginBottom: Spacing.xs,
  },
  ollamaUrlInput: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: Colors.border,
    borderRadius: BorderRadius.lg,
    paddingHorizontal: Spacing.md,
    height: 44,
    backgroundColor: Colors.white,
  },
  urlInput: {
    flex: 1,
    fontSize: FontSize.sm,
    color: Colors.text.primary,
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
