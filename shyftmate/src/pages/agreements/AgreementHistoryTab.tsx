import React, { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { type ColumnDef } from '@tanstack/react-table'
import { RotateCcw } from 'lucide-react'
import { DataTable } from '@/components/DataTable'
import { EmptyState } from '@/components/EmptyState'
import { ConfirmDialog } from '@/components/ConfirmDialog'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
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
  const qc = useQueryClient()
  const { data = [], isLoading } = useHistory(agreementId)
  const [rollingBack, setRollingBack] = useState<string | null>(null)

  const rollbackMutation = useMutation({
    mutationFn: (targetVersionId: string) =>
      api.post(`/agreements/${agreementId}/rollback/${targetVersionId}`).then((r) => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['agreement', agreementId] })
      qc.invalidateQueries({ queryKey: ['agreement-history', agreementId] })
      toast.success('Rolled back successfully')
      setRollingBack(null)
    },
    onError: (e) => {
      showApiError(e, 'Rollback failed')
      setRollingBack(null)
    },
  })

  // The most recent entry is the current version — no rollback button on it
  const currentVersionId = data.length > 0 ? data[0].id : null

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
    {
      id: 'rollback',
      header: '',
      cell: ({ row }) => {
        if (row.original.id === currentVersionId) return null
        return (
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5 text-xs h-7"
            onClick={() => setRollingBack(row.original.id)}
          >
            <RotateCcw className="h-3 w-3" />
            Rollback
          </Button>
        )
      },
    },
  ]

  return (
    <>
      <DataTable
        columns={columns}
        data={data}
        isLoading={isLoading}
        emptyState={<EmptyState title="No history" description="Changes to this agreement will be tracked here." />}
      />

      <ConfirmDialog
        open={!!rollingBack}
        onOpenChange={(o) => !o && setRollingBack(null)}
        title="Rollback Agreement"
        description="This will restore the agreement to this historical version. The current version will be saved in history. Are you sure?"
        confirmLabel="Rollback"
        variant="destructive"
        onConfirm={() => rollingBack && rollbackMutation.mutate(rollingBack)}
        isLoading={rollbackMutation.isPending}
      />
    </>
  )
}
