import React, { useState } from 'react'
import { useQuery, useMutation } from '@tanstack/react-query'
import { format } from 'date-fns'
import {
  Download,
  Loader2,
  CheckCircle2,
  XCircle,
  Clock,
  ChevronDown,
} from 'lucide-react'
import { toast } from 'sonner'
import { api } from '../../lib/api'
import { Button } from '../../components/ui/button'
import { Badge } from '../../components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../../components/ui/card'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../../components/ui/select'
import { Label } from '../../components/ui/label'

interface Platform {
  id: string
  name: string
  description: string
  logo: string
  modes: string[]
}

interface ExportJob {
  id: string
  platform: string
  status: 'pending' | 'running' | 'success' | 'failed'
  created_at: string
  completed_at: string | null
  result_payload: { message?: string; error?: string } | null
}

const PLATFORM_LOGOS: Record<string, string> = {
  kronos: '⚙️',
  keypay: '💳',
  myob: '📊',
  xero: '📈',
}

const STATUS_ICON: Record<string, React.ReactNode> = {
  pending: <Clock className="h-4 w-4 text-yellow-500" />,
  running: <Loader2 className="h-4 w-4 text-blue-500 animate-spin" />,
  success: <CheckCircle2 className="h-4 w-4 text-green-500" />,
  failed: <XCircle className="h-4 w-4 text-red-500" />,
}

export default function ExportPage() {
  const [selectedPlatform, setSelectedPlatform] = useState<string>('')
  const [selectedMode, setSelectedMode] = useState<string>('timesheets')

  const { data: platforms = [] } = useQuery<Platform[]>({
    queryKey: ['export-platforms'],
    queryFn: () => api.get('/export/platforms').then((r) => r.data),
  })

  const { data: jobs = [], refetch } = useQuery<ExportJob[]>({
    queryKey: ['export-jobs'],
    queryFn: () => api.get('/export/jobs').then((r) => r.data),
    refetchInterval: 5000, // poll every 5s for running jobs
  })

  const triggerMutation = useMutation({
    mutationFn: () =>
      api.post('/export/trigger', { platform: selectedPlatform, mode: selectedMode }).then((r) => r.data),
    onSuccess: () => {
      toast.success('Export started')
      refetch()
    },
    onError: () => toast.error('Failed to start export'),
  })

  const activePlatform = platforms.find((p) => p.id === selectedPlatform)

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">Payroll Export</h1>
        <p className="text-sm text-slate-500 mt-0.5">
          Push timesheets and award rules to your payroll platform
        </p>
      </div>

      {/* Platform picker */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {platforms.map((p) => (
          <button
            key={p.id}
            onClick={() => setSelectedPlatform(p.id)}
            className={`border rounded-xl p-4 text-left transition-all ${
              selectedPlatform === p.id
                ? 'border-indigo-500 bg-indigo-50 shadow-sm'
                : 'border-slate-200 hover:border-slate-300 bg-white'
            }`}
          >
            <div className="text-3xl mb-2">{PLATFORM_LOGOS[p.id] ?? '🔗'}</div>
            <p className="font-semibold text-sm">{p.name}</p>
            <p className="text-xs text-slate-500 mt-0.5 line-clamp-2">{p.description}</p>
          </button>
        ))}
        {/* Static fallback cards when API hasn't loaded yet */}
        {platforms.length === 0 &&
          ['Kronos WFC', 'KeyPay', 'MYOB', 'Xero'].map((name, i) => (
            <div
              key={i}
              className="border border-slate-200 rounded-xl p-4 animate-pulse bg-slate-50"
            >
              <div className="h-8 w-8 bg-slate-200 rounded mb-2" />
              <div className="h-4 w-20 bg-slate-200 rounded" />
            </div>
          ))}
      </div>

      {/* Export config */}
      {selectedPlatform && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              {PLATFORM_LOGOS[selectedPlatform]} Export to {activePlatform?.name}
            </CardTitle>
            <CardDescription>{activePlatform?.description}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="max-w-xs space-y-1.5">
              <Label>Export Mode</Label>
              <Select value={selectedMode} onValueChange={setSelectedMode}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(activePlatform?.modes ?? ['timesheets', 'rules']).map((m) => (
                    <SelectItem key={m} value={m} className="capitalize">
                      {m.charAt(0).toUpperCase() + m.slice(1)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button
              onClick={() => triggerMutation.mutate()}
              disabled={triggerMutation.isPending}
              className="bg-indigo-600 hover:bg-indigo-700"
            >
              {triggerMutation.isPending ? (
                <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
              ) : (
                <Download className="h-4 w-4 mr-1.5" />
              )}
              Run Export
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Job history */}
      <div>
        <h2 className="text-lg font-semibold text-slate-900 mb-3">Export History</h2>
        {jobs.length === 0 ? (
          <div className="border border-dashed border-slate-200 rounded-xl p-10 text-center text-sm text-slate-400">
            No exports yet. Select a platform above to get started.
          </div>
        ) : (
          <div className="space-y-2">
            {jobs.map((job) => (
              <div
                key={job.id}
                className="flex items-center justify-between bg-white border border-slate-200 rounded-lg px-4 py-3"
              >
                <div className="flex items-center gap-3">
                  {STATUS_ICON[job.status] ?? <Clock className="h-4 w-4 text-slate-400" />}
                  <div>
                    <p className="text-sm font-medium capitalize">{job.platform} — {job.status}</p>
                    <p className="text-xs text-slate-400">
                      Started {format(new Date(job.created_at), 'dd MMM yy HH:mm')}
                      {job.completed_at &&
                        ` · Finished ${format(new Date(job.completed_at), 'HH:mm')}`}
                    </p>
                  </div>
                </div>
                {job.result_payload?.message && (
                  <span className="text-xs text-slate-500 max-w-xs truncate">
                    {job.result_payload.message}
                  </span>
                )}
                {job.result_payload?.error && (
                  <span className="text-xs text-red-500 max-w-xs truncate">
                    {job.result_payload.error}
                  </span>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
