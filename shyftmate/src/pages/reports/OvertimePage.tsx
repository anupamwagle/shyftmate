import React, { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { type ColumnDef } from '@tanstack/react-table'
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { DataTable } from '@/components/DataTable'
import { EmptyState } from '@/components/EmptyState'
import api, { showApiError } from '@/lib/api'
import { formatCurrency, formatHours } from '@/lib/utils'
import type { OvertimeData } from '@/types'

const MOCK_DATA: OvertimeData[] = [
  { employee_name: 'Sarah Chen', regular_hours: 38, overtime_hours: 6.5, total_cost: 2340, period: 'This week' },
  { employee_name: 'Marcus Thompson', regular_hours: 40, overtime_hours: 4.0, total_cost: 1920, period: 'This week' },
  { employee_name: 'Priya Nair', regular_hours: 35, overtime_hours: 8.5, total_cost: 2890, period: 'This week' },
  { employee_name: 'James Okafor', regular_hours: 40, overtime_hours: 2.0, total_cost: 980, period: 'This week' },
  { employee_name: 'Elena Vasquez', regular_hours: 36, overtime_hours: 5.5, total_cost: 1650, period: 'This week' },
]

function useOvertime(from: string, to: string) {
  return useQuery<OvertimeData[]>({
    queryKey: ['report-overtime', from, to],
    queryFn: async () => {
      const { data } = await api.get('/reports/overtime', { params: { from, to } })
      return data
    },
    onError: (e) => showApiError(e, 'Failed to load overtime data'),
  } as Parameters<typeof useQuery>[0])
}

export default function OvertimePage() {
  const [from] = useState(() => {
    const d = new Date()
    d.setDate(d.getDate() - 7)
    return d.toISOString().split('T')[0]
  })
  const [to] = useState(() => new Date().toISOString().split('T')[0])

  const { data = MOCK_DATA, isLoading } = useOvertime(from, to)

  const totalOt = data.reduce((s, d) => s + d.overtime_hours, 0)
  const totalCost = data.reduce((s, d) => s + d.total_cost, 0)

  const columns: ColumnDef<OvertimeData>[] = [
    { accessorKey: 'employee_name', header: 'Employee' },
    {
      accessorKey: 'regular_hours',
      header: 'Regular',
      cell: ({ row }) => formatHours(row.original.regular_hours),
    },
    {
      accessorKey: 'overtime_hours',
      header: 'Overtime',
      cell: ({ row }) => (
        <span className={row.original.overtime_hours > 5 ? 'text-amber-600 font-medium' : ''}>
          {formatHours(row.original.overtime_hours)}
        </span>
      ),
    },
    {
      accessorKey: 'total_cost',
      header: 'Cost',
      cell: ({ row }) => formatCurrency(row.original.total_cost),
    },
  ]

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-neutral-900">Overtime Report</h1>
        <p className="text-neutral-500 text-sm mt-1">Track overtime hours and costs by employee</p>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <Card>
          <CardContent className="pt-5">
            <p className="text-sm text-neutral-500">Total Overtime Hours</p>
            {isLoading ? (
              <Skeleton className="h-7 w-24 mt-1" />
            ) : (
              <p className="text-2xl font-bold mt-1 text-amber-600">{formatHours(totalOt)}</p>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5">
            <p className="text-sm text-neutral-500">Overtime Cost</p>
            {isLoading ? (
              <Skeleton className="h-7 w-24 mt-1" />
            ) : (
              <p className="text-2xl font-bold mt-1">{formatCurrency(totalCost)}</p>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Regular vs Overtime Hours</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <Skeleton className="h-64 w-full" />
          ) : (
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={data}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis
                  dataKey="employee_name"
                  tick={{ fontSize: 11 }}
                  axisLine={false}
                  tickLine={false}
                  interval={0}
                />
                <YAxis tick={{ fontSize: 11 }} axisLine={false} tickLine={false} width={32} />
                <Tooltip contentStyle={{ borderRadius: 8, border: '1px solid #e5e5e5', fontSize: 12 }} />
                <Legend />
                <Bar dataKey="regular_hours" name="Regular" fill="#4F46E5" radius={[4, 4, 0, 0]} stackId="a" />
                <Bar dataKey="overtime_hours" name="Overtime" fill="#F59E0B" radius={[4, 4, 0, 0]} stackId="a" />
              </BarChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      <DataTable
        columns={columns}
        data={data}
        isLoading={isLoading}
        emptyState={<EmptyState title="No overtime data" description="No overtime recorded for this period." />}
      />
    </div>
  )
}
