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
import { Textarea } from '@/components/ui/textarea'
import { Switch } from '@/components/ui/switch'
import { DataTable } from '@/components/DataTable'
import { StatusBadge } from '@/components/StatusBadge'
import { EmptyState } from '@/components/EmptyState'
import { ConfirmDialog } from '@/components/ConfirmDialog'
import api, { showApiError } from '@/lib/api'
import type { EmployeeType } from '@/types'

const schema = z.object({
  name: z.string().min(1, 'Name is required'),
  code: z.string().min(1, 'Code is required'),
  description: z.string().optional(),
  is_active: z.boolean().default(true),
})

type EtForm = z.infer<typeof schema>

interface Props {
  agreementId: string
}

function useEmployeeTypes(agreementId: string) {
  return useQuery<EmployeeType[]>({
    queryKey: ['employee-types', agreementId],
    queryFn: async () => {
      const { data } = await api.get(`/agreements/${agreementId}/employee-types`)
      return data
    },
    onError: (e) => showApiError(e, 'Failed to load employee types'),
  } as Parameters<typeof useQuery>[0])
}

export function EmployeeTypesTab({ agreementId }: Props) {
  const qc = useQueryClient()
  const { data = [], isLoading } = useEmployeeTypes(agreementId)
  const [editTarget, setEditTarget] = useState<EmployeeType | null>(null)
  const [modalOpen, setModalOpen] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null)

  const { register, handleSubmit, reset, setValue, watch, formState: { errors } } = useForm<EtForm>({
    resolver: zodResolver(schema),
    defaultValues: { is_active: true },
  })

  const createMutation = useMutation({
    mutationFn: (payload: EtForm) =>
      api.post(`/agreements/${agreementId}/employee-types`, payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['employee-types', agreementId] })
      toast.success('Employee type created')
      setModalOpen(false)
      reset()
    },
    onError: (e) => showApiError(e, 'Failed to create employee type'),
  })

  const updateMutation = useMutation({
    mutationFn: ({ id, ...payload }: EtForm & { id: string }) =>
      api.patch(`/agreements/${agreementId}/employee-types/${id}`, payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['employee-types', agreementId] })
      toast.success('Employee type updated')
      setModalOpen(false)
      reset()
      setEditTarget(null)
    },
    onError: (e) => showApiError(e, 'Failed to update employee type'),
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) =>
      api.delete(`/agreements/${agreementId}/employee-types/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['employee-types', agreementId] })
      toast.success('Employee type deleted')
      setDeleteTarget(null)
    },
    onError: (e) => showApiError(e, 'Failed to delete employee type'),
  })

  function openCreate() {
    setEditTarget(null)
    reset({ name: '', code: '', description: '', is_active: true })
    setModalOpen(true)
  }

  function openEdit(et: EmployeeType) {
    setEditTarget(et)
    reset({
      name: et.name,
      code: et.code,
      description: et.description ?? '',
      is_active: et.is_active,
    })
    setModalOpen(true)
  }

  function onSubmit(data: EtForm) {
    if (editTarget) {
      updateMutation.mutate({ id: editTarget.id, ...data })
    } else {
      createMutation.mutate(data)
    }
  }

  const columns: ColumnDef<EmployeeType>[] = [
    { accessorKey: 'name', header: 'Name' },
    { accessorKey: 'code', header: 'Code' },
    {
      accessorKey: 'description',
      header: 'Description',
      cell: ({ row }) => row.original.description ?? '—',
    },
    {
      accessorKey: 'is_active',
      header: 'Status',
      cell: ({ row }) => (
        <StatusBadge status={row.original.is_active ? 'active' : 'archived'} />
      ),
    },
    {
      id: 'actions',
      header: '',
      cell: ({ row }) => (
        <div className="flex gap-1" onClick={(e) => e.stopPropagation()}>
          <Button variant="ghost" size="icon" onClick={() => openEdit(row.original)}>
            <Pencil className="w-3.5 h-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="text-red-500 hover:text-red-600"
            onClick={() => setDeleteTarget(row.original.id)}
          >
            <Trash2 className="w-3.5 h-3.5" />
          </Button>
        </div>
      ),
    },
  ]

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-neutral-500">Employee classifications within this agreement</p>
        <Button size="sm" onClick={openCreate}>
          <Plus className="w-4 h-4 mr-1" />
          Add Employee Type
        </Button>
      </div>

      <DataTable
        columns={columns}
        data={data}
        isLoading={isLoading}
        emptyState={
          <EmptyState
            title="No employee types"
            description="Add employee types to define the classifications in this agreement."
            action={{ label: 'Add Employee Type', onClick: openCreate }}
          />
        }
      />

      {/* Modal */}
      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{editTarget ? 'Edit Employee Type' : 'Add Employee Type'}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div className="space-y-1.5">
              <Label>Name *</Label>
              <Input placeholder="e.g. Full-time" {...register('name')} />
              {errors.name && <p className="text-xs text-red-500">{errors.name.message}</p>}
            </div>
            <div className="space-y-1.5">
              <Label>Code *</Label>
              <Input placeholder="e.g. FT" {...register('code')} />
              {errors.code && <p className="text-xs text-red-500">{errors.code.message}</p>}
            </div>
            <div className="space-y-1.5">
              <Label>Description</Label>
              <Textarea rows={2} {...register('description')} />
            </div>
            <div className="flex items-center justify-between">
              <Label>Active</Label>
              <Switch
                checked={watch('is_active')}
                onCheckedChange={(v) => setValue('is_active', v, { shouldDirty: true })}
              />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setModalOpen(false)}>
                Cancel
              </Button>
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
        title="Delete Employee Type"
        description="This will permanently delete this employee type and all associated rule lines."
        confirmLabel="Delete"
        variant="destructive"
        onConfirm={() => deleteTarget && deleteMutation.mutate(deleteTarget)}
        isLoading={deleteMutation.isPending}
      />
    </div>
  )
}
