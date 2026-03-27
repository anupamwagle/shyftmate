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
import { formatNumber } from '@/lib/utils'
import type { LeavePaycode } from '@/types'

const schema = z.object({
  leave_type_name: z.string().min(1),
  leave_type_code: z.string().min(1),
  kronos_paycode: z.string().optional(),
  keypay_code: z.string().optional(),
  payslip_name: z.string().optional(),
  accrual_rate: z.coerce.number().nullable().optional(),
})

type LpForm = z.infer<typeof schema>

interface Props { agreementId: string }

function useLeavePaycodes(agreementId: string) {
  return useQuery<LeavePaycode[]>({
    queryKey: ['leave-paycodes', agreementId],
    queryFn: async () => {
      const { data } = await api.get(`/agreements/${agreementId}/leave-paycodes`)
      return data
    },
    onError: (e) => showApiError(e, 'Failed to load leave paycodes'),
  } as Parameters<typeof useQuery>[0])
}

export function LeavePaycodesTab({ agreementId }: Props) {
  const qc = useQueryClient()
  const { data = [], isLoading } = useLeavePaycodes(agreementId)
  const [editTarget, setEditTarget] = useState<LeavePaycode | null>(null)
  const [modalOpen, setModalOpen] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null)

  const { register, handleSubmit, reset, formState: { errors } } = useForm<LpForm>({
    resolver: zodResolver(schema),
  })

  const createMutation = useMutation({
    mutationFn: (p: LpForm) => api.post(`/agreements/${agreementId}/leave-paycodes`, p),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['leave-paycodes', agreementId] }); toast.success('Leave paycode created'); setModalOpen(false); reset() },
    onError: (e) => showApiError(e, 'Failed to create'),
  })

  const updateMutation = useMutation({
    mutationFn: ({ id, ...p }: LpForm & { id: string }) => api.patch(`/agreements/${agreementId}/leave-paycodes/${id}`, p),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['leave-paycodes', agreementId] }); toast.success('Leave paycode updated'); setModalOpen(false); reset(); setEditTarget(null) },
    onError: (e) => showApiError(e, 'Failed to update'),
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/agreements/${agreementId}/leave-paycodes/${id}`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['leave-paycodes', agreementId] }); toast.success('Deleted'); setDeleteTarget(null) },
    onError: (e) => showApiError(e, 'Failed to delete'),
  })

  function openCreate() { setEditTarget(null); reset({}); setModalOpen(true) }
  function openEdit(lp: LeavePaycode) {
    setEditTarget(lp)
    reset({ leave_type_name: lp.leave_type_name, leave_type_code: lp.leave_type_code, kronos_paycode: lp.kronos_paycode ?? '', keypay_code: lp.keypay_code ?? '', payslip_name: lp.payslip_name ?? '', accrual_rate: lp.accrual_rate ?? undefined })
    setModalOpen(true)
  }

  const columns: ColumnDef<LeavePaycode>[] = [
    { accessorKey: 'leave_type_name', header: 'Leave Type' },
    { accessorKey: 'leave_type_code', header: 'Code' },
    { accessorKey: 'kronos_paycode', header: 'Kronos Paycode', cell: ({ row }) => row.original.kronos_paycode ?? '—' },
    { accessorKey: 'keypay_code', header: 'KeyPay Code', cell: ({ row }) => row.original.keypay_code ?? '—' },
    { accessorKey: 'payslip_name', header: 'Payslip Name', cell: ({ row }) => row.original.payslip_name ?? '—' },
    { accessorKey: 'accrual_rate', header: 'Accrual Rate', cell: ({ row }) => row.original.accrual_rate != null ? formatNumber(row.original.accrual_rate, 4) : '—' },
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
        <Button size="sm" onClick={openCreate}><Plus className="w-4 h-4 mr-1" />Add Leave Paycode</Button>
      </div>
      <DataTable columns={columns} data={data} isLoading={isLoading}
        emptyState={<EmptyState title="No leave paycodes" description="Map leave types to their payroll codes." action={{ label: 'Add Leave Paycode', onClick: openCreate }} />}
      />
      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>{editTarget ? 'Edit' : 'Add'} Leave Paycode</DialogTitle></DialogHeader>
          <form onSubmit={handleSubmit((d) => editTarget ? updateMutation.mutate({ id: editTarget.id, ...d }) : createMutation.mutate(d))} className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Leave Type Name *</Label>
                <Input {...register('leave_type_name')} />
                {errors.leave_type_name && <p className="text-xs text-red-500">{errors.leave_type_name.message}</p>}
              </div>
              <div className="space-y-1.5">
                <Label>Code *</Label>
                <Input {...register('leave_type_code')} />
              </div>
              <div className="space-y-1.5">
                <Label>Kronos Paycode</Label>
                <Input {...register('kronos_paycode')} />
              </div>
              <div className="space-y-1.5">
                <Label>KeyPay Code</Label>
                <Input {...register('keypay_code')} />
              </div>
              <div className="space-y-1.5">
                <Label>Payslip Name</Label>
                <Input {...register('payslip_name')} />
              </div>
              <div className="space-y-1.5">
                <Label>Accrual Rate</Label>
                <Input type="number" step="0.0001" {...register('accrual_rate')} />
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
      <ConfirmDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)} title="Delete Leave Paycode" confirmLabel="Delete" variant="destructive" onConfirm={() => deleteTarget && deleteMutation.mutate(deleteTarget)} isLoading={deleteMutation.isPending} />
    </div>
  )
}
