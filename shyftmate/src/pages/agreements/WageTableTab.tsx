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
import { DataTable } from '@/components/DataTable'
import { EmptyState } from '@/components/EmptyState'
import { ConfirmDialog } from '@/components/ConfirmDialog'
import api, { showApiError } from '@/lib/api'
import { formatCurrency, formatDate } from '@/lib/utils'
import type { WageTableEntry } from '@/types'

const schema = z.object({
  classification: z.string().min(1),
  level: z.string().optional(),
  base_rate: z.coerce.number().min(0),
  casual_loading: z.coerce.number().nullable().optional(),
  effective_date: z.string().min(1),
  expiry_date: z.string().optional(),
})

type WageForm = z.infer<typeof schema>

interface Props { agreementId: string }

function useWageTable(agreementId: string) {
  return useQuery<WageTableEntry[]>({
    queryKey: ['wage-table', agreementId],
    queryFn: async () => {
      const { data } = await api.get(`/agreements/${agreementId}/wage-table`)
      return data
    },
    onError: (e) => showApiError(e, 'Failed to load wage table'),
  } as Parameters<typeof useQuery>[0])
}

export function WageTableTab({ agreementId }: Props) {
  const qc = useQueryClient()
  const { data = [], isLoading } = useWageTable(agreementId)
  const [editTarget, setEditTarget] = useState<WageTableEntry | null>(null)
  const [modalOpen, setModalOpen] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null)

  const { register, handleSubmit, reset, formState: { errors } } = useForm<WageForm>({
    resolver: zodResolver(schema),
  })

  const createMutation = useMutation({
    mutationFn: (p: WageForm) => api.post(`/agreements/${agreementId}/wage-table`, p),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['wage-table', agreementId] }); toast.success('Wage entry created'); setModalOpen(false); reset() },
    onError: (e) => showApiError(e, 'Failed to create'),
  })

  const updateMutation = useMutation({
    mutationFn: ({ id, ...p }: WageForm & { id: string }) => api.patch(`/agreements/${agreementId}/wage-table/${id}`, p),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['wage-table', agreementId] }); toast.success('Updated'); setModalOpen(false); reset(); setEditTarget(null) },
    onError: (e) => showApiError(e, 'Failed to update'),
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/agreements/${agreementId}/wage-table/${id}`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['wage-table', agreementId] }); toast.success('Deleted'); setDeleteTarget(null) },
    onError: (e) => showApiError(e, 'Failed to delete'),
  })

  function openCreate() { setEditTarget(null); reset({}); setModalOpen(true) }
  function openEdit(w: WageTableEntry) {
    setEditTarget(w)
    reset({ classification: w.classification, level: w.level ?? '', base_rate: w.base_rate, casual_loading: w.casual_loading ?? undefined, effective_date: w.effective_date.split('T')[0], expiry_date: w.expiry_date?.split('T')[0] })
    setModalOpen(true)
  }

  const columns: ColumnDef<WageTableEntry>[] = [
    { accessorKey: 'classification', header: 'Classification' },
    { accessorKey: 'level', header: 'Level', cell: ({ row }) => row.original.level ?? '—' },
    { accessorKey: 'base_rate', header: 'Base Rate', cell: ({ row }) => formatCurrency(row.original.base_rate) },
    { accessorKey: 'casual_loading', header: 'Casual Loading', cell: ({ row }) => row.original.casual_loading != null ? `${row.original.casual_loading}%` : '—' },
    { accessorKey: 'effective_date', header: 'Effective', cell: ({ row }) => formatDate(row.original.effective_date) },
    { accessorKey: 'expiry_date', header: 'Expires', cell: ({ row }) => formatDate(row.original.expiry_date) },
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
        <Button size="sm" onClick={openCreate}><Plus className="w-4 h-4 mr-1" />Add Wage Entry</Button>
      </div>
      <DataTable columns={columns} data={data} isLoading={isLoading}
        emptyState={<EmptyState title="No wage entries" action={{ label: 'Add Wage Entry', onClick: openCreate }} />}
      />
      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>{editTarget ? 'Edit' : 'Add'} Wage Entry</DialogTitle></DialogHeader>
          <form onSubmit={handleSubmit((d) => editTarget ? updateMutation.mutate({ id: editTarget.id, ...d }) : createMutation.mutate(d))} className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2 space-y-1.5">
                <Label>Classification *</Label>
                <Input placeholder="e.g. Retail Employee Level 1" {...register('classification')} />
                {errors.classification && <p className="text-xs text-red-500">{errors.classification.message}</p>}
              </div>
              <div className="space-y-1.5">
                <Label>Level</Label>
                <Input placeholder="e.g. 1" {...register('level')} />
              </div>
              <div className="space-y-1.5">
                <Label>Base Rate ($/hr) *</Label>
                <Input type="number" step="0.01" {...register('base_rate')} />
                {errors.base_rate && <p className="text-xs text-red-500">{errors.base_rate.message}</p>}
              </div>
              <div className="space-y-1.5">
                <Label>Casual Loading %</Label>
                <Input type="number" step="0.01" {...register('casual_loading')} />
              </div>
              <div className="space-y-1.5">
                <Label>Effective Date *</Label>
                <Input type="date" {...register('effective_date')} />
                {errors.effective_date && <p className="text-xs text-red-500">{errors.effective_date.message}</p>}
              </div>
              <div className="col-span-2 space-y-1.5">
                <Label>Expiry Date</Label>
                <Input type="date" {...register('expiry_date')} />
              </div>
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
      <ConfirmDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)} title="Delete Wage Entry" confirmLabel="Delete" variant="destructive" onConfirm={() => deleteTarget && deleteMutation.mutate(deleteTarget)} isLoading={deleteMutation.isPending} />
    </div>
  )
}
