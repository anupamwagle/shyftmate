import React from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { type ColumnDef } from '@tanstack/react-table'
import { Check } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { DataTable } from '@/components/DataTable'
import { StatusBadge } from '@/components/StatusBadge'
import { EmptyState } from '@/components/EmptyState'
import api, { showApiError } from '@/lib/api'
import { formatDate, formatTime } from '@/lib/utils'
import type { Shift } from '@/types'

function useOpenShifts() {
  return useQuery<Shift[]>({
    queryKey: ['open-shifts'],
    queryFn: async () => {
      const { data } = await api.get('/shifts', { params: { status: 'open' } })
      return data
    },
    onError: (error) => showApiError(error, 'Failed to load open shifts'),
  } as Parameters<typeof useQuery>[0])
}

export default function OpenShiftsPage() {
  const qc = useQueryClient()
  const { data = [], isLoading } = useOpenShifts()

  const claimMutation = useMutation({
    mutationFn: (id: string) => api.post(`/shifts/${id}/claim`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['open-shifts'] })
      toast.success('Shift claimed successfully')
    },
    onError: (e) => showApiError(e, 'Failed to claim shift'),
  })

  const columns: ColumnDef<Shift>[] = [
    {
      accessorKey: 'start_time',
      header: 'Date',
      cell: ({ row }) => formatDate(row.original.start_time),
    },
    {
      accessorKey: 'role_name',
      header: 'Role',
      cell: ({ row }) => row.original.role_name ?? '—',
    },
    {
      id: 'time',
      header: 'Time',
      cell: ({ row }) =>
        `${formatTime(row.original.start_time)} – ${formatTime(row.original.end_time)}`,
    },
    {
      accessorKey: 'location_name',
      header: 'Location',
      cell: ({ row }) => row.original.location_name ?? '—',
    },
    {
      accessorKey: 'status',
      header: 'Status',
      cell: ({ row }) => <StatusBadge status={row.original.status} />,
    },
    {
      id: 'actions',
      header: '',
      cell: ({ row }) => (
        <Button
          size="sm"
          onClick={() => claimMutation.mutate(row.original.id)}
          disabled={claimMutation.isPending}
        >
          <Check className="w-3.5 h-3.5 mr-1" />
          Claim
        </Button>
      ),
    },
  ]

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-neutral-900">Open Shifts</h1>
        <p className="text-neutral-500 text-sm mt-1">Available shifts you can pick up</p>
      </div>
      <DataTable
        columns={columns}
        data={data}
        isLoading={isLoading}
        emptyState={
          <EmptyState
            title="No open shifts"
            description="All shifts are currently filled."
          />
        }
      />
    </div>
  )
}
