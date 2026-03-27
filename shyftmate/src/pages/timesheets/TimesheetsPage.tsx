import React, { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { type ColumnDef } from '@tanstack/react-table'
import { Eye, CheckCheck, XCircle, CheckCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
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
import { ConfirmDialog } from '@/components/ConfirmDialog'
import api, { showApiError } from '@/lib/api'
import { formatDate, formatCurrency, formatHours } from '@/lib/utils'
import type { Timesheet, TimesheetStatus } from '@/types'

function useTimesheets(status: string, period: string) {
  return useQuery<Timesheet[]>({
    queryKey: ['timesheets', status, period],
    queryFn: async () => {
      const params: Record<string, string> = {}
      if (status !== 'all') params.status = status
      if (period) params.period = period
      const { data } = await api.get('/timesheets', { params })
      return data
    },
    onError: (error) => {
      showApiError(error, 'Failed to load timesheets', () => {})
    },
  } as Parameters<typeof useQuery>[0])
}

export default function TimesheetsPage() {
  const qc = useQueryClient()
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [periodFilter, setPeriodFilter] = useState('')
  const [selectedRows, setSelectedRows] = useState<Timesheet[]>([])
  const [confirmAction, setConfirmAction] = useState<{
    type: 'approve' | 'reject'
    id: string
  } | null>(null)

  const { data = [], isLoading } = useTimesheets(statusFilter, periodFilter)

  const approveMutation = useMutation({
    mutationFn: (id: string) => api.patch(`/timesheets/${id}/approve`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['timesheets'] })
      toast.success('Timesheet approved')
      setConfirmAction(null)
    },
    onError: (e) => showApiError(e, 'Failed to approve timesheet'),
  })

  const rejectMutation = useMutation({
    mutationFn: (id: string) => api.patch(`/timesheets/${id}/reject`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['timesheets'] })
      toast.success('Timesheet rejected')
      setConfirmAction(null)
    },
    onError: (e) => showApiError(e, 'Failed to reject timesheet'),
  })

  const bulkApproveMutation = useMutation({
    mutationFn: (ids: string[]) =>
      Promise.all(ids.map((id) => api.patch(`/timesheets/${id}/approve`))),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['timesheets'] })
      toast.success(`${selectedRows.length} timesheets approved`)
      setSelectedRows([])
    },
    onError: (e) => showApiError(e, 'Bulk approve failed'),
  })

  const columns: ColumnDef<Timesheet>[] = [
    {
      accessorKey: 'employee_name',
      header: 'Employee',
    },
    {
      id: 'period',
      header: 'Period',
      cell: ({ row }) =>
        `${formatDate(row.original.period_start)} – ${formatDate(row.original.period_end)}`,
    },
    {
      accessorKey: 'status',
      header: 'Status',
      cell: ({ row }) => <StatusBadge status={row.original.status} />,
    },
    {
      accessorKey: 'total_hours',
      header: 'Hours',
      cell: ({ row }) => formatHours(row.original.total_hours),
    },
    {
      accessorKey: 'total_cost',
      header: 'Cost',
      cell: ({ row }) => formatCurrency(row.original.total_cost),
    },
    {
      accessorKey: 'submitted_at',
      header: 'Submitted',
      cell: ({ row }) => formatDate(row.original.submitted_at),
    },
    {
      id: 'actions',
      header: '',
      cell: ({ row }) => {
        const ts = row.original
        return (
          <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
            <Button variant="ghost" size="icon" title="View">
              <Eye className="w-4 h-4" />
            </Button>
            {ts.status === 'submitted' && (
              <>
                <Button
                  variant="ghost"
                  size="icon"
                  title="Approve"
                  className="text-green-600 hover:text-green-700"
                  onClick={() => setConfirmAction({ type: 'approve', id: ts.id })}
                >
                  <CheckCircle className="w-4 h-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  title="Reject"
                  className="text-red-500 hover:text-red-600"
                  onClick={() => setConfirmAction({ type: 'reject', id: ts.id })}
                >
                  <XCircle className="w-4 h-4" />
                </Button>
              </>
            )}
          </div>
        )
      },
    },
  ]

  const submittedSelected = selectedRows.filter((r) => r.status === 'submitted')

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-neutral-900">Timesheets</h1>
          <p className="text-neutral-500 text-sm mt-1">Review and approve employee timesheets</p>
        </div>
        {submittedSelected.length > 0 && (
          <Button
            onClick={() =>
              bulkApproveMutation.mutate(submittedSelected.map((r) => r.id))
            }
            disabled={bulkApproveMutation.isPending}
          >
            <CheckCheck className="w-4 h-4 mr-2" />
            Approve {submittedSelected.length} Selected
          </Button>
        )}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-44">
            <SelectValue placeholder="Filter by status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            <SelectItem value="draft">Draft</SelectItem>
            <SelectItem value="submitted">Submitted</SelectItem>
            <SelectItem value="approved">Approved</SelectItem>
            <SelectItem value="rejected">Rejected</SelectItem>
          </SelectContent>
        </Select>
        <input
          type="month"
          value={periodFilter}
          onChange={(e) => setPeriodFilter(e.target.value)}
          className="h-10 px-3 rounded-md border border-neutral-200 text-sm focus:outline-none focus:ring-2 focus:ring-primary-600"
        />
      </div>

      <DataTable
        columns={columns}
        data={data}
        isLoading={isLoading}
        enableRowSelection
        onRowSelectionChange={setSelectedRows}
        emptyState={
          <EmptyState
            title="No timesheets found"
            description="Timesheets will appear here once employees submit them."
          />
        }
      />

      <ConfirmDialog
        open={!!confirmAction}
        onOpenChange={(o) => !o && setConfirmAction(null)}
        title={confirmAction?.type === 'approve' ? 'Approve Timesheet' : 'Reject Timesheet'}
        description={
          confirmAction?.type === 'approve'
            ? 'This will mark the timesheet as approved.'
            : 'This will reject the timesheet and notify the employee.'
        }
        confirmLabel={confirmAction?.type === 'approve' ? 'Approve' : 'Reject'}
        variant={confirmAction?.type === 'reject' ? 'destructive' : 'default'}
        onConfirm={() => {
          if (!confirmAction) return
          if (confirmAction.type === 'approve') {
            approveMutation.mutate(confirmAction.id)
          } else {
            rejectMutation.mutate(confirmAction.id)
          }
        }}
        isLoading={approveMutation.isPending || rejectMutation.isPending}
      />
    </div>
  )
}
