import React from 'react'
import { useQuery } from '@tanstack/react-query'
import { type ColumnDef } from '@tanstack/react-table'
import {
  PieChart,
  Pie,
  Cell,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { DataTable } from '@/components/DataTable'
import { EmptyState } from '@/components/EmptyState'
import api, { showApiError } from '@/lib/api'
import { formatCurrency, formatNumber } from '@/lib/utils'
import type { LeaveLiabilityData } from '@/types'

const MOCK_DATA: LeaveLiabilityData[] = [
  { employee_name: 'Sarah Chen', leave_type: 'Annual Leave', balance_days: 18.5, liability_amount: 4810 },
  { employee_name: 'Marcus Thompson', leave_type: 'Annual Leave', balance_days: 12.0, liability_amount: 2760 },
  { employee_name: 'Priya Nair', leave_type: 'Long Service Leave', balance_days: 42.0, liability_amount: 14280 },
  { employee_name: 'James Okafor', leave_type: 'Annual Leave', balance_days: 9.5, liability_amount: 2185 },
  { employee_name: 'Elena Vasquez', leave_type: 'Annual Leave', balance_days: 22.0, liability_amount: 5280 },
  { employee_name: 'Tom Richards', leave_type: 'Personal Leave', balance_days: 8.0, liability_amount: 1760 },
]

const COLORS = ['#4F46E5', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#EC4899']

function useLeaveLiability() {
  return useQuery<LeaveLiabilityData[]>({
    queryKey: ['report-leave-liability'],
    queryFn: async () => {
      const { data } = await api.get('/reports/leave-liability')
      return data
    },
    onError: (e) => showApiError(e, 'Failed to load leave liability data'),
  } as Parameters<typeof useQuery>[0])
}

export default function LeaveLiabilityPage() {
  const { data = MOCK_DATA, isLoading } = useLeaveLiability()

  const totalLiability = data.reduce((s, d) => s + d.liability_amount, 0)

  // Aggregate by leave type for pie
  const byType: Record<string, number> = {}
  data.forEach((d) => {
    byType[d.leave_type] = (byType[d.leave_type] ?? 0) + d.liability_amount
  })
  const pieData = Object.entries(byType).map(([name, value]) => ({ name, value }))

  const columns: ColumnDef<LeaveLiabilityData>[] = [
    { accessorKey: 'employee_name', header: 'Employee' },
    { accessorKey: 'leave_type', header: 'Leave Type' },
    {
      accessorKey: 'balance_days',
      header: 'Balance',
      cell: ({ row }) => `${formatNumber(row.original.balance_days, 2)} days`,
    },
    {
      accessorKey: 'liability_amount',
      header: 'Liability',
      cell: ({ row }) => (
        <span className="font-medium">{formatCurrency(row.original.liability_amount)}</span>
      ),
    },
  ]

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-neutral-900">Leave Liability</h1>
        <p className="text-neutral-500 text-sm mt-1">Outstanding leave balances and their financial liability</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Card>
          <CardContent className="pt-5">
            <p className="text-sm text-neutral-500">Total Leave Liability</p>
            {isLoading ? (
              <Skeleton className="h-7 w-28 mt-1" />
            ) : (
              <p className="text-2xl font-bold mt-1 text-red-600">{formatCurrency(totalLiability)}</p>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5">
            <p className="text-sm text-neutral-500">Employees with Leave Balances</p>
            {isLoading ? (
              <Skeleton className="h-7 w-16 mt-1" />
            ) : (
              <p className="text-2xl font-bold mt-1">{data.length}</p>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Liability by Type</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-48 w-full" />
            ) : (
              <ResponsiveContainer width="100%" height={200}>
                <PieChart>
                  <Pie
                    data={pieData}
                    cx="50%"
                    cy="50%"
                    innerRadius={50}
                    outerRadius={80}
                    paddingAngle={3}
                    dataKey="value"
                  >
                    {pieData.map((_, idx) => (
                      <Cell key={idx} fill={COLORS[idx % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip
                    formatter={(v: number) => [formatCurrency(v), 'Liability']}
                    contentStyle={{ borderRadius: 8, border: '1px solid #e5e5e5', fontSize: 12 }}
                  />
                  <Legend iconSize={10} wrapperStyle={{ fontSize: 11 }} />
                </PieChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        <div className="lg:col-span-2">
          <DataTable
            columns={columns}
            data={data}
            isLoading={isLoading}
            emptyState={<EmptyState title="No leave liability" description="All balances are zero." />}
          />
        </div>
      </div>
    </div>
  )
}
