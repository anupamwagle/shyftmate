import React, { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { type ColumnDef } from '@tanstack/react-table'
import { CheckCircle, XCircle } from 'lucide-react'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
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
import { formatDate, formatNumber } from '@/lib/utils'
import type { LeaveRequest, LeaveBalance } from '@/types'

function useLeaveRequests(status: string) {
  return useQuery<LeaveRequest[]>({
    queryKey: ['leave-requests', status],
    queryFn: async () => {
      const params: Record<string, string> = {}
      if (status !== 'all') params.status = status
      const { data } = await api.get('/leave/requests', { params })
      return data
    },
    onError: (err) => showApiError(err, 'Failed to load leave requests'),
  } as Parameters<typeof useQuery>[0])
}

function useLeaveBalances() {
  return useQuery<LeaveBalance[]>({
    queryKey: ['leave-balances'],
    queryFn: async () => {
      const { data } = await api.get('/leave/balances')
      return data
    },
    onError: (err) => showApiError(err, 'Failed to load leave balances'),
  } as Parameters<typeof useQuery>[0])
}

export default function LeavePage() {
  const qc = useQueryClient()
  const [statusFilter, setStatusFilter] = useState('all')
  const [confirmAction, setConfirmAction] = useState<{
    type: 'approve' | 'reject'
    id: string
  } | null>(null)

  const { data: requests = [], isLoading: requestsLoading } = useLeaveRequests(statusFilter)
  const { data: balances = [], isLoading: balancesLoading } = useLeaveBalances()

  const approveMutation = useMutation({
    mutationFn: (id: string) => api.patch(`/leave/requests/${id}/approve`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['leave-requests'] })
      toast.success('Leave request approved')
      setConfirmAction(null)
    },
    onError: (e) => showApiError(e, 'Failed to approve leave'),
  })

  const rejectMutation = useMutation({
    mutationFn: (id: string) => api.patch(`/leave/requests/${id}/reject`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['leave-requests'] })
      toast.success('Leave request rejected')
      setConfirmAction(null)
    },
    onError: (e) => showApiError(e, 'Failed to reject leave'),
  })

  const requestColumns: ColumnDef<LeaveRequest>[] = [
    { accessorKey: 'employee_name', header: 'Employee' },
    { accessorKey: 'leave_type_name', header: 'Leave Type' },
    {
      id: 'dates',
      header: 'Dates',
      cell: ({ row }) =>
        `${formatDate(row.original.start_date)} – ${formatDate(row.original.end_date)}`,
    },
    {
      accessorKey: 'days',
      header: 'Days',
      cell: ({ row }) => formatNumber(row.original.days, 1),
    },
    {
      accessorKey: 'status',
      header: 'Status',
      cell: ({ row }) => <StatusBadge status={row.original.status} />,
    },
    {
      id: 'actions',
      header: '',
      cell: ({ row }) => {
        const req = row.original
        if (req.status !== 'pending') return null
        return (
          <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
            <Button
              variant="ghost"
              size="icon"
              className="text-green-600 hover:text-green-700"
              title="Approve"
              onClick={() => setConfirmAction({ type: 'approve', id: req.id })}
            >
              <CheckCircle className="w-4 h-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="text-red-500 hover:text-red-600"
              title="Reject"
              onClick={() => setConfirmAction({ type: 'reject', id: req.id })}
            >
              <XCircle className="w-4 h-4" />
            </Button>
          </div>
        )
      },
    },
  ]

  const balanceColumns: ColumnDef<LeaveBalance>[] = [
    { accessorKey: 'employee_name', header: 'Employee' },
    { accessorKey: 'leave_type_name', header: 'Leave Type' },
    {
      accessorKey: 'balance_days',
      header: 'Balance',
      cell: ({ row }) => `${formatNumber(row.original.balance_days, 2)} days`,
    },
    {
      accessorKey: 'accrued_days',
      header: 'Accrued',
      cell: ({ row }) => `${formatNumber(row.original.accrued_days, 2)} days`,
    },
    {
      accessorKey: 'taken_days',
      header: 'Taken',
      cell: ({ row }) => `${formatNumber(row.original.taken_days, 2)} days`,
    },
  ]

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-neutral-900">Leave</h1>
        <p className="text-neutral-500 text-sm mt-1">Manage leave requests and balances</p>
      </div>

      <Tabs defaultValue="requests">
        <TabsList>
          <TabsTrigger value="requests">Leave Requests</TabsTrigger>
          <TabsTrigger value="balances">Leave Balances</TabsTrigger>
        </TabsList>

        <TabsContent value="requests" className="space-y-4 mt-4">
          <div className="flex gap-3">
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-44">
                <SelectValue placeholder="Filter by status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Statuses</SelectItem>
                <SelectItem value="pending">Pending</SelectItem>
                <SelectItem value="approved">Approved</SelectItem>
                <SelectItem value="rejected">Rejected</SelectItem>
                <SelectItem value="cancelled">Cancelled</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <DataTable
            columns={requestColumns}
            data={requests}
            isLoading={requestsLoading}
            emptyState={
              <EmptyState
                title="No leave requests"
                description="Leave requests from your team will appear here."
              />
            }
          />
        </TabsContent>

        <TabsContent value="balances" className="mt-4">
          <DataTable
            columns={balanceColumns}
            data={balances}
            isLoading={balancesLoading}
            emptyState={
              <EmptyState
                title="No leave balances found"
                description="Leave balances will appear once employees are enrolled in leave types."
              />
            }
          />
        </TabsContent>
      </Tabs>

      <ConfirmDialog
        open={!!confirmAction}
        onOpenChange={(o) => !o && setConfirmAction(null)}
        title={confirmAction?.type === 'approve' ? 'Approve Leave' : 'Reject Leave'}
        description={
          confirmAction?.type === 'approve'
            ? 'Approve this leave request?'
            : 'Reject this leave request? The employee will be notified.'
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
