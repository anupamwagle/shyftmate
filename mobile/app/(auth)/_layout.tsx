import React, { useEffect } from 'react';
import { Stack, useRouter } from 'expo-router';
import { useAuthStore } from '../../src/stores/authStore';

export default function AuthLayout() {
  const router = useRouter();
  const { accessToken, user, isOtpPending } = useAuthStore();

  useEffect(() => {
    if (accessToken && user) {
      router.replace('/(app)');
    }
  }, [accessToken, user]);

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="login" />
      <Stack.Screen name="otp" />
    </Stack>
  );
}
