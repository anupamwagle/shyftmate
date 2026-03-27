import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'
import {
  format,
  formatDistanceToNow,
  parseISO,
  isValid,
} from 'date-fns'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

// ─── Date Formatters ──────────────────────────────────────────────────────────

export function formatDate(dateStr: string | null | undefined, fmt = 'dd MMM yyyy'): string {
  if (!dateStr) return '—'
  try {
    const d = parseISO(dateStr)
    if (!isValid(d)) return '—'
    return format(d, fmt)
  } catch {
    return '—'
  }
}

export function formatDateTime(dateStr: string | null | undefined): string {
  return formatDate(dateStr, 'dd MMM yyyy, h:mm a')
}

export function formatTime(dateStr: string | null | undefined): string {
  return formatDate(dateStr, 'h:mm a')
}

export function formatRelative(dateStr: string | null | undefined): string {
  if (!dateStr) return '—'
  try {
    const d = parseISO(dateStr)
    if (!isValid(d)) return '—'
    return formatDistanceToNow(d, { addSuffix: true })
  } catch {
    return '—'
  }
}

export function formatCurrency(amount: number, currency = 'AUD'): string {
  return new Intl.NumberFormat('en-AU', {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
  }).format(amount)
}

export function formatHours(hours: number): string {
  const h = Math.floor(hours)
  const m = Math.round((hours - h) * 60)
  if (m === 0) return `${h}h`
  return `${h}h ${m}m`
}

export function formatNumber(n: number, decimals = 0): string {
  return new Intl.NumberFormat('en-AU', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(n)
}

// ─── String Helpers ───────────────────────────────────────────────────────────

export function initials(name: string): string {
  return name
    .split(' ')
    .map((n) => n[0])
    .slice(0, 2)
    .join('')
    .toUpperCase()
}

export function capitalize(str: string): string {
  return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase()
}

export function titleCase(str: string): string {
  return str
    .split(/[_\s]+/)
    .map(capitalize)
    .join(' ')
}

// ─── Misc ─────────────────────────────────────────────────────────────────────

export function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export function downloadBlob(data: Blob, filename: string) {
  const url = URL.createObjectURL(data)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

export function truncate(str: string, maxLen = 50): string {
  if (str.length <= maxLen) return str
  return str.slice(0, maxLen - 3) + '...'
}
