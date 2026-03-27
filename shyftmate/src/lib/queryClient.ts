import { QueryClient } from '@tanstack/react-query'
import { showApiError } from './api'

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 2, // 2 minutes
      retry: (failureCount, error) => {
        // Don't retry on 4xx errors
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const status = (error as any)?.response?.status
        if (status && status >= 400 && status < 500) return false
        return failureCount < 2
      },
    },
    mutations: {
      onError: (error) => {
        showApiError(error)
      },
    },
  },
})

// Global error handler for queries that don't define their own
queryClient.setDefaultOptions({
  queries: {
    throwOnError: false,
  },
})
