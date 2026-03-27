import React from 'react'
import { Button } from './ui/button'
import { cn } from '@/lib/utils'
import { FileX2 } from 'lucide-react'

interface EmptyStateProps {
  title: string
  description?: string
  icon?: React.ReactNode
  action?: {
    label: string
    onClick: () => void
  }
  className?: string
}

export function EmptyState({
  title,
  description,
  icon,
  action,
  className,
}: EmptyStateProps) {
  return (
    <div className={cn('flex flex-col items-center justify-center py-16 text-center', className)}>
      <div className="w-16 h-16 rounded-full bg-neutral-100 flex items-center justify-center mb-4">
        {icon ?? <FileX2 className="w-8 h-8 text-neutral-400" />}
      </div>
      <h3 className="text-base font-semibold text-neutral-800 mb-1">{title}</h3>
      {description && (
        <p className="text-sm text-neutral-500 max-w-sm mb-6">{description}</p>
      )}
      {action && (
        <Button onClick={action.onClick} size="sm">
          {action.label}
        </Button>
      )}
    </div>
  )
}
