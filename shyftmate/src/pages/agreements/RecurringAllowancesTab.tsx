import React, { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { type ColumnDef } from '@tanstack/react-table'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Plus, Pencil, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { DataTable } from '@/components/DataTable'
import { EmptyState } from '@/components/EmptyState'
import { ConfirmDialog } from '@/components/ConfirmDialog'
import { StatusBadge } from '@/components/StatusBadge'
import api, { showApiError } from '@/lib/api'
import { formatCurrency, titleCase } from '@/lib/utils'
import type { RecurringAllowance } from '@/types'

const schema = z.object({
  name: z.string().min(1),
  amount: z.coerce.number().min(0),
  frequency: z.enum(['weekly', 'fortnightly', 'monthly'] as const),
  kronos_name: z.string().optional(),
  is_active: z.boolean().default(true),
})

type RaForm = z.infer<typeof schema>

interface Props { agreementId: string }

function useRecurringAllowances(agreementId: string) {
  return useQuery<RecurringAllowance[]>({
    queryKey: ['recurring-allowances', agreementId],
    queryFn: async () => {
      const { data } = await api.get(`/agreements/${agreementId}/recurring-allowances`)
      return data
    },
    onError: (e) => showApiError(e, 'Failed to load recurring allowances'),
  } as Parameters<typeof useQuery>[0])
}

export function RecurringAllowancesTab({ agreementId }: Props) {
  const qc = useQueryClient()
  const { data = [], isLoading } = useRecurringAllowances(agreementId)
  const [editTarget, setEditTarget] = useState<RecurringAllowance | null>(null)
  const [modalOpen, setModalOpen] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null)

  const { register, handleSubmit, reset, setValue, formState: { errors } } = useForm<RaForm>({
    resolver: zodResolver(schema),
    defaultValues: { frequency: 'weekly', is_active: true },
  })

  const createMutation = useMutation({
    mutationFn: (p: RaForm) => api.post(`/agreements/${agreementId}/recurring-allowances`, p),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['recurring-allowances', agreementId] }); toast.success('Created'); setModalOpen(false); reset() },
    onError: (e) => showApiError(e, 'Failed to create'),
  })

  const updateMutation = useMutation({
    mutationFn: ({ id, ...p }: RaForm & { id: string }) => api.patch(`/agreements/${agreementId}/recurring-allowances/${id}`, p),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['recurring-allowances', agreementId] }); toast.success('Updated'); setModalOpen(false); reset(); setEditTarget(null) },
    onError: (e) => showApiError(e, 'Failed to update'),
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/agreements/${agreementId}/recurring-allowances/${id}`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['recurring-allowances', agreementId] }); toast.success('Deleted'); setDeleteTarget(null) },
    onError: (e) => showApiError(e, 'Failed to delete'),
  })

  function openCreate() { setEditTarget(null); reset({ frequency: 'weekly', is_active: true }); setModalOpen(true) }
  function openEdit(ra: RecurringAllowance) {
    setEditTarget(ra)
    reset({ name: ra.name, amount: ra.amount, frequency: ra.frequency, kronos_name: ra.kronos_name ?? '', is_active: ra.is_active })
    setModalOpen(true)
  }

  const columns: ColumnDef<RecurringAllowance>[] = [
    { accessorKey: 'name', header: 'Name' },
    { accessorKey: 'amount', header: 'Amount', cell: ({ row }) => formatCurrency(row.original.amount) },
    { accessorKey: 'frequency', header: 'Frequency', cell: ({ row }) => titleCase(row.original.frequency) },
    { accessorKey: 'kronos_name', header: 'Kronos Name', cell: ({ row }) => row.original.kronos_name ?? '—' },
    { accessorKey: 'is_active', header: 'Status', cell: ({ row }) => <StatusBadge status={row.original.is_active ? 'active' : 'archived'} /> },
    {
      id: 'actions', header: '',
      cell: ({ row }) => (
        <div className="flex gap-1" onClick={(e) => e.stopPropagation()}>
          <Button variant="ghost" size="icon" onClick={() => openEdit(row.original)}><Pencil className="w-3.5 h-3.5" /></Button>
          <Button variant="ghost" size="icon" className="text-red-500" onClick={() => setDeleteTarget(row.original.id)}><Trash2 className="w-3.5 h-3.5" /></Button>
        </div>
      ),
    },
  ]

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button size="sm" onClick={openCreate}><Plus className="w-4 h-4 mr-1" />Add Recurring Allowance</Button>
      </div>
      <DataTable columns={columns} data={data} isLoading={isLoading}
        emptyState={<EmptyState title="No recurring allowances" action={{ label: 'Add Recurring Allowance', onClick: openCreate }} />}
      />
      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>{editTarget ? 'Edit' : 'Add'} Recurring Allowance</DialogTitle></DialogHeader>
          <form onSubmit={handleSubmit((d) => editTarget ? updateMutation.mutate({ id: editTarget.id, ...d }) : createMutation.mutate(d))} className="space-y-4">
            <div className="space-y-1.5">
              <Label>Name *</Label>
              <Input {...register('name')} />
              {errors.name && <p className="text-xs text-red-500">{errors.name.message}</p>}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Amount ($) *</Label>
                <Input type="number" step="0.01" {...register('amount')} />
                {errors.amount && <p className="text-xs text-red-500">{errors.amount.message}</p>}
              </div>
              <div className="space-y-1.5">
                <Label>Frequency</Label>
                <Select defaultValue="weekly" onValueChange={(v) => setValue('frequency', v as 'weekly' | 'fortnightly' | 'monthly')}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="weekly">Weekly</SelectItem>
                    <SelectItem value="fortnightly">Fortnightly</SelectItem>
                    <SelectItem value="monthly">Monthly</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Kronos Name</Label>
              <Input {...register('kronos_name')} />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setModalOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={createMutation.isPending || updateMutation.isPending}>
                {createMutation.isPending || updateMutation.isPending ? 'Saving...' : 'Save'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
      <ConfirmDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)} title="Delete Recurring Allowance" confirmLabel="Delete" variant="destructive" onConfirm={() => deleteTarget && deleteMutation.mutate(deleteTarget)} isLoading={deleteMutation.isPending} />
    </div>
  )
}
