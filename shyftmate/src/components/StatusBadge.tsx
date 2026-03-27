import React from 'react'
import { Badge } from './ui/badge'
import { titleCase } from '@/lib/utils'
import type {
  TimesheetStatus,
  LeaveStatus,
  AgreementStatus,
  ProspectStatus,
  ShiftStatus,
  SyncStatus,
  ExportJobStatus,
} from '@/types'

type AnyStatus =
  | TimesheetStatus
  | LeaveStatus
  | AgreementStatus
  | ProspectStatus
  | ShiftStatus
  | SyncStatus
  | ExportJobStatus
  | string

const STATUS_VARIANTS: Record<string, 'success' | 'warning' | 'error' | 'info' | 'neutral'> = {
  // Generic
  active: 'success',
  approved: 'success',
  completed: 'success',
  converted: 'success',
  filled: 'success',
  synced: 'success',

  draft: 'warning',
  pending: 'warning',
  submitted: 'warning',
  reviewed: 'warning',
  running: 'warning',

  rejected: 'error',
  cancelled: 'error',
  error: 'error',
  declined: 'error',
  failed: 'error',

  new: 'info',
  invited: 'info',
  open: 'info',
  info: 'info',

  superseded: 'neutral',
  archived: 'neutral',
  not_configured: 'neutral',
  not_connected: 'neutral',
}

interface StatusBadgeProps {
  status: AnyStatus
  label?: string
}

export function StatusBadge({ status, label }: StatusBadgeProps) {
  const variant = STATUS_VARIANTS[status.toLowerCase()] ?? 'neutral'
  const displayLabel = label ?? titleCase(status)
  return <Badge variant={variant}>{displayLabel}</Badge>
}
