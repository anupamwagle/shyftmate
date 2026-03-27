import React, { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { format } from 'date-fns'
import { Shield, Search, ChevronDown, ChevronRight } from 'lucide-react'
import { api } from '../../lib/api'
import { Input } from '../../components/ui/input'
import { Badge } from '../../components/ui/badge'
import { Button } from '../../components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../../components/ui/select'
import { Label } from '../../components/ui/label'

interface AuditEntry {
  id: string
  entity_type: string
  entity_id: string
  action: string
  actor: string | null
  actor_email?: string
  before_payload: Record<string, unknown> | null
  after_payload: Record<string, unknown> | null
  ip_address: string | null
  created_at: string
}

const ACTION_COLORS: Record<string, string> = {
  create: 'bg-green-100 text-green-700',
  update: 'bg-blue-100 text-blue-700',
  delete: 'bg-red-100 text-red-700',
  activate: 'bg-purple-100 text-purple-700',
  rollback: 'bg-yellow-100 text-yellow-700',
  provision: 'bg-indigo-100 text-indigo-700',
  login: 'bg-slate-100 text-slate-700',
}

const ENTITY_TYPES = [
  'agreement',
  'employee_type_config',
  'rule_line',
  'allowance',
  'leave_paycode',
  'wage_grade',
  'kronos_config',
  'user',
  'organisation',
  'prospect',
]

function DiffViewer({ before, after }: { before: Record<string, unknown> | null; after: Record<string, unknown> | null }) {
  if (!before && !after) return null

  const keys = Array.from(
    new Set([...Object.keys(before ?? {}), ...Object.keys(after ?? {})]),
  ).filter((k) => JSON.stringify((before ?? {})[k]) !== JSON.stringify((after ?? {})[k]))

  if (keys.length === 0) return <p className="text-xs text-slate-400 italic">No field changes detected.</p>

  return (
    <div className="mt-3 space-y-1.5">
      {keys.map((k) => (
        <div key={k} className="grid grid-cols-[140px_1fr_1fr] gap-2 text-xs">
          <span className="text-slate-500 font-medium truncate">{k}</span>
          <span className="bg-red-50 text-red-700 px-1.5 py-0.5 rounded font-mono truncate">
            {JSON.stringify((before ?? {})[k]) ?? '—'}
          </span>
          <span className="bg-green-50 text-green-700 px-1.5 py-0.5 rounded font-mono truncate">
            {JSON.stringify((after ?? {})[k]) ?? '—'}
          </span>
        </div>
      ))}
    </div>
  )
}

function AuditRow({ entry }: { entry: AuditEntry }) {
  const [expanded, setExpanded] = useState(false)
  const hasPayload = entry.before_payload || entry.after_payload

  return (
    <div className="border border-slate-200 rounded-lg bg-white">
      <div
        className={`flex items-center gap-3 px-4 py-3 ${hasPayload ? 'cursor-pointer hover:bg-slate-50' : ''}`}
        onClick={() => hasPayload && setExpanded((e) => !e)}
      >
        <div className="w-5 shrink-0">
          {hasPayload ? (
            expanded ? (
              <ChevronDown className="h-4 w-4 text-slate-400" />
            ) : (
              <ChevronRight className="h-4 w-4 text-slate-400" />
            )
          ) : null}
        </div>

        <span
          className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold capitalize shrink-0 ${
            ACTION_COLORS[entry.action] ?? 'bg-slate-100 text-slate-700'
          }`}
        >
          {entry.action}
        </span>

        <Badge variant="outline" className="capitalize text-xs shrink-0">
          {entry.entity_type.replace(/_/g, ' ')}
        </Badge>

        <span className="text-sm text-slate-700 flex-1 truncate font-mono text-xs">
          {entry.entity_id}
        </span>

        <div className="text-right shrink-0">
          {entry.actor_email && (
            <p className="text-xs font-medium text-slate-700">{entry.actor_email}</p>
          )}
          {entry.ip_address && (
            <p className="text-xs text-slate-400">{entry.ip_address}</p>
          )}
        </div>

        <span className="text-xs text-slate-400 shrink-0 ml-2">
          {format(new Date(entry.created_at), 'dd MMM yy HH:mm:ss')}
        </span>
      </div>

      {expanded && hasPayload && (
        <div className="border-t border-slate-100 px-4 pb-4">
          <div className="grid grid-cols-[140px_1fr_1fr] gap-2 mt-3 mb-1">
            <span />
            <span className="text-xs font-semibold text-red-600 uppercase tracking-wide">Before</span>
            <span className="text-xs font-semibold text-green-600 uppercase tracking-wide">After</span>
          </div>
          <DiffViewer before={entry.before_payload} after={entry.after_payload} />
        </div>
      )}
    </div>
  )
}

export default function AuditPage() {
  const [entityType, setEntityType] = useState<string>('')
  const [action, setAction] = useState<string>('')
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const PAGE_SIZE = 25

  const { data, isLoading } = useQuery<{ items: AuditEntry[]; total: number }>({
    queryKey: ['audit', entityType, action, page],
    queryFn: () =>
      api
        .get('/audit', {
          params: {
            entity_type: entityType || undefined,
            action: action || undefined,
            page,
            page_size: PAGE_SIZE,
          },
        })
        .then((r) => r.data),
  })

  const entries = data?.items ?? []
  const total = data?.total ?? 0

  const filtered = search
    ? entries.filter(
        (e) =>
          e.entity_id.includes(search) ||
          e.actor_email?.includes(search) ||
          e.ip_address?.includes(search),
      )
    : entries

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Shield className="h-6 w-6 text-indigo-600" />
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Audit Log</h1>
          <p className="text-sm text-slate-500">Immutable record of all system changes</p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 items-end">
        <div className="space-y-1">
          <Label className="text-xs">Entity Type</Label>
          <Select value={entityType} onValueChange={(v) => { setEntityType(v); setPage(1) }}>
            <SelectTrigger className="w-44">
              <SelectValue placeholder="All types" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="">All types</SelectItem>
              {ENTITY_TYPES.map((t) => (
                <SelectItem key={t} value={t} className="capitalize">
                  {t.replace(/_/g, ' ')}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1">
          <Label className="text-xs">Action</Label>
          <Select value={action} onValueChange={(v) => { setAction(v); setPage(1) }}>
            <SelectTrigger className="w-36">
              <SelectValue placeholder="All actions" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="">All actions</SelectItem>
              {Object.keys(ACTION_COLORS).map((a) => (
                <SelectItem key={a} value={a} className="capitalize">
                  {a}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1 flex-1 min-w-48">
          <Label className="text-xs">Search</Label>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <Input
              className="pl-9"
              placeholder="Entity ID, email, IP…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </div>
      </div>

      {/* Entries */}
      {isLoading ? (
        <div className="space-y-2">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="h-14 bg-slate-100 animate-pulse rounded-lg" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="border border-dashed border-slate-200 rounded-xl p-10 text-center text-sm text-slate-400">
          No audit entries found.
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((e) => (
            <AuditRow key={e.id} entry={e} />
          ))}
        </div>
      )}

      {/* Pagination */}
      {total > PAGE_SIZE && (
        <div className="flex items-center justify-between text-sm text-slate-500">
          <span>
            {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, total)} of {total}
          </span>
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="outline"
              disabled={page === 1}
              onClick={() => setPage((p) => p - 1)}
            >
              Previous
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={page * PAGE_SIZE >= total}
              onClick={() => setPage((p) => p + 1)}
            >
              Next
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
