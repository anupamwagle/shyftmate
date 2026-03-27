import React, { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { type ColumnDef } from '@tanstack/react-table'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Plus, RefreshCw } from 'lucide-react'
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
import { StatusBadge } from '@/components/StatusBadge'
import { EmptyState } from '@/components/EmptyState'
import { Badge } from '@/components/ui/badge'
import api, { showApiError } from '@/lib/api'
import { formatDate } from '@/lib/utils'
import type { Agreement, AgreementCreateInput, AgreementType } from '@/types'

const createSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  code: z.string().min(1, 'Code is required'),
  type: z.enum(['modern_award', 'eba', 'common_law'] as const),
  description: z.string().optional(),
  effective_date: z.string().optional(),
})

type CreateForm = z.infer<typeof createSchema>

const TYPE_LABELS: Record<AgreementType, string> = {
  modern_award: 'Modern Award',
  eba: 'EBA',
  common_law: 'Common Law',
}

function useAgreements(type: string, status: string) {
  return useQuery<Agreement[]>({
    queryKey: ['agreements', type, status],
    queryFn: async () => {
      const params: Record<string, string> = {}
      if (type !== 'all') params.type = type
      if (status !== 'all') params.status = status
      const { data } = await api.get('/agreements', { params })
      return data
    },
    onError: (e) => showApiError(e, 'Failed to load agreements'),
  } as Parameters<typeof useQuery>[0])
}

export default function AgreementsListPage() {
  const navigate = useNavigate()
  const qc = useQueryClient()
  const [typeFilter, setTypeFilter] = useState('all')
  const [statusFilter, setStatusFilter] = useState('all')
  const [modalOpen, setModalOpen] = useState(false)

  const { data = [], isLoading, refetch } = useAgreements(typeFilter, statusFilter)

  const createMutation = useMutation({
    mutationFn: (payload: AgreementCreateInput) => api.post('/agreements', payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['agreements'] })
      toast.success('Agreement created')
      setModalOpen(false)
      reset()
    },
    onError: (e) => showApiError(e, 'Failed to create agreement'),
  })

  const {
    register,
    handleSubmit,
    setValue,
    reset,
    formState: { errors },
  } = useForm<CreateForm>({
    resolver: zodResolver(createSchema),
    defaultValues: { type: 'modern_award' },
  })

  const columns: ColumnDef<Agreement>[] = [
    {
      accessorKey: 'name',
      header: 'Agreement Name',
      cell: ({ row }) => (
        <span className="font-medium text-neutral-900">{row.original.name}</span>
      ),
    },
    { accessorKey: 'code', header: 'Code' },
    {
      accessorKey: 'type',
      header: 'Type',
      cell: ({ row }) => <Badge variant="info">{TYPE_LABELS[row.original.type]}</Badge>,
    },
    {
      accessorKey: 'status',
      header: 'Status',
      cell: ({ row }) => <StatusBadge status={row.original.status} />,
    },
    {
      accessorKey: 'version',
      header: 'Version',
      cell: ({ row }) => `v${row.original.version}`,
    },
    {
      accessorKey: 'sync_status',
      header: 'Sync',
      cell: ({ row }) => <StatusBadge status={row.original.sync_status} />,
    },
    {
      accessorKey: 'updated_at',
      header: 'Last Updated',
      cell: ({ row }) => formatDate(row.original.updated_at),
    },
  ]

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-neutral-900">Agreements</h1>
          <p className="text-neutral-500 text-sm mt-1">Manage enterprise and award agreements</p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="icon"
            onClick={() => refetch()}
            title="Refresh"
          >
            <RefreshCw className="w-4 h-4" />
          </Button>
          <Button onClick={() => setModalOpen(true)}>
            <Plus className="w-4 h-4 mr-2" />
            New Agreement
          </Button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex gap-3 flex-wrap">
        <Select value={typeFilter} onValueChange={setTypeFilter}>
          <SelectTrigger className="w-44">
            <SelectValue placeholder="Filter by type" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Types</SelectItem>
            <SelectItem value="modern_award">Modern Award</SelectItem>
            <SelectItem value="eba">EBA</SelectItem>
            <SelectItem value="common_law">Common Law</SelectItem>
          </SelectContent>
        </Select>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-44">
            <SelectValue placeholder="Filter by status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            <SelectItem value="draft">Draft</SelectItem>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="superseded">Superseded</SelectItem>
            <SelectItem value="archived">Archived</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <DataTable
        columns={columns}
        data={data}
        isLoading={isLoading}
        onRowClick={(row) => navigate(`/agreements/${row.id}`)}
        emptyState={
          <EmptyState
            title="No agreements found"
            description="Create your first agreement to get started."
            action={{ label: 'New Agreement', onClick: () => setModalOpen(true) }}
          />
        }
      />

      {/* Create modal */}
      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>New Agreement</DialogTitle>
          </DialogHeader>
          <form
            onSubmit={handleSubmit((data) => createMutation.mutate(data))}
            className="space-y-4"
          >
            <div className="space-y-1.5">
              <Label>Agreement Name *</Label>
              <Input placeholder="e.g. Retail Award 2020" {...register('name')} />
              {errors.name && <p className="text-xs text-red-500">{errors.name.message}</p>}
            </div>
            <div className="space-y-1.5">
              <Label>Code *</Label>
              <Input placeholder="e.g. MA000004" {...register('code')} />
              {errors.code && <p className="text-xs text-red-500">{errors.code.message}</p>}
            </div>
            <div className="space-y-1.5">
              <Label>Type *</Label>
              <Select
                defaultValue="modern_award"
                onValueChange={(v) => setValue('type', v as AgreementType)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="modern_award">Modern Award</SelectItem>
                  <SelectItem value="eba">EBA</SelectItem>
                  <SelectItem value="common_law">Common Law</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Effective Date</Label>
              <Input type="date" {...register('effective_date')} />
            </div>
            <div className="space-y-1.5">
              <Label>Description</Label>
              <Input placeholder="Optional description" {...register('description')} />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setModalOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={createMutation.isPending}>
                {createMutation.isPending ? 'Creating...' : 'Create Agreement'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
