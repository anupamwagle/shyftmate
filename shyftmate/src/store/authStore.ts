import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import api, { getApiError } from '../lib/api'
import type { UserOut, TokenResponse } from '../types'

interface AuthState {
  accessToken: string | null
  refreshToken: string | null
  user: UserOut | null
  isOtpPending: boolean

  // Actions
  setTokens: (accessToken: string, refreshToken: string) => void
  login: (email: string, password: string) => Promise<void>
  loginWithGoogle: (idToken: string) => Promise<void>
  loginWithApple: (identityToken: string, authCode: string) => Promise<void>
  verifyOtp: (code: string) => Promise<void>
  resendOtp: () => Promise<void>
  logout: () => void
  refreshTokens: () => Promise<void>
  fetchUser: () => Promise<void>
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      accessToken: null,
      refreshToken: null,
      user: null,
      isOtpPending: false,

      setTokens: (accessToken, refreshToken) => {
        set({ accessToken, refreshToken })
      },

      login: async (email, password) => {
        const { data } = await api.post<TokenResponse>('/auth/login', {
          email,
          password,
        })
        if (data.otp_pending) {
          // Store a temporary token for OTP verification
          set({
            accessToken: data.access_token,
            refreshToken: data.refresh_token,
            isOtpPending: true,
          })
        } else {
          set({
            accessToken: data.access_token,
            refreshToken: data.refresh_token,
            isOtpPending: false,
          })
          await get().fetchUser()
        }
      },

      loginWithGoogle: async (idToken) => {
        const { data } = await api.post<TokenResponse>('/auth/google', {
          id_token: idToken,
        })
        if (data.otp_pending) {
          set({
            accessToken: data.access_token,
            refreshToken: data.refresh_token,
            isOtpPending: true,
          })
        } else {
          set({
            accessToken: data.access_token,
            refreshToken: data.refresh_token,
            isOtpPending: false,
          })
          await get().fetchUser()
        }
      },

      loginWithApple: async (identityToken, authCode) => {
        const { data } = await api.post<TokenResponse>('/auth/apple', {
          identity_token: identityToken,
          authorization_code: authCode,
        })
        if (data.otp_pending) {
          set({
            accessToken: data.access_token,
            refreshToken: data.refresh_token,
            isOtpPending: true,
          })
        } else {
          set({
            accessToken: data.access_token,
            refreshToken: data.refresh_token,
            isOtpPending: false,
          })
          await get().fetchUser()
        }
      },

      verifyOtp: async (code) => {
        const { data } = await api.post('/auth/otp/verify', { code })
        set({
          accessToken: data.access_token,
          refreshToken: data.refresh_token,
          isOtpPending: false,
        })
        await get().fetchUser()
      },

      resendOtp: async () => {
        await api.post('/auth/otp/resend')
      },

      logout: () => {
        set({
          accessToken: null,
          refreshToken: null,
          user: null,
          isOtpPending: false,
        })
      },

      refreshTokens: async () => {
        const { refreshToken } = get()
        if (!refreshToken) throw new Error('No refresh token available')
        const { data } = await api.post('/auth/refresh', {
          refresh_token: refreshToken,
        })
        set({
          accessToken: data.access_token,
          refreshToken: data.refresh_token,
        })
      },

      fetchUser: async () => {
        try {
          const { data } = await api.get<UserOut>('/auth/me')
          set({ user: data })
        } catch (error) {
          console.error('Failed to fetch user:', getApiError(error))
        }
      },
    }),
    {
      name: 'shyftmate-auth',
      partialize: (state) => ({
        accessToken: state.accessToken,
        refreshToken: state.refreshToken,
        user: state.user,
        isOtpPending: state.isOtpPending,
      }),
      onRehydrateStorage: () => (state) => {
        // Expose the store on window for the axios interceptor (avoids circular import)
        if (state) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          ;(window as any).__authStore = useAuthStore
        }
      },
    }
  )
)

// Also expose on window at module init
// eslint-disable-next-line @typescript-eslint/no-explicit-any
;(window as any).__authStore = useAuthStore
