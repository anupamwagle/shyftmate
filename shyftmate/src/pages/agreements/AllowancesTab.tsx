import React, { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { type ColumnDef } from '@tanstack/react-table'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Plus, Pencil, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { DataTable } from '@/components/DataTable'
import { Badge } from '@/components/ui/badge'
import { EmptyState } from '@/components/EmptyState'
import { ConfirmDialog } from '@/components/ConfirmDialog'
import api, { showApiError } from '@/lib/api'
import type { Allowance, AllowanceClass } from '@/types'

const CLASS_LABELS: Record<AllowanceClass, string> = {
  C: 'Claimable',
  D: 'Derivable',
  R: 'Recurring',
  P: 'Payrollable',
}

const schema = z.object({
  name: z.string().min(1),
  code: z.string().min(1),
  allowance_class: z.enum(['C', 'D', 'R', 'P'] as const),
  rate: z.coerce.number().nullable().optional(),
  unit: z.string().optional(),
  kronos_name: z.string().optional(),
  payslip_name: z.string().optional(),
})

type AllowanceForm = z.infer<typeof schema>

interface Props {
  agreementId: string
}

function useAllowances(agreementId: string) {
  return useQuery<Allowance[]>({
    queryKey: ['allowances', agreementId],
    queryFn: async () => {
      const { data } = await api.get(`/agreements/${agreementId}/allowances`)
      return data
    },
    onError: (e) => showApiError(e, 'Failed to load allowances'),
  } as Parameters<typeof useQuery>[0])
}

export function AllowancesTab({ agreementId }: Props) {
  const qc = useQueryClient()
  const { data = [], isLoading } = useAllowances(agreementId)
  const [editTarget, setEditTarget] = useState<Allowance | null>(null)
  const [modalOpen, setModalOpen] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null)

  const { register, handleSubmit, reset, setValue, formState: { errors } } = useForm<AllowanceForm>({
    resolver: zodResolver(schema),
    defaultValues: { allowance_class: 'C' },
  })

  const createMutation = useMutation({
    mutationFn: (p: AllowanceForm) => api.post(`/agreements/${agreementId}/allowances`, p),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['allowances', agreementId] })
      toast.success('Allowance created')
      setModalOpen(false)
      reset()
    },
    onError: (e) => showApiError(e, 'Failed to create allowance'),
  })

  const updateMutation = useMutation({
    mutationFn: ({ id, ...p }: AllowanceForm & { id: string }) =>
      api.patch(`/agreements/${agreementId}/allowances/${id}`, p),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['allowances', agreementId] })
      toast.success('Allowance updated')
      setModalOpen(false)
      reset()
      setEditTarget(null)
    },
    onError: (e) => showApiError(e, 'Failed to update allowance'),
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/agreements/${agreementId}/allowances/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['allowances', agreementId] })
      toast.success('Allowance deleted')
      setDeleteTarget(null)
    },
    onError: (e) => showApiError(e, 'Failed to delete allowance'),
  })

  function openCreate() {
    setEditTarget(null)
    reset({ name: '', code: '', allowance_class: 'C' })
    setModalOpen(true)
  }

  function openEdit(a: Allowance) {
    setEditTarget(a)
    reset({
      name: a.name, code: a.code, allowance_class: a.allowance_class,
      rate: a.rate ?? undefined, unit: a.unit ?? '',
      kronos_name: a.kronos_name ?? '', payslip_name: a.payslip_name ?? '',
    })
    setModalOpen(true)
  }

  const columns: ColumnDef<Allowance>[] = [
    { accessorKey: 'name', header: 'Name' },
    { accessorKey: 'code', header: 'Code' },
    {
      accessorKey: 'allowance_class',
      header: 'Class',
      cell: ({ row }) => (
        <Badge variant="info">{CLASS_LABELS[row.original.allowance_class]}</Badge>
      ),
    },
    {
      accessorKey: 'rate',
      header: 'Rate',
      cell: ({ row }) =>
        row.original.rate != null ? `${row.original.rate} ${row.original.unit ?? ''}`.trim() : '—',
    },
    { accessorKey: 'kronos_name', header: 'Kronos Name', cell: ({ row }) => row.original.kronos_name ?? '—' },
    { accessorKey: 'payslip_name', header: 'Payslip Name', cell: ({ row }) => row.original.payslip_name ?? '—' },
    {
      id: 'actions',
      header: '',
      cell: ({ row }) => (
        <div className="flex gap-1" onClick={(e) => e.stopPropagation()}>
          <Button variant="ghost" size="icon" onClick={() => openEdit(row.original)}>
            <Pencil className="w-3.5 h-3.5" />
          </Button>
          <Button variant="ghost" size="icon" className="text-red-500" onClick={() => setDeleteTarget(row.original.id)}>
            <Trash2 className="w-3.5 h-3.5" />
          </Button>
        </div>
      ),
    },
  ]

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button size="sm" onClick={openCreate}>
          <Plus className="w-4 h-4 mr-1" />
          Add Allowance
        </Button>
      </div>

      <DataTable
        columns={columns}
        data={data}
        isLoading={isLoading}
        emptyState={
          <EmptyState
            title="No allowances"
            description="Add allowances for this agreement."
            action={{ label: 'Add Allowance', onClick: openCreate }}
          />
        }
      />

      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editTarget ? 'Edit Allowance' : 'Add Allowance'}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit((d) => editTarget ? updateMutation.mutate({ id: editTarget.id, ...d }) : createMutation.mutate(d))} className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Name *</Label>
                <Input {...register('name')} />
                {errors.name && <p className="text-xs text-red-500">{errors.name.message}</p>}
              </div>
              <div className="space-y-1.5">
                <Label>Code *</Label>
                <Input {...register('code')} />
              </div>
              <div className="space-y-1.5">
                <Label>Class</Label>
                <Select defaultValue="C" onValueChange={(v) => setValue('allowance_class', v as AllowanceClass)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {(Object.entries(CLASS_LABELS) as [AllowanceClass, string][]).map(([k, v]) => (
                      <SelectItem key={k} value={k}>{v} ({k})</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Rate</Label>
                <Input type="number" step="0.01" {...register('rate')} />
              </div>
              <div className="space-y-1.5">
                <Label>Unit</Label>
                <Input placeholder="e.g. per km" {...register('unit')} />
              </div>
              <div className="space-y-1.5">
                <Label>Kronos Name</Label>
                <Input {...register('kronos_name')} />
              </div>
              <div className="space-y-1.5 col-span-2">
                <Label>Payslip Name</Label>
                <Input {...register('payslip_name')} />
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

      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(o) => !o && setDeleteTarget(null)}
        title="Delete Allowance"
        confirmLabel="Delete"
        variant="destructive"
        onConfirm={() => deleteTarget && deleteMutation.mutate(deleteTarget)}
        isLoading={deleteMutation.isPending}
      />
    </div>
  )
}
