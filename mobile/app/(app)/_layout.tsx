import React, { useEffect } from 'react';
import { Stack, useRouter } from 'expo-router';
import { useAuthStore } from '../../src/stores/authStore';

export default function AppLayout() {
  const router = useRouter();
  const { accessToken, user } = useAuthStore();

  useEffect(() => {
    if (!accessToken || !user) {
      router.replace('/(auth)/login');
    }
  }, [accessToken, user]);

  return (
    <Stack
      screenOptions={{
        headerShown: false,
        animation: 'slide_from_right',
      }}
    >
      <Stack.Screen name="index" />
      <Stack.Screen
        name="settings"
        options={{ presentation: 'modal', animation: 'slide_from_bottom' }}
      />
    </Stack>
  );
}
