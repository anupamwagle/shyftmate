import { useAuthStore } from '../store/authStore'

export function useAuth() {
  const {
    user,
    accessToken,
    isOtpPending,
    login,
    loginWithGoogle,
    loginWithApple,
    verifyOtp,
    resendOtp,
    logout,
  } = useAuthStore()

  return {
    user,
    accessToken,
    isOtpPending,
    isAuthenticated: !!accessToken && !isOtpPending,
    login,
    loginWithGoogle,
    loginWithApple,
    verifyOtp,
    resendOtp,
    logout,
  }
}
