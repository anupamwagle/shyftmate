import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { StatusBar } from 'expo-status-bar';
import { authApi } from '../../src/services/apiClient';
import { useAuthStore } from '../../src/stores/authStore';
import { Colors, Spacing, FontSize, BorderRadius, Shadow } from '../../src/constants/theme';

const OTP_LENGTH = 6;
const OTP_EXPIRE_SECONDS = 600; // 10 minutes

export default function OtpScreen() {
  const router = useRouter();
  const { email } = useLocalSearchParams<{ email: string }>();
  const { setTokens, setUser, setOtpPending } = useAuthStore();

  const [otp, setOtp] = useState<string[]>(Array(OTP_LENGTH).fill(''));
  const [isLoading, setIsLoading] = useState(false);
  const [isResending, setIsResending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [secondsLeft, setSecondsLeft] = useState(OTP_EXPIRE_SECONDS);

  const inputRefs = useRef<Array<TextInput | null>>(
    Array(OTP_LENGTH).fill(null),
  );

  // Countdown timer
  useEffect(() => {
    const interval = setInterval(() => {
      setSecondsLeft((s) => {
        if (s <= 1) {
          clearInterval(interval);
          return 0;
        }
        return s - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  const formatTimer = (seconds: number): string => {
    const m = Math.floor(seconds / 60)
      .toString()
      .padStart(2, '0');
    const s = (seconds % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  };

  const handleOtpChange = (value: string, index: number) => {
    setError(null);

    // Handle paste of full code
    if (value.length === OTP_LENGTH) {
      const chars = value.slice(0, OTP_LENGTH).split('');
      setOtp(chars);
      inputRefs.current[OTP_LENGTH - 1]?.focus();
      return;
    }

    const char = value.slice(-1);
    const newOtp = [...otp];
    newOtp[index] = char;
    setOtp(newOtp);

    // Auto-advance
    if (char && index < OTP_LENGTH - 1) {
      inputRefs.current[index + 1]?.focus();
    }
  };

  const handleKeyPress = (key: string, index: number) => {
    if (key === 'Backspace') {
      if (otp[index]) {
        const newOtp = [...otp];
        newOtp[index] = '';
        setOtp(newOtp);
      } else if (index > 0) {
        const newOtp = [...otp];
        newOtp[index - 1] = '';
        setOtp(newOtp);
        inputRefs.current[index - 1]?.focus();
      }
    }
  };

  const handleVerify = useCallback(async () => {
    const code = otp.join('');
    if (code.length !== OTP_LENGTH) {
      setError('Please enter the complete 6-digit code.');
      return;
    }

    if (secondsLeft === 0) {
      setError('Code expired. Please request a new one.');
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const res = await authApi.verifyOtp({ email: email!, code });
      const { access_token, refresh_token } = res.data;
      await setTokens(access_token, refresh_token);

      // Fetch user profile
      const { apiClient } = await import('../../src/services/apiClient');
      const userRes = await apiClient.get('/auth/me');
      setUser(userRes.data);
      setOtpPending(false);

      router.replace('/(app)');
    } catch (err: any) {
      setError(err?.message ?? 'Invalid or expired code. Please try again.');
      // Clear OTP inputs on error
      setOtp(Array(OTP_LENGTH).fill(''));
      inputRefs.current[0]?.focus();
    } finally {
      setIsLoading(false);
    }
  }, [otp, email, secondsLeft]);

  // Auto-verify when all digits entered
  useEffect(() => {
    const code = otp.join('');
    if (code.length === OTP_LENGTH && !otp.includes('')) {
      handleVerify();
    }
  }, [otp]);

  const handleResend = async () => {
    if (isResending) return;
    setIsResending(true);
    setError(null);
    setSuccess(null);

    try {
      await authApi.resendOtp(email!);
      setSecondsLeft(OTP_EXPIRE_SECONDS);
      setOtp(Array(OTP_LENGTH).fill(''));
      inputRefs.current[0]?.focus();
      setSuccess('A new code has been sent to your email.');
    } catch (err: any) {
      setError(err?.message ?? 'Failed to resend code. Please try again.');
    } finally {
      setIsResending(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <StatusBar style="dark" />

      {/* Back button */}
      <TouchableOpacity
        style={styles.backButton}
        onPress={() => router.back()}
        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
      >
        <MaterialCommunityIcons
          name="arrow-left"
          size={24}
          color={Colors.text.primary}
        />
      </TouchableOpacity>

      <View style={styles.content}>
        {/* Icon */}
        <View style={styles.iconCircle}>
          <MaterialCommunityIcons
            name="email-check-outline"
            size={36}
            color={Colors.brand[600]}
          />
        </View>

        <Text style={styles.title}>Check your email</Text>
        <Text style={styles.subtitle}>
          We sent a 6-digit verification code to
        </Text>
        <Text style={styles.email}>{email}</Text>

        {/* Timer */}
        <View
          style={[
            styles.timerBadge,
            secondsLeft === 0 && styles.timerBadgeExpired,
          ]}
        >
          <MaterialCommunityIcons
            name="clock-outline"
            size={14}
            color={
              secondsLeft === 0 ? Colors.red[600] : Colors.brand[600]
            }
          />
          <Text
            style={[
              styles.timerText,
              secondsLeft === 0 && styles.timerTextExpired,
            ]}
          >
            {secondsLeft === 0 ? 'Code expired' : `Expires in ${formatTimer(secondsLeft)}`}
          </Text>
        </View>

        {/* Error / Success */}
        {error && (
          <View style={styles.errorBanner}>
            <MaterialCommunityIcons
              name="alert-circle-outline"
              size={15}
              color={Colors.red[600]}
            />
            <Text style={styles.errorText}>{error}</Text>
          </View>
        )}
        {success && (
          <View style={styles.successBanner}>
            <MaterialCommunityIcons
              name="check-circle-outline"
              size={15}
              color={Colors.green[500]}
            />
            <Text style={styles.successText}>{success}</Text>
          </View>
        )}

        {/* OTP inputs */}
        <View style={styles.otpRow}>
          {Array(OTP_LENGTH)
            .fill(null)
            .map((_, i) => (
              <TextInput
                key={i}
                ref={(ref) => {
                  inputRefs.current[i] = ref;
                }}
                style={[
                  styles.otpInput,
                  otp[i] ? styles.otpInputFilled : null,
                  error ? styles.otpInputError : null,
                ]}
                value={otp[i]}
                onChangeText={(v) => handleOtpChange(v, i)}
                onKeyPress={({ nativeEvent }) =>
                  handleKeyPress(nativeEvent.key, i)
                }
                keyboardType="number-pad"
                maxLength={OTP_LENGTH}
                textAlign="center"
                selectTextOnFocus
                editable={!isLoading}
                autoFocus={i === 0}
              />
            ))}
        </View>

        {/* Verify button */}
        <TouchableOpacity
          style={[
            styles.verifyButton,
            (isLoading || otp.join('').length < OTP_LENGTH) &&
              styles.buttonDisabled,
          ]}
          onPress={handleVerify}
          disabled={isLoading || otp.join('').length < OTP_LENGTH}
          activeOpacity={0.85}
        >
          {isLoading ? (
            <ActivityIndicator color={Colors.white} />
          ) : (
            <Text style={styles.verifyButtonText}>Verify Code</Text>
          )}
        </TouchableOpacity>

        {/* Resend */}
        <View style={styles.resendRow}>
          <Text style={styles.resendHint}>Didn't receive the code?</Text>
          <TouchableOpacity onPress={handleResend} disabled={isResending}>
            {isResending ? (
              <ActivityIndicator
                size="small"
                color={Colors.brand[600]}
                style={{ marginLeft: 6 }}
              />
            ) : (
              <Text style={styles.resendLink}>Resend</Text>
            )}
          </TouchableOpacity>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  backButton: {
    position: 'absolute',
    top: 56,
    left: Spacing.lg,
    zIndex: 10,
  },
  content: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.xl,
  },
  iconCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: Colors.brand[50],
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.xl,
    borderWidth: 2,
    borderColor: Colors.brand[100],
  },
  title: {
    fontSize: FontSize['2xl'],
    fontFamily: 'Inter_700Bold',
    color: Colors.text.primary,
    marginBottom: Spacing.sm,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: FontSize.base,
    color: Colors.text.secondary,
    fontFamily: 'Inter_400Regular',
    textAlign: 'center',
  },
  email: {
    fontSize: FontSize.base,
    color: Colors.brand[600],
    fontFamily: 'Inter_600SemiBold',
    textAlign: 'center',
    marginBottom: Spacing.lg,
  },
  timerBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.brand[50],
    borderRadius: BorderRadius.full,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    gap: 5,
    marginBottom: Spacing.lg,
  },
  timerBadgeExpired: {
    backgroundColor: '#FEF2F2',
  },
  timerText: {
    fontSize: FontSize.sm,
    color: Colors.brand[600],
    fontFamily: 'Inter_500Medium',
  },
  timerTextExpired: {
    color: Colors.red[600],
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
    width: '100%',
  },
  errorText: {
    flex: 1,
    fontSize: FontSize.sm,
    color: Colors.red[600],
    fontFamily: 'Inter_400Regular',
  },
  successBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F0FDF4',
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
    marginBottom: Spacing.md,
    gap: Spacing.xs,
    borderWidth: 1,
    borderColor: '#BBF7D0',
    width: '100%',
  },
  successText: {
    flex: 1,
    fontSize: FontSize.sm,
    color: '#15803D',
    fontFamily: 'Inter_400Regular',
  },
  otpRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
    marginBottom: Spacing.xl,
  },
  otpInput: {
    width: 48,
    height: 56,
    borderWidth: 2,
    borderColor: Colors.border,
    borderRadius: BorderRadius.lg,
    fontSize: FontSize.xl,
    fontFamily: 'Inter_700Bold',
    color: Colors.text.primary,
    backgroundColor: Colors.white,
    textAlign: 'center',
  },
  otpInputFilled: {
    borderColor: Colors.brand[500],
    backgroundColor: Colors.brand[50],
  },
  otpInputError: {
    borderColor: Colors.red[500],
  },
  verifyButton: {
    backgroundColor: Colors.brand[600],
    borderRadius: BorderRadius.lg,
    height: 50,
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    ...Shadow.md,
    marginBottom: Spacing.lg,
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  verifyButtonText: {
    color: Colors.white,
    fontSize: FontSize.base,
    fontFamily: 'Inter_600SemiBold',
  },
  resendRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  resendHint: {
    fontSize: FontSize.sm,
    color: Colors.text.secondary,
    fontFamily: 'Inter_400Regular',
  },
  resendLink: {
    fontSize: FontSize.sm,
    color: Colors.brand[600],
    fontFamily: 'Inter_600SemiBold',
  },
});
