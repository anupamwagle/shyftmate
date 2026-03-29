import React, { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { type ColumnDef } from '@tanstack/react-table'
import { Plus, Pencil, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { api } from '../../lib/api'
import { Button } from '../../components/ui/button'
import { Badge } from '../../components/ui/badge'
import { Input } from '../../components/ui/input'
import { Label } from '../../components/ui/label'
import { Switch } from '../../components/ui/switch'
import { DataTable } from '../../components/DataTable'
import { ConfirmDialog } from '../../components/ConfirmDialog'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '../../components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../../components/ui/select'

interface LeaveType {
  id: string
  name: string
  code: string
  accrual_rate: number | null
  max_balance: number | null
  is_paid: boolean
  requires_approval: boolean
  color: string
  is_active: boolean
}

const COLORS = [
  '#6366f1', '#0ea5e9', '#10b981', '#f59e0b',
  '#ef4444', '#8b5cf6', '#ec4899', '#14b8a6',
]

function LeaveTypeForm({
  initial,
  onSave,
  onCancel,
  loading,
}: {
  initial?: Partial<LeaveType>
  onSave: (data: Partial<LeaveType>) => void
  onCancel: () => void
  loading?: boolean
}) {
  const [form, setForm] = useState<Partial<LeaveType>>({
    name: '',
    code: '',
    accrual_rate: null,
    max_balance: null,
    is_paid: true,
    requires_approval: true,
    color: '#6366f1',
    is_active: true,
    ...initial,
  })
  const set = (k: keyof LeaveType, v: unknown) => setForm((f) => ({ ...f, [k]: v }))

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1">
          <Label>Name *</Label>
          <Input value={form.name} onChange={(e) => set('name', e.target.value)} placeholder="e.g. Annual Leave" />
        </div>
        <div className="space-y-1">
          <Label>Code *</Label>
          <Input
            value={form.code}
            onChange={(e) => set('code', e.target.value.toUpperCase())}
            placeholder="e.g. AL"
            maxLength={10}
          />
        </div>
        <div className="space-y-1">
          <Label>Accrual Rate (hrs/week)</Label>
          <Input
            type="number"
            step="0.01"
            value={form.accrual_rate ?? ''}
            onChange={(e) => set('accrual_rate', e.target.value ? parseFloat(e.target.value) : null)}
            placeholder="Leave blank if N/A"
          />
        </div>
        <div className="space-y-1">
          <Label>Max Balance (hrs)</Label>
          <Input
            type="number"
            step="1"
            value={form.max_balance ?? ''}
            onChange={(e) => set('max_balance', e.target.value ? parseFloat(e.target.value) : null)}
            placeholder="Leave blank for unlimited"
          />
        </div>
      </div>

      <div className="space-y-1">
        <Label>Colour</Label>
        <div className="flex gap-2 flex-wrap">
          {COLORS.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => set('color', c)}
              className={`w-7 h-7 rounded-full border-2 transition-all ${
                form.color === c ? 'border-slate-900 scale-110' : 'border-transparent'
              }`}
              style={{ backgroundColor: c }}
            />
          ))}
        </div>
      </div>

      <div className="flex gap-6 flex-wrap">
        <div className="flex items-center gap-2">
          <Switch checked={!!form.is_paid} onCheckedChange={(v) => set('is_paid', v)} />
          <Label>Paid Leave</Label>
        </div>
        <div className="flex items-center gap-2">
          <Switch checked={!!form.requires_approval} onCheckedChange={(v) => set('requires_approval', v)} />
          <Label>Requires Approval</Label>
        </div>
        <div className="flex items-center gap-2">
          <Switch checked={!!form.is_active} onCheckedChange={(v) => set('is_active', v)} />
          <Label>Active</Label>
        </div>
      </div>

      <DialogFooter>
        <Button variant="outline" onClick={onCancel}>Cancel</Button>
        <Button onClick={() => onSave(form)} disabled={!form.name || !form.code || loading}>
          Save
        </Button>
      </DialogFooter>
    </div>
  )
}

export default function LeaveTypesPage() {
  const qc = useQueryClient()
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState<LeaveType | null>(null)
  const [deleting, setDeleting] = useState<LeaveType | null>(null)

  const { data: leaveTypes = [], isLoading } = useQuery<LeaveType[]>({
    queryKey: ['leave-types-admin'],
    queryFn: () => api.get('/leave-types').then((r) => r.data),
  })

  const saveMutation = useMutation({
    mutationFn: (data: Partial<LeaveType>) =>
      editing
        ? api.patch(`/leave-types/${editing.id}`, data).then((r) => r.data)
        : api.post('/leave-types', data).then((r) => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['leave-types-admin'] })
      toast.success(editing ? 'Leave type updated' : 'Leave type created')
      setShowForm(false)
      setEditing(null)
    },
    onError: () => toast.error('Failed to save'),
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/leave-types/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['leave-types-admin'] })
      toast.success('Deleted')
      setDeleting(null)
    },
    onError: () => toast.error('Failed to delete'),
  })

  const columns: ColumnDef<LeaveType>[] = [
    {
      id: 'color',
      header: '',
      cell: ({ row }) => (
        <div className="w-3 h-3 rounded-full" style={{ backgroundColor: row.original.color }} />
      ),
    },
    { accessorKey: 'name', header: 'Name', cell: ({ row }) => <span className="font-medium">{row.original.name}</span> },
    { accessorKey: 'code', header: 'Code', cell: ({ row }) => <span className="font-mono text-sm">{row.original.code}</span> },
    {
      accessorKey: 'is_paid',
      header: 'Paid',
      cell: ({ row }) => (
        <Badge variant={row.original.is_paid ? 'default' : 'secondary'}>{row.original.is_paid ? 'Yes' : 'No'}</Badge>
      ),
    },
    {
      accessorKey: 'accrual_rate',
      header: 'Accrual (hrs/wk)',
      cell: ({ row }) => row.original.accrual_rate != null ? Number(row.original.accrual_rate).toFixed(2) : <span className="text-slate-400">—</span>,
    },
    {
      accessorKey: 'max_balance',
      header: 'Max Balance',
      cell: ({ row }) => row.original.max_balance != null ? `${row.original.max_balance} hrs` : <span className="text-slate-400">Unlimited</span>,
    },
    {
      accessorKey: 'is_active',
      header: 'Status',
      cell: ({ row }) => (
        <Badge variant={row.original.is_active ? 'default' : 'secondary'}>{row.original.is_active ? 'Active' : 'Inactive'}</Badge>
      ),
    },
    {
      id: 'actions',
      header: '',
      cell: ({ row }) => (
        <div className="flex gap-1 justify-end">
          <Button size="sm" variant="ghost" onClick={() => { setEditing(row.original); setShowForm(true) }}>
            <Pencil className="h-3.5 w-3.5" />
          </Button>
          <Button size="sm" variant="ghost" className="text-red-500 hover:text-red-600" onClick={() => setDeleting(row.original)}>
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      ),
    },
  ]

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Leave Types</h1>
          <p className="text-sm text-slate-500 mt-0.5">Configure leave categories for your organisation</p>
        </div>
        <Button onClick={() => { setEditing(null); setShowForm(true) }}>
          <Plus className="h-4 w-4 mr-1.5" />
          New Leave Type
        </Button>
      </div>

      <DataTable columns={columns} data={leaveTypes} isLoading={isLoading} />

      <Dialog open={showForm} onOpenChange={(open) => { if (!open) { setShowForm(false); setEditing(null) } }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editing ? 'Edit Leave Type' : 'New Leave Type'}</DialogTitle>
          </DialogHeader>
          <LeaveTypeForm
            initial={editing ?? undefined}
            onSave={(data) => saveMutation.mutate(data)}
            onCancel={() => { setShowForm(false); setEditing(null) }}
            loading={saveMutation.isPending}
          />
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={!!deleting}
        onOpenChange={(open) => { if (!open) setDeleting(null) }}
        title="Delete Leave Type"
        description={`Delete "${deleting?.name}"? Employees with active balances for this type will be affected.`}
        onConfirm={() => deleting && deleteMutation.mutate(deleting.id)}
        isLoading={deleteMutation.isPending}
        variant="destructive"
      />
    </div>
  )
}
