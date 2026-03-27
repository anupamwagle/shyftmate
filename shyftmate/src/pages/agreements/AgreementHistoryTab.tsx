import React from 'react'
import { useQuery } from '@tanstack/react-query'
import { type ColumnDef } from '@tanstack/react-table'
import { DataTable } from '@/components/DataTable'
import { EmptyState } from '@/components/EmptyState'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import api, { showApiError } from '@/lib/api'
import { formatDateTime, initials } from '@/lib/utils'
import type { AgreementHistory } from '@/types'

interface Props { agreementId: string }

function useHistory(agreementId: string) {
  return useQuery<AgreementHistory[]>({
    queryKey: ['agreement-history', agreementId],
    queryFn: async () => {
      const { data } = await api.get(`/agreements/${agreementId}/history`)
      return data
    },
    onError: (e) => showApiError(e, 'Failed to load history'),
  } as Parameters<typeof useQuery>[0])
}

export function AgreementHistoryTab({ agreementId }: Props) {
  const { data = [], isLoading } = useHistory(agreementId)

  const columns: ColumnDef<AgreementHistory>[] = [
    {
      id: 'user',
      header: 'Changed By',
      cell: ({ row }) => (
        <div className="flex items-center gap-2">
          <Avatar className="h-6 w-6">
            <AvatarFallback className="text-xs">{initials(row.original.changed_by)}</AvatarFallback>
          </Avatar>
          <span>{row.original.changed_by}</span>
        </div>
      ),
    },
    { accessorKey: 'action', header: 'Action' },
    {
      accessorKey: 'changed_at',
      header: 'Date & Time',
      cell: ({ row }) => formatDateTime(row.original.changed_at),
    },
    {
      accessorKey: 'notes',
      header: 'Notes',
      cell: ({ row }) => row.original.notes ?? '—',
    },
  ]

  return (
    <DataTable
      columns={columns}
      data={data}
      isLoading={isLoading}
      emptyState={<EmptyState title="No history" description="Changes to this agreement will be tracked here." />}
    />
  )
}
