import axios, {
  AxiosInstance,
  AxiosRequestConfig,
  InternalAxiosRequestConfig,
  AxiosResponse,
  AxiosError,
} from 'axios';
import { useAuthStore } from '../stores/authStore';

const BASE_URL =
  process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:8000/api/v1';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ApiError {
  message: string;
  status: number;
  detail?: unknown;
}

export interface TokenResponse {
  access_token: string;
  refresh_token: string;
  token_type: string;
}

export interface OtpVerifyRequest {
  email: string;
  code: string;
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
}

export interface Session {
  id: string;
  title: string;
  current_node: string;
  messages: ChatMessage[];
  extracted_data: Record<string, unknown>;
  status: 'active' | 'complete' | 'archived';
  created_at: string;
  updated_at: string;
}

export interface SendMessageRequest {
  session_id: string;
  content: string;
  mode: 'voice' | 'chat';
}

export interface SendMessageResponse {
  reply: string;
  current_node: string;
  node_advanced: boolean;
  extracted_data: Record<string, unknown>;
  session_status: 'active' | 'complete';
}

export interface TranscribeRequest {
  audio_base64: string;
  mime_type: string;
}

export interface TranscribeResponse {
  transcript: string;
  confidence: number;
}

// ---------------------------------------------------------------------------
// Axios instance
// ---------------------------------------------------------------------------

let isRefreshing = false;
let failedQueue: Array<{
  resolve: (token: string) => void;
  reject: (err: unknown) => void;
}> = [];

function processQueue(error: unknown, token: string | null) {
  failedQueue.forEach((prom) => {
    if (error) {
      prom.reject(error);
    } else if (token) {
      prom.resolve(token);
    }
  });
  failedQueue = [];
}

function createApiClient(): AxiosInstance {
  const instance = axios.create({
    baseURL: BASE_URL,
    timeout: 30_000,
    headers: {
      'Content-Type': 'application/json',
      'Bypass-Tunnel-Reminder': 'true',
    },
  });

  // Request interceptor — attach JWT
  instance.interceptors.request.use(
    (config: InternalAxiosRequestConfig) => {
      const { accessToken } = useAuthStore.getState();
      if (accessToken && config.headers) {
        config.headers.Authorization = `Bearer ${accessToken}`;
      }
      return config;
    },
    (error) => Promise.reject(error),
  );

  // Response interceptor — handle 401 + token refresh
  instance.interceptors.response.use(
    (response: AxiosResponse) => response,
    async (error: AxiosError) => {
      const originalRequest = error.config as AxiosRequestConfig & {
        _retry?: boolean;
      };

      if (error.response?.status === 401 && !originalRequest._retry) {
        if (isRefreshing) {
          return new Promise<string>((resolve, reject) => {
            failedQueue.push({ resolve, reject });
          })
            .then((token) => {
              if (originalRequest.headers) {
                (originalRequest.headers as Record<string, string>)[
                  'Authorization'
                ] = `Bearer ${token}`;
              }
              return instance(originalRequest);
            })
            .catch((err) => Promise.reject(err));
        }

        originalRequest._retry = true;
        isRefreshing = true;

        const { refreshToken, setTokens, logout } = useAuthStore.getState();

        if (!refreshToken) {
          await logout();
          return Promise.reject(error);
        }

        try {
          const response = await axios.post<TokenResponse>(
            `${BASE_URL}/auth/refresh`,
            { refresh_token: refreshToken },
          );
          const { access_token, refresh_token } = response.data;
          await setTokens(access_token, refresh_token);
          processQueue(null, access_token);
          if (originalRequest.headers) {
            (originalRequest.headers as Record<string, string>)[
              'Authorization'
            ] = `Bearer ${access_token}`;
          }
          return instance(originalRequest);
        } catch (refreshError) {
          processQueue(refreshError, null);
          await logout();
          return Promise.reject(refreshError);
        } finally {
          isRefreshing = false;
        }
      }

      return Promise.reject(formatError(error));
    },
  );

  return instance;
}

function formatError(error: AxiosError): ApiError {
  const status = error.response?.status ?? 0;
  const data = error.response?.data as
    | { detail?: string | { msg: string }[] }
    | undefined;

  let message = 'An unexpected error occurred.';
  if (data?.detail) {
    if (typeof data.detail === 'string') {
      message = data.detail;
    } else if (Array.isArray(data.detail) && data.detail[0]?.msg) {
      message = data.detail[0].msg;
    }
  } else if (error.message) {
    message = error.message;
  }

  return { message, status, detail: data?.detail };
}

export const apiClient = createApiClient();

// ---------------------------------------------------------------------------
// Auth API
// ---------------------------------------------------------------------------

export const authApi = {
  login: (data: LoginRequest) =>
    apiClient.post<TokenResponse>('/auth/login', data),

  verifyOtp: (data: OtpVerifyRequest) =>
    apiClient.post<TokenResponse>('/auth/otp/verify', data),

  resendOtp: (email: string) =>
    apiClient.post<{ message: string }>('/auth/otp/resend', { email }),

  me: () =>
    apiClient.get<import('../stores/authStore').UserOut>('/users/me'),

  googleOAuth: () =>
    apiClient.get<{ url: string }>('/auth/google/url'),
};

// ---------------------------------------------------------------------------
// Session / Conversation API
// ---------------------------------------------------------------------------

export const sessionApi = {
  list: () => apiClient.get<Session[]>('/sessions'),

  create: (title?: string) =>
    apiClient.post<Session>('/sessions', { title: title ?? 'New Interview' }),

  get: (sessionId: string) =>
    apiClient.get<Session>(`/sessions/${sessionId}`),

  sendMessage: (data: SendMessageRequest) =>
    apiClient.post<SendMessageResponse>('/sessions/message', data),

  transcribe: (data: TranscribeRequest) =>
    apiClient.post<TranscribeResponse>('/sessions/transcribe', data),

  complete: (sessionId: string) =>
    apiClient.post<Session>(`/sessions/${sessionId}/complete`),
};

// ---------------------------------------------------------------------------
// Settings API
// ---------------------------------------------------------------------------

export const settingsApi = {
  getProviderSettings: () =>
    apiClient.get<{ llm_provider: string; ollama_url: string }>(
      '/settings/llm',
    ),

  updateProviderSettings: (data: {
    llm_provider: string;
    ollama_url?: string;
  }) => apiClient.put('/settings/llm', data),
};
