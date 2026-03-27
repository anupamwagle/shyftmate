import React, { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, Pencil, Trash2, Search } from 'lucide-react'
import { toast } from 'sonner'
import { api } from '../../lib/api'
import { Button } from '../../components/ui/button'
import { Input } from '../../components/ui/input'
import { Badge } from '../../components/ui/badge'
import { DataTable } from '../../components/DataTable'
import { ConfirmDialog } from '../../components/ConfirmDialog'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '../../components/ui/dialog'
import { Label } from '../../components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../../components/ui/select'
import { Switch } from '../../components/ui/switch'

interface KronosPaycode {
  id: string
  aus_oracle_element: string
  paycode: string
  paycode_type: string
  aus_oracle_leave_reason: string | null
  export_to_payroll: boolean
  is_active: boolean
}

const PAYCODE_TYPES = ['regular', 'overtime', 'penalty', 'allowance', 'leave', 'other']

function PaycodeForm({
  initial,
  onSave,
  onCancel,
}: {
  initial?: Partial<KronosPaycode>
  onSave: (data: Partial<KronosPaycode>) => void
  onCancel: () => void
}) {
  const [form, setForm] = useState<Partial<KronosPaycode>>({
    aus_oracle_element: '',
    paycode: '',
    paycode_type: 'regular',
    aus_oracle_leave_reason: '',
    export_to_payroll: true,
    is_active: true,
    ...initial,
  })

  const set = (field: keyof KronosPaycode, value: unknown) =>
    setForm((f) => ({ ...f, [field]: value }))

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1">
          <Label>Oracle Element</Label>
          <Input
            value={form.aus_oracle_element}
            onChange={(e) => set('aus_oracle_element', e.target.value)}
            placeholder="e.g. AU_OT_15X"
          />
        </div>
        <div className="space-y-1">
          <Label>Paycode *</Label>
          <Input
            value={form.paycode}
            onChange={(e) => set('paycode', e.target.value)}
            placeholder="e.g. OVERTIME_1_5"
          />
        </div>
        <div className="space-y-1">
          <Label>Paycode Type</Label>
          <Select
            value={form.paycode_type}
            onValueChange={(v) => set('paycode_type', v)}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PAYCODE_TYPES.map((t) => (
                <SelectItem key={t} value={t}>
                  {t.charAt(0).toUpperCase() + t.slice(1)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label>Leave Reason (optional)</Label>
          <Input
            value={form.aus_oracle_leave_reason || ''}
            onChange={(e) => set('aus_oracle_leave_reason', e.target.value || null)}
            placeholder="e.g. ANNUAL_LEAVE"
          />
        </div>
      </div>
      <div className="flex gap-6">
        <div className="flex items-center gap-2">
          <Switch
            checked={!!form.export_to_payroll}
            onCheckedChange={(v) => set('export_to_payroll', v)}
          />
          <Label>Export to Payroll</Label>
        </div>
        <div className="flex items-center gap-2">
          <Switch
            checked={!!form.is_active}
            onCheckedChange={(v) => set('is_active', v)}
          />
          <Label>Active</Label>
        </div>
      </div>
      <DialogFooter>
        <Button variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <Button
          onClick={() => onSave(form)}
          disabled={!form.paycode}
        >
          Save Paycode
        </Button>
      </DialogFooter>
    </div>
  )
}

export default function PaycodesPage() {
  const qc = useQueryClient()
  const [search, setSearch] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState<KronosPaycode | null>(null)
  const [deleting, setDeleting] = useState<KronosPaycode | null>(null)

  const { data: paycodes = [], isLoading } = useQuery<KronosPaycode[]>({
    queryKey: ['paycodes'],
    queryFn: () => api.get('/paycodes').then((r) => r.data),
  })

  const saveMutation = useMutation({
    mutationFn: (data: Partial<KronosPaycode>) =>
      editing
        ? api.patch(`/paycodes/${editing.id}`, data).then((r) => r.data)
        : api.post('/paycodes', data).then((r) => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['paycodes'] })
      toast.success(editing ? 'Paycode updated' : 'Paycode created')
      setShowForm(false)
      setEditing(null)
    },
    onError: () => toast.error('Failed to save paycode'),
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/paycodes/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['paycodes'] })
      toast.success('Paycode deleted')
      setDeleting(null)
    },
    onError: () => toast.error('Failed to delete paycode'),
  })

  const filtered = paycodes.filter(
    (p) =>
      p.paycode.toLowerCase().includes(search.toLowerCase()) ||
      p.aus_oracle_element.toLowerCase().includes(search.toLowerCase()),
  )

  const columns = [
    { key: 'paycode', header: 'Paycode', render: (r: KronosPaycode) => <span className="font-mono text-sm font-medium">{r.paycode}</span> },
    { key: 'aus_oracle_element', header: 'Oracle Element', render: (r: KronosPaycode) => <span className="font-mono text-sm text-slate-500">{r.aus_oracle_element}</span> },
    {
      key: 'paycode_type',
      header: 'Type',
      render: (r: KronosPaycode) => (
        <Badge variant="outline" className="capitalize">
          {r.paycode_type}
        </Badge>
      ),
    },
    { key: 'aus_oracle_leave_reason', header: 'Leave Reason', render: (r: KronosPaycode) => r.aus_oracle_leave_reason || <span className="text-slate-400">—</span> },
    {
      key: 'export_to_payroll',
      header: 'Export',
      render: (r: KronosPaycode) => (
        <Badge variant={r.export_to_payroll ? 'default' : 'secondary'}>
          {r.export_to_payroll ? 'Yes' : 'No'}
        </Badge>
      ),
    },
    {
      key: 'is_active',
      header: 'Status',
      render: (r: KronosPaycode) => (
        <Badge variant={r.is_active ? 'default' : 'secondary'}>
          {r.is_active ? 'Active' : 'Inactive'}
        </Badge>
      ),
    },
    {
      key: 'actions',
      header: '',
      render: (r: KronosPaycode) => (
        <div className="flex gap-1 justify-end">
          <Button
            size="sm"
            variant="ghost"
            onClick={() => { setEditing(r); setShowForm(true) }}
          >
            <Pencil className="h-3.5 w-3.5" />
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="text-red-500 hover:text-red-600"
            onClick={() => setDeleting(r)}
          >
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
          <h1 className="text-2xl font-semibold text-slate-900">Kronos Paycodes</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Global paycode library shared across all agreements
          </p>
        </div>
        <Button onClick={() => { setEditing(null); setShowForm(true) }}>
          <Plus className="h-4 w-4 mr-1.5" />
          New Paycode
        </Button>
      </div>

      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
        <Input
          placeholder="Search paycodes…"
          className="pl-9"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      <DataTable columns={columns} data={filtered} loading={isLoading} />

      <Dialog
        open={showForm}
        onOpenChange={(open) => { if (!open) { setShowForm(false); setEditing(null) } }}
      >
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{editing ? 'Edit Paycode' : 'New Paycode'}</DialogTitle>
          </DialogHeader>
          <PaycodeForm
            initial={editing ?? undefined}
            onSave={(data) => saveMutation.mutate(data)}
            onCancel={() => { setShowForm(false); setEditing(null) }}
          />
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={!!deleting}
        title="Delete Paycode"
        description={`Delete "${deleting?.paycode}"? This may affect existing rule lines referencing it.`}
        onConfirm={() => deleting && deleteMutation.mutate(deleting.id)}
        onCancel={() => setDeleting(null)}
        loading={deleteMutation.isPending}
        destructive
      />
    </div>
  )
}
