import { Redirect } from 'expo-router';
import { useAuthStore } from '../src/stores/authStore';

export default function Root() {
  const { accessToken, user } = useAuthStore();

  if (accessToken && user) {
    return <Redirect href="/(app)" />;
  }
  return <Redirect href="/(auth)/login" />;
}
