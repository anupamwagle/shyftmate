import axios, { AxiosError, InternalAxiosRequestConfig } from 'axios'
import { toast } from 'sonner'

const BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000/api/v1'

export const api = axios.create({
  baseURL: BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
})

// We import lazily to avoid circular deps
function getAuthStore() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (window as any).__authStore as {
    getState: () => {
      accessToken: string | null
      refreshToken: string | null
      logout: () => void
      setTokens: (access: string, refresh: string) => void
    }
  }
}

// Request interceptor: attach JWT
api.interceptors.request.use(
  (config: InternalAxiosRequestConfig) => {
    try {
      const store = getAuthStore()
      const token = store?.getState().accessToken
      if (token && config.headers) {
        config.headers.Authorization = `Bearer ${token}`
      }
    } catch {
      // store not yet initialised
    }
    return config
  },
  (error) => Promise.reject(error)
)

let isRefreshing = false
let failedQueue: Array<{
  resolve: (token: string) => void
  reject: (error: unknown) => void
}> = []

function processQueue(error: unknown, token: string | null) {
  failedQueue.forEach(({ resolve, reject }) => {
    if (error) reject(error)
    else if (token) resolve(token)
  })
  failedQueue = []
}

// Response interceptor: 401 → refresh token → retry
api.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const originalRequest = error.config as InternalAxiosRequestConfig & {
      _retry?: boolean
    }

    if (error.response?.status === 401 && !originalRequest._retry) {
      if (isRefreshing) {
        return new Promise((resolve, reject) => {
          failedQueue.push({ resolve, reject })
        })
          .then((token) => {
            if (originalRequest.headers) {
              originalRequest.headers.Authorization = `Bearer ${token}`
            }
            return api(originalRequest)
          })
          .catch((err) => Promise.reject(err))
      }

      originalRequest._retry = true
      isRefreshing = true

      try {
        const store = getAuthStore()
        const refreshToken = store?.getState().refreshToken
        if (!refreshToken) throw new Error('No refresh token')

        const { data } = await axios.post(`${BASE_URL}/auth/refresh`, {
          refresh_token: refreshToken,
        })

        const { access_token, refresh_token } = data
        store.getState().setTokens(access_token, refresh_token)

        processQueue(null, access_token)
        if (originalRequest.headers) {
          originalRequest.headers.Authorization = `Bearer ${access_token}`
        }
        return api(originalRequest)
      } catch (refreshError) {
        processQueue(refreshError, null)
        try {
          const store = getAuthStore()
          store?.getState().logout()
        } catch {
          //
        }
        window.location.href = '/login'
        return Promise.reject(refreshError)
      } finally {
        isRefreshing = false
      }
    }

    return Promise.reject(error)
  }
)

// Helper to extract error message from API response
export function getApiError(error: unknown): string {
  if (axios.isAxiosError(error)) {
    const data = error.response?.data
    if (data?.detail) {
      if (typeof data.detail === 'string') return data.detail
      if (Array.isArray(data.detail)) {
        return data.detail.map((d: { msg?: string }) => d.msg).join(', ')
      }
    }
    if (data?.message) return data.message
    if (error.message) return error.message
  }
  if (error instanceof Error) return error.message
  return 'An unexpected error occurred'
}

export function showApiError(error: unknown, fallback?: string, onRetry?: () => void) {
  const message = getApiError(error) || fallback || 'An error occurred'
  if (onRetry) {
    toast.error(message, {
      action: { label: 'Retry', onClick: onRetry },
    })
  } else {
    toast.error(message)
  }
}

export default api
