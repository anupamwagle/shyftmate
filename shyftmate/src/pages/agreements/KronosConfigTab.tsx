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
import { Textarea } from '@/components/ui/textarea'
import { DataTable } from '@/components/DataTable'
import { EmptyState } from '@/components/EmptyState'
import { ConfirmDialog } from '@/components/ConfirmDialog'
import api, { showApiError } from '@/lib/api'
import type { KronosConfig } from '@/types'

const schema = z.object({
  config_key: z.string().min(1),
  config_value: z.string().min(1),
  description: z.string().optional(),
})

type KcForm = z.infer<typeof schema>

interface Props { agreementId: string }

function useKronosConfig(agreementId: string) {
  return useQuery<KronosConfig[]>({
    queryKey: ['kronos-config', agreementId],
    queryFn: async () => {
      const { data } = await api.get(`/agreements/${agreementId}/kronos-config`)
      return data
    },
    onError: (e) => showApiError(e, 'Failed to load Kronos config'),
  } as Parameters<typeof useQuery>[0])
}

export function KronosConfigTab({ agreementId }: Props) {
  const qc = useQueryClient()
  const { data = [], isLoading } = useKronosConfig(agreementId)
  const [editTarget, setEditTarget] = useState<KronosConfig | null>(null)
  const [modalOpen, setModalOpen] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null)

  const { register, handleSubmit, reset, formState: { errors } } = useForm<KcForm>({ resolver: zodResolver(schema) })

  const createMutation = useMutation({
    mutationFn: (p: KcForm) => api.post(`/agreements/${agreementId}/kronos-config`, p),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['kronos-config', agreementId] }); toast.success('Config created'); setModalOpen(false); reset() },
    onError: (e) => showApiError(e, 'Failed to create'),
  })

  const updateMutation = useMutation({
    mutationFn: ({ id, ...p }: KcForm & { id: string }) => api.patch(`/agreements/${agreementId}/kronos-config/${id}`, p),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['kronos-config', agreementId] }); toast.success('Updated'); setModalOpen(false); reset(); setEditTarget(null) },
    onError: (e) => showApiError(e, 'Failed to update'),
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/agreements/${agreementId}/kronos-config/${id}`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['kronos-config', agreementId] }); toast.success('Deleted'); setDeleteTarget(null) },
    onError: (e) => showApiError(e, 'Failed to delete'),
  })

  function openCreate() { setEditTarget(null); reset({}); setModalOpen(true) }
  function openEdit(kc: KronosConfig) { setEditTarget(kc); reset({ config_key: kc.config_key, config_value: kc.config_value, description: kc.description ?? '' }); setModalOpen(true) }

  const columns: ColumnDef<KronosConfig>[] = [
    { accessorKey: 'config_key', header: 'Config Key', cell: ({ row }) => <code className="text-xs bg-neutral-100 px-1.5 py-0.5 rounded">{row.original.config_key}</code> },
    { accessorKey: 'config_value', header: 'Value', cell: ({ row }) => <code className="text-xs">{row.original.config_value}</code> },
    { accessorKey: 'description', header: 'Description', cell: ({ row }) => row.original.description ?? '—' },
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
        <Button size="sm" onClick={openCreate}><Plus className="w-4 h-4 mr-1" />Add Config</Button>
      </div>
      <DataTable columns={columns} data={data} isLoading={isLoading}
        emptyState={<EmptyState title="No Kronos config" description="Add Kronos configuration keys for this agreement." action={{ label: 'Add Config', onClick: openCreate }} />}
      />
      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>{editTarget ? 'Edit' : 'Add'} Config Entry</DialogTitle></DialogHeader>
          <form onSubmit={handleSubmit((d) => editTarget ? updateMutation.mutate({ id: editTarget.id, ...d }) : createMutation.mutate(d))} className="space-y-4">
            <div className="space-y-1.5">
              <Label>Config Key *</Label>
              <Input placeholder="e.g. PAYGROUP_CODE" {...register('config_key')} />
              {errors.config_key && <p className="text-xs text-red-500">{errors.config_key.message}</p>}
            </div>
            <div className="space-y-1.5">
              <Label>Value *</Label>
              <Input {...register('config_value')} />
              {errors.config_value && <p className="text-xs text-red-500">{errors.config_value.message}</p>}
            </div>
            <div className="space-y-1.5">
              <Label>Description</Label>
              <Textarea rows={2} {...register('description')} />
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
      <ConfirmDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)} title="Delete Config" confirmLabel="Delete" variant="destructive" onConfirm={() => deleteTarget && deleteMutation.mutate(deleteTarget)} isLoading={deleteMutation.isPending} />
    </div>
  )
}
