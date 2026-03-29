import React from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { AlertTriangle, RefreshCw, Home } from 'lucide-react'
import { Button } from '@/components/ui/button'

interface ErrorBoundaryState {
  hasError: boolean
  error: Error | null
}

interface ErrorBoundaryProps {
  children: React.ReactNode
}

/**
 * Class-based ErrorBoundary that catches render errors in child components.
 * Prevents blank pages by showing a recovery UI with retry/home options.
 */
class ErrorBoundaryInner extends React.Component<
  ErrorBoundaryProps & { onReset: () => void; resetKey: string },
  ErrorBoundaryState
> {
  constructor(props: ErrorBoundaryProps & { onReset: () => void; resetKey: string }) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('[ErrorBoundary] Caught error:', error, errorInfo)
  }

  componentDidUpdate(prevProps: ErrorBoundaryProps & { resetKey: string }) {
    // Reset error state when the route changes (resetKey = pathname)
    if (this.state.hasError && prevProps.resetKey !== this.props.resetKey) {
      this.setState({ hasError: false, error: null })
    }
  }

  render() {
    if (this.state.hasError) {
      return (
        <ErrorFallback
          error={this.state.error}
          onRetry={() => {
            this.setState({ hasError: false, error: null })
          }}
          onGoHome={() => {
            this.setState({ hasError: false, error: null })
            this.props.onReset()
          }}
        />
      )
    }

    return this.props.children
  }
}

function ErrorFallback({
  error,
  onRetry,
  onGoHome,
}: {
  error: Error | null
  onRetry: () => void
  onGoHome: () => void
}) {
  return (
    <div className="flex flex-col items-center justify-center min-h-[400px] gap-6 p-8">
      <div className="flex items-center justify-center w-16 h-16 rounded-full bg-red-50">
        <AlertTriangle className="w-8 h-8 text-red-500" />
      </div>
      <div className="text-center space-y-2 max-w-md">
        <h2 className="text-xl font-semibold text-neutral-900">Something went wrong</h2>
        <p className="text-sm text-neutral-500">
          An unexpected error occurred while rendering this page. You can try again or go back to
          the dashboard.
        </p>
        {error && (
          <details className="mt-3 text-left">
            <summary className="text-xs text-neutral-400 cursor-pointer hover:text-neutral-600">
              Technical details
            </summary>
            <pre className="mt-2 text-xs text-red-600 bg-red-50 rounded-md p-3 overflow-auto max-h-32 whitespace-pre-wrap">
              {error.message}
            </pre>
          </details>
        )}
      </div>
      <div className="flex gap-3">
        <Button variant="outline" onClick={onRetry} className="gap-2">
          <RefreshCw className="w-4 h-4" />
          Try again
        </Button>
        <Button onClick={onGoHome} className="gap-2">
          <Home className="w-4 h-4" />
          Go to Dashboard
        </Button>
      </div>
    </div>
  )
}

/**
 * Route-aware ErrorBoundary wrapper. Resets automatically on navigation
 * and provides a "Go to Dashboard" recovery action.
 */
export function RouteErrorBoundary({ children }: { children: React.ReactNode }) {
  const navigate = useNavigate()
  const location = useLocation()

  return (
    <ErrorBoundaryInner
      resetKey={location.pathname}
      onReset={() => navigate('/dashboard', { replace: true })}
    >
      {children}
    </ErrorBoundaryInner>
  )
}
