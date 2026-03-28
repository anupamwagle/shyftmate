import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  ActivityIndicator,
  Linking,
} from 'react-native';
import { useRouter } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { StatusBar } from 'expo-status-bar';
import { authApi } from '../../src/services/apiClient';
import { useAuthStore } from '../../src/stores/authStore';
import { Colors, Spacing, FontSize, BorderRadius, Shadow } from '../../src/constants/theme';

export default function LoginScreen() {
  const router = useRouter();
  const { setOtpPending, setTokens } = useAuthStore();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleLogin = async () => {
    setError(null);

    if (!email.trim()) {
      setError('Please enter your email address.');
      return;
    }
    if (!password.trim()) {
      setError('Please enter your password.');
      return;
    }

    setIsLoading(true);
    try {
      const res = await authApi.login({ email: email.trim().toLowerCase(), password });
      // Store provisional token so OTP verify request can send it as Bearer
      await setTokens(res.data.access_token, res.data.refresh_token);
      setOtpPending(true);
      router.push({ pathname: '/(auth)/otp', params: { email: email.trim().toLowerCase() } });
    } catch (err: any) {
      const msg = err?.message ?? 'Login failed. Please check your credentials.';
      setError(msg);
    } finally {
      setIsLoading(false);
    }
  };

  const handleGoogleLogin = async () => {
    try {
      setIsLoading(true);
      setError(null);
      const res = await authApi.googleOAuth();
      const url = res.data?.url;
      if (url) {
        await Linking.openURL(url);
      }
    } catch (err: any) {
      setError('Google sign-in is unavailable. Please use email login.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleAppleLogin = () => {
    setError('Apple sign-in coming soon. Please use email login.');
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <StatusBar style="dark" />
      <ScrollView
        contentContainerStyle={styles.scroll}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* Logo / Brand */}
        <View style={styles.brandContainer}>
          <View style={styles.logoCircle}>
            <MaterialCommunityIcons
              name="robot-outline"
              size={40}
              color={Colors.white}
            />
          </View>
          <Text style={styles.brandName}>Gator</Text>
          <Text style={styles.brandTagline}>Award Rule Intelligence</Text>
        </View>

        {/* Card */}
        <View style={styles.card}>
          <Text style={styles.title}>Sign in</Text>
          <Text style={styles.subtitle}>
            Use your Gator BA account to continue
          </Text>

          {/* Error banner */}
          {error && (
            <View style={styles.errorBanner}>
              <MaterialCommunityIcons
                name="alert-circle-outline"
                size={16}
                color={Colors.red[600]}
              />
              <Text style={styles.errorText}>{error}</Text>
            </View>
          )}

          {/* Email field */}
          <View style={styles.fieldContainer}>
            <Text style={styles.label}>Email</Text>
            <View style={styles.inputWrapper}>
              <MaterialCommunityIcons
                name="email-outline"
                size={18}
                color={Colors.gray[400]}
                style={styles.inputIcon}
              />
              <TextInput
                style={styles.input}
                value={email}
                onChangeText={(t) => { setEmail(t); setError(null); }}
                placeholder="you@company.com"
                placeholderTextColor={Colors.gray[400]}
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
                autoComplete="email"
                textContentType="emailAddress"
                returnKeyType="next"
                editable={!isLoading}
              />
            </View>
          </View>

          {/* Password field */}
          <View style={styles.fieldContainer}>
            <Text style={styles.label}>Password</Text>
            <View style={styles.inputWrapper}>
              <MaterialCommunityIcons
                name="lock-outline"
                size={18}
                color={Colors.gray[400]}
                style={styles.inputIcon}
              />
              <TextInput
                style={[styles.input, { flex: 1 }]}
                value={password}
                onChangeText={(t) => { setPassword(t); setError(null); }}
                placeholder="••••••••"
                placeholderTextColor={Colors.gray[400]}
                secureTextEntry={!showPassword}
                autoCapitalize="none"
                autoCorrect={false}
                textContentType="password"
                returnKeyType="go"
                onSubmitEditing={handleLogin}
                editable={!isLoading}
              />
              <TouchableOpacity
                onPress={() => setShowPassword((v) => !v)}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <MaterialCommunityIcons
                  name={showPassword ? 'eye-off-outline' : 'eye-outline'}
                  size={18}
                  color={Colors.gray[400]}
                />
              </TouchableOpacity>
            </View>
          </View>

          {/* Continue button */}
          <TouchableOpacity
            style={[styles.primaryButton, isLoading && styles.buttonDisabled]}
            onPress={handleLogin}
            disabled={isLoading}
            activeOpacity={0.85}
          >
            {isLoading ? (
              <ActivityIndicator color={Colors.white} />
            ) : (
              <Text style={styles.primaryButtonText}>Continue</Text>
            )}
          </TouchableOpacity>

          {/* Divider */}
          <View style={styles.divider}>
            <View style={styles.dividerLine} />
            <Text style={styles.dividerText}>or</Text>
            <View style={styles.dividerLine} />
          </View>

          {/* Social buttons */}
          <TouchableOpacity
            style={styles.socialButton}
            onPress={handleGoogleLogin}
            disabled={isLoading}
            activeOpacity={0.85}
          >
            <MaterialCommunityIcons name="google" size={20} color={Colors.gray[700]} />
            <Text style={styles.socialButtonText}>Sign in with Google</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.socialButton, { marginTop: Spacing.sm }]}
            onPress={handleAppleLogin}
            disabled={isLoading}
            activeOpacity={0.85}
          >
            <MaterialCommunityIcons name="apple" size={20} color={Colors.gray[700]} />
            <Text style={styles.socialButtonText}>Sign in with Apple</Text>
          </TouchableOpacity>
        </View>

        <Text style={styles.footer}>
          Gator BA — For authorised personnel only
        </Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  scroll: {
    flexGrow: 1,
    justifyContent: 'center',
    padding: Spacing.lg,
  },
  brandContainer: {
    alignItems: 'center',
    marginBottom: Spacing['2xl'],
  },
  logoCircle: {
    width: 72,
    height: 72,
    borderRadius: 20,
    backgroundColor: Colors.brand[600],
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.md,
    ...Shadow.lg,
  },
  brandName: {
    fontSize: FontSize['3xl'],
    fontFamily: 'Inter_700Bold',
    color: Colors.text.primary,
    letterSpacing: -0.5,
  },
  brandTagline: {
    fontSize: FontSize.sm,
    color: Colors.text.secondary,
    fontFamily: 'Inter_400Regular',
    marginTop: 2,
  },
  card: {
    backgroundColor: Colors.white,
    borderRadius: BorderRadius['2xl'],
    padding: Spacing.xl,
    ...Shadow.md,
  },
  title: {
    fontSize: FontSize['2xl'],
    fontFamily: 'Inter_700Bold',
    color: Colors.text.primary,
    marginBottom: Spacing.xs,
  },
  subtitle: {
    fontSize: FontSize.sm,
    color: Colors.text.secondary,
    fontFamily: 'Inter_400Regular',
    marginBottom: Spacing.xl,
  },
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FEF2F2',
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
    marginBottom: Spacing.md,
    gap: Spacing.xs,
    borderWidth: 1,
    borderColor: '#FECACA',
  },
  errorText: {
    flex: 1,
    fontSize: FontSize.sm,
    color: Colors.red[600],
    fontFamily: 'Inter_400Regular',
  },
  fieldContainer: {
    marginBottom: Spacing.md,
  },
  label: {
    fontSize: FontSize.sm,
    fontFamily: 'Inter_500Medium',
    color: Colors.text.primary,
    marginBottom: Spacing.xs,
  },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: Colors.border,
    borderRadius: BorderRadius.lg,
    paddingHorizontal: Spacing.md,
    height: 48,
    backgroundColor: Colors.white,
  },
  inputIcon: {
    marginRight: Spacing.sm,
  },
  input: {
    flex: 1,
    fontSize: FontSize.base,
    color: Colors.text.primary,
    fontFamily: 'Inter_400Regular',
    height: '100%',
  },
  primaryButton: {
    backgroundColor: Colors.brand[600],
    borderRadius: BorderRadius.lg,
    height: 50,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: Spacing.sm,
    ...Shadow.md,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  primaryButtonText: {
    color: Colors.white,
    fontSize: FontSize.base,
    fontFamily: 'Inter_600SemiBold',
  },
  divider: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: Spacing.lg,
    gap: Spacing.sm,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: Colors.border,
  },
  dividerText: {
    fontSize: FontSize.sm,
    color: Colors.gray[400],
    fontFamily: 'Inter_400Regular',
  },
  socialButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: Colors.border,
    borderRadius: BorderRadius.lg,
    height: 48,
    gap: Spacing.sm,
    backgroundColor: Colors.white,
  },
  socialButtonText: {
    fontSize: FontSize.base,
    color: Colors.text.primary,
    fontFamily: 'Inter_500Medium',
  },
  footer: {
    textAlign: 'center',
    fontSize: FontSize.xs,
    color: Colors.gray[400],
    fontFamily: 'Inter_400Regular',
    marginTop: Spacing.xl,
  },
});
