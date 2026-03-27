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
import { StatusBadge } from '@/components/StatusBadge'
import { EmptyState } from '@/components/EmptyState'
import { ConfirmDialog } from '@/components/ConfirmDialog'
import api, { showApiError } from '@/lib/api'
import type { Location } from '@/types'

const schema = z.object({
  name: z.string().min(1),
  address: z.string().optional(),
  timezone: z.string().default('Australia/Sydney'),
  is_active: z.boolean().default(true),
})

type LocForm = z.infer<typeof schema>

function useLocations() {
  return useQuery<Location[]>({
    queryKey: ['locations'],
    queryFn: async () => {
      const { data } = await api.get('/admin/locations')
      return data
    },
    onError: (e) => showApiError(e, 'Failed to load locations'),
  } as Parameters<typeof useQuery>[0])
}

export default function LocationsPage() {
  const qc = useQueryClient()
  const { data = [], isLoading } = useLocations()
  const [editTarget, setEditTarget] = useState<Location | null>(null)
  const [modalOpen, setModalOpen] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null)

  const { register, handleSubmit, reset, formState: { errors } } = useForm<LocForm>({
    resolver: zodResolver(schema),
    defaultValues: { timezone: 'Australia/Sydney', is_active: true },
  })

  const createMutation = useMutation({
    mutationFn: (p: LocForm) => api.post('/admin/locations', p),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['locations'] }); toast.success('Location created'); setModalOpen(false); reset() },
    onError: (e) => showApiError(e, 'Failed to create'),
  })

  const updateMutation = useMutation({
    mutationFn: ({ id, ...p }: LocForm & { id: string }) => api.patch(`/admin/locations/${id}`, p),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['locations'] }); toast.success('Updated'); setModalOpen(false); setEditTarget(null) },
    onError: (e) => showApiError(e, 'Failed to update'),
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/admin/locations/${id}`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['locations'] }); toast.success('Deleted'); setDeleteTarget(null) },
    onError: (e) => showApiError(e, 'Failed to delete'),
  })

  function openCreate() { setEditTarget(null); reset({ timezone: 'Australia/Sydney', is_active: true }); setModalOpen(true) }
  function openEdit(l: Location) { setEditTarget(l); reset({ name: l.name, address: l.address ?? '', timezone: l.timezone, is_active: l.is_active }); setModalOpen(true) }

  const columns: ColumnDef<Location>[] = [
    { accessorKey: 'name', header: 'Name' },
    { accessorKey: 'address', header: 'Address', cell: ({ row }) => row.original.address ?? '—' },
    { accessorKey: 'timezone', header: 'Timezone' },
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
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-neutral-900">Locations</h1>
          <p className="text-neutral-500 text-sm mt-1">Manage physical locations and sites</p>
        </div>
        <Button onClick={openCreate}><Plus className="w-4 h-4 mr-2" />Add Location</Button>
      </div>

      <DataTable columns={columns} data={data} isLoading={isLoading}
        emptyState={<EmptyState title="No locations" action={{ label: 'Add Location', onClick: openCreate }} />}
      />

      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>{editTarget ? 'Edit' : 'Add'} Location</DialogTitle></DialogHeader>
          <form onSubmit={handleSubmit((d) => editTarget ? updateMutation.mutate({ id: editTarget.id, ...d }) : createMutation.mutate(d))} className="space-y-4">
            <div className="space-y-1.5">
              <Label>Name *</Label>
              <Input {...register('name')} />
              {errors.name && <p className="text-xs text-red-500">{errors.name.message}</p>}
            </div>
            <div className="space-y-1.5">
              <Label>Address</Label>
              <Input {...register('address')} />
            </div>
            <div className="space-y-1.5">
              <Label>Timezone</Label>
              <Input {...register('timezone')} />
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
      <ConfirmDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)} title="Delete Location" confirmLabel="Delete" variant="destructive" onConfirm={() => deleteTarget && deleteMutation.mutate(deleteTarget)} isLoading={deleteMutation.isPending} />
    </div>
  )
}
