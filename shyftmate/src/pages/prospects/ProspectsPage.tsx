import React, { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { format } from 'date-fns'
import {
  Phone,
  Building2,
  CheckCircle2,
  XCircle,
  ChevronRight,
  UserPlus,
} from 'lucide-react'
import { toast } from 'sonner'
import { api } from '../../lib/api'
import { Button } from '../../components/ui/button'
import { Badge } from '../../components/ui/badge'
import { DataTable } from '../../components/DataTable'
import { StatusBadge } from '../../components/StatusBadge'
import { ConfirmDialog } from '../../components/ConfirmDialog'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '../../components/ui/dialog'
import { Label } from '../../components/ui/label'
import { Textarea } from '../../components/ui/textarea'
import { Tabs, TabsList, TabsTrigger } from '../../components/ui/tabs'

interface Prospect {
  id: string
  caller_phone: string
  caller_name: string | null
  company_name: string | null
  company_email: string | null
  agreement_id: string | null
  status: 'new' | 'reviewed' | 'invited' | 'converted' | 'declined'
  admin_notes: string | null
  invited_at: string | null
  created_at: string
}

const STATUS_OPTIONS = ['new', 'reviewed', 'invited', 'converted', 'declined'] as const

const STATUS_COLORS: Record<string, string> = {
  new: 'bg-blue-100 text-blue-700',
  reviewed: 'bg-yellow-100 text-yellow-700',
  invited: 'bg-purple-100 text-purple-700',
  converted: 'bg-green-100 text-green-700',
  declined: 'bg-red-100 text-red-700',
}

function ProspectDetail({
  prospect,
  onClose,
}: {
  prospect: Prospect
  onClose: () => void
}) {
  const qc = useQueryClient()
  const [notes, setNotes] = useState(prospect.admin_notes || '')
  const [provisioning, setProvisioning] = useState(false)

  const updateMutation = useMutation({
    mutationFn: (data: { status?: string; admin_notes?: string }) =>
      api.patch(`/telephony/prospects/${prospect.id}`, data).then((r) => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['prospects'] })
      toast.success('Prospect updated')
    },
    onError: () => toast.error('Update failed'),
  })

  const provisionMutation = useMutation({
    mutationFn: () =>
      api.post(`/telephony/prospects/${prospect.id}/provision`).then((r) => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['prospects'] })
      toast.success('Account provisioned — invite email sent!')
      setProvisioning(false)
      onClose()
    },
    onError: () => toast.error('Provisioning failed'),
  })

  return (
    <>
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2">
          <Building2 className="h-5 w-5 text-indigo-600" />
          {prospect.company_name || prospect.caller_name || prospect.caller_phone}
        </DialogTitle>
      </DialogHeader>

      <div className="grid grid-cols-2 gap-4 text-sm">
        <div>
          <p className="text-slate-500 mb-0.5">Phone</p>
          <p className="font-medium">{prospect.caller_phone}</p>
        </div>
        <div>
          <p className="text-slate-500 mb-0.5">Contact Name</p>
          <p className="font-medium">{prospect.caller_name || '—'}</p>
        </div>
        <div>
          <p className="text-slate-500 mb-0.5">Company</p>
          <p className="font-medium">{prospect.company_name || '—'}</p>
        </div>
        <div>
          <p className="text-slate-500 mb-0.5">Email</p>
          <p className="font-medium">{prospect.company_email || '—'}</p>
        </div>
        <div>
          <p className="text-slate-500 mb-0.5">Status</p>
          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium capitalize ${STATUS_COLORS[prospect.status]}`}>
            {prospect.status}
          </span>
        </div>
        <div>
          <p className="text-slate-500 mb-0.5">Received</p>
          <p className="font-medium">{format(new Date(prospect.created_at), 'dd MMM yyyy HH:mm')}</p>
        </div>
      </div>

      <div className="space-y-1.5">
        <Label>Admin Notes</Label>
        <Textarea
          rows={3}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Add notes about this prospect…"
        />
      </div>

      <div className="flex gap-2 flex-wrap">
        {STATUS_OPTIONS.filter((s) => s !== prospect.status).map((s) => (
          <Button
            key={s}
            size="sm"
            variant="outline"
            onClick={() => updateMutation.mutate({ status: s, admin_notes: notes })}
            disabled={updateMutation.isPending}
            className="capitalize"
          >
            Mark as {s}
          </Button>
        ))}
      </div>

      <DialogFooter className="gap-2">
        <Button variant="outline" onClick={onClose}>
          Close
        </Button>
        <Button
          variant="outline"
          onClick={() => updateMutation.mutate({ admin_notes: notes })}
          disabled={updateMutation.isPending}
        >
          Save Notes
        </Button>
        {prospect.status !== 'converted' && prospect.status !== 'declined' && (
          <Button
            onClick={() => setProvisioning(true)}
            className="bg-indigo-600 hover:bg-indigo-700"
          >
            <UserPlus className="h-4 w-4 mr-1.5" />
            Provision Account
          </Button>
        )}
      </DialogFooter>

      <ConfirmDialog
        open={provisioning}
        title="Provision Account"
        description={`This will create an organisation for "${prospect.company_name || prospect.caller_name}" and send an invite email to ${prospect.company_email || '(no email on file)'}. Continue?`}
        onConfirm={() => provisionMutation.mutate()}
        onCancel={() => setProvisioning(false)}
        loading={provisionMutation.isPending}
      />
    </>
  )
}

export default function ProspectsPage() {
  const [statusFilter, setStatusFilter] = useState<string>('new')
  const [selected, setSelected] = useState<Prospect | null>(null)

  const { data: prospects = [], isLoading } = useQuery<Prospect[]>({
    queryKey: ['prospects', statusFilter],
    queryFn: () =>
      api.get('/telephony/prospects', { params: { status: statusFilter || undefined } }).then((r) => r.data),
  })

  const columns = [
    {
      key: 'caller',
      header: 'Caller',
      render: (r: Prospect) => (
        <div className="flex items-center gap-2">
          <Phone className="h-4 w-4 text-slate-400 shrink-0" />
          <div>
            <p className="font-medium text-sm">{r.caller_name || r.caller_phone}</p>
            {r.caller_name && (
              <p className="text-xs text-slate-400">{r.caller_phone}</p>
            )}
          </div>
        </div>
      ),
    },
    {
      key: 'company',
      header: 'Company',
      render: (r: Prospect) => (
        <div>
          <p className="font-medium text-sm">{r.company_name || '—'}</p>
          {r.company_email && (
            <p className="text-xs text-slate-400">{r.company_email}</p>
          )}
        </div>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      render: (r: Prospect) => (
        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium capitalize ${STATUS_COLORS[r.status]}`}>
          {r.status}
        </span>
      ),
    },
    {
      key: 'agreement',
      header: 'Agreement',
      render: (r: Prospect) =>
        r.agreement_id ? (
          <Badge variant="outline" className="text-xs">Draft saved</Badge>
        ) : (
          <span className="text-xs text-slate-400">No draft</span>
        ),
    },
    {
      key: 'created_at',
      header: 'Received',
      render: (r: Prospect) => (
        <span className="text-sm text-slate-500">
          {format(new Date(r.created_at), 'dd MMM yy HH:mm')}
        </span>
      ),
    },
    {
      key: 'actions',
      header: '',
      render: (r: Prospect) => (
        <Button size="sm" variant="ghost" onClick={() => setSelected(r)}>
          Review <ChevronRight className="h-3.5 w-3.5 ml-0.5" />
        </Button>
      ),
    },
  ]

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">Prospects</h1>
        <p className="text-sm text-slate-500 mt-0.5">
          Inbound leads captured by the Gator AI phone agent
        </p>
      </div>

      <Tabs value={statusFilter} onValueChange={setStatusFilter}>
        <TabsList>
          <TabsTrigger value="new">New</TabsTrigger>
          <TabsTrigger value="reviewed">Reviewed</TabsTrigger>
          <TabsTrigger value="invited">Invited</TabsTrigger>
          <TabsTrigger value="converted">Converted</TabsTrigger>
          <TabsTrigger value="declined">Declined</TabsTrigger>
          <TabsTrigger value="">All</TabsTrigger>
        </TabsList>
      </Tabs>

      <DataTable columns={columns} data={prospects} loading={isLoading} />

      <Dialog open={!!selected} onOpenChange={(open) => !open && setSelected(null)}>
        <DialogContent className="max-w-lg space-y-4">
          {selected && (
            <ProspectDetail prospect={selected} onClose={() => setSelected(null)} />
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
