import React, { Suspense, useState } from 'react'
import { Outlet } from 'react-router-dom'
import { Sidebar } from './Sidebar'
import { Header } from './Header'
import { TooltipProvider } from '@/components/ui/tooltip'
import { RouteErrorBoundary } from '@/components/ErrorBoundary'
import { Loader2 } from 'lucide-react'

function PageLoadingFallback() {
  return (
    <div className="flex items-center justify-center min-h-[400px]">
      <Loader2 className="w-6 h-6 animate-spin text-primary-600" />
    </div>
  )
}

export function AppLayout() {
  const [collapsed, setCollapsed] = useState(false)

  return (
    <TooltipProvider>
      <div className="flex h-screen overflow-hidden bg-neutral-50">
        <Sidebar collapsed={collapsed} onToggle={() => setCollapsed(!collapsed)} />
        <div className="flex flex-col flex-1 overflow-hidden">
          <Header />
          <main className="flex-1 overflow-y-auto p-6">
            <RouteErrorBoundary>
              <Suspense fallback={<PageLoadingFallback />}>
                <Outlet />
              </Suspense>
            </RouteErrorBoundary>
          </main>
        </div>
      </div>
    </TooltipProvider>
  )
}
