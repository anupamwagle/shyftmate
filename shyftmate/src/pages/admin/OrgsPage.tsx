import React, { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { type ColumnDef } from '@tanstack/react-table'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Plus, Building2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { DataTable } from '@/components/DataTable'
import { StatusBadge } from '@/components/StatusBadge'
import { EmptyState } from '@/components/EmptyState'
import { Switch } from '@/components/ui/switch'
import api, { showApiError } from '@/lib/api'
import { formatDate, formatNumber } from '@/lib/utils'
import type { Org } from '@/types'

const schema = z.object({
  name: z.string().min(1),
  slug: z.string().min(1).regex(/^[a-z0-9-]+$/, 'Only lowercase letters, numbers and hyphens'),
  plan: z.string().default('starter'),
})

type OrgForm = z.infer<typeof schema>

function useOrgs() {
  return useQuery<Org[]>({
    queryKey: ['orgs'],
    queryFn: async () => {
      const { data } = await api.get('/admin/orgs')
      return data
    },
    onError: (e) => showApiError(e, 'Failed to load organisations'),
  } as Parameters<typeof useQuery>[0])
}

export default function OrgsPage() {
  const qc = useQueryClient()
  const { data = [], isLoading } = useOrgs()
  const [modalOpen, setModalOpen] = useState(false)

  const { register, handleSubmit, reset, formState: { errors } } = useForm<OrgForm>({
    resolver: zodResolver(schema),
    defaultValues: { plan: 'starter' },
  })

  const createMutation = useMutation({
    mutationFn: (p: OrgForm) => api.post('/admin/orgs', p),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['orgs'] }); toast.success('Organisation created'); setModalOpen(false); reset() },
    onError: (e) => showApiError(e, 'Failed to create organisation'),
  })

  const toggleMutation = useMutation({
    mutationFn: ({ id, is_active }: { id: string; is_active: boolean }) =>
      api.patch(`/admin/orgs/${id}`, { is_active }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['orgs'] }); toast.success('Organisation updated') },
    onError: (e) => showApiError(e, 'Failed to update organisation'),
  })

  const columns: ColumnDef<Org>[] = [
    {
      accessorKey: 'name',
      header: 'Organisation',
      cell: ({ row }) => (
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 bg-primary-100 rounded-md flex items-center justify-center shrink-0">
            <Building2 className="w-3.5 h-3.5 text-primary-600" />
          </div>
          <div>
            <p className="font-medium text-neutral-900">{row.original.name}</p>
            <p className="text-xs text-neutral-400">{row.original.slug}</p>
          </div>
        </div>
      ),
    },
    { accessorKey: 'plan', header: 'Plan' },
    { accessorKey: 'user_count', header: 'Users', cell: ({ row }) => formatNumber(row.original.user_count) },
    { accessorKey: 'is_active', header: 'Status', cell: ({ row }) => <StatusBadge status={row.original.is_active ? 'active' : 'archived'} /> },
    { accessorKey: 'created_at', header: 'Created', cell: ({ row }) => formatDate(row.original.created_at) },
    {
      id: 'actions', header: '',
      cell: ({ row }) => (
        <Switch
          checked={row.original.is_active}
          onCheckedChange={(v) => toggleMutation.mutate({ id: row.original.id, is_active: v })}
          onClick={(e) => e.stopPropagation()}
        />
      ),
    },
  ]

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-neutral-900">Organisations</h1>
          <p className="text-neutral-500 text-sm mt-1">Manage all platform tenants</p>
        </div>
        <Button onClick={() => setModalOpen(true)}>
          <Plus className="w-4 h-4 mr-2" />
          New Organisation
        </Button>
      </div>

      <DataTable columns={columns} data={data} isLoading={isLoading}
        emptyState={<EmptyState title="No organisations" description="Create your first organisation." action={{ label: 'New Organisation', onClick: () => setModalOpen(true) }} />}
      />

      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>New Organisation</DialogTitle></DialogHeader>
          <form onSubmit={handleSubmit((d) => createMutation.mutate(d))} className="space-y-4">
            <div className="space-y-1.5">
              <Label>Organisation Name *</Label>
              <Input {...register('name')} />
              {errors.name && <p className="text-xs text-red-500">{errors.name.message}</p>}
            </div>
            <div className="space-y-1.5">
              <Label>Slug *</Label>
              <Input placeholder="e.g. acme-corp" {...register('slug')} />
              {errors.slug && <p className="text-xs text-red-500">{errors.slug.message}</p>}
            </div>
            <div className="space-y-1.5">
              <Label>Plan</Label>
              <Input placeholder="starter" {...register('plan')} />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setModalOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={createMutation.isPending}>
                {createMutation.isPending ? 'Creating...' : 'Create'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
