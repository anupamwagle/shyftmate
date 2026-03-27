import React, { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
  LineChart,
  Line,
} from 'recharts'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import api, { showApiError } from '@/lib/api'
import { formatCurrency } from '@/lib/utils'
import type { LabourCostData } from '@/types'

const MOCK_DATA: LabourCostData[] = [
  { period: 'Week 1', cost: 24500, hours: 392, location_name: null },
  { period: 'Week 2', cost: 26800, hours: 418, location_name: null },
  { period: 'Week 3', cost: 22100, hours: 355, location_name: null },
  { period: 'Week 4', cost: 28450, hours: 445, location_name: null },
  { period: 'Week 5', cost: 25300, hours: 402, location_name: null },
  { period: 'Week 6', cost: 27900, hours: 432, location_name: null },
]

function useLabourCost(from: string, to: string) {
  return useQuery<LabourCostData[]>({
    queryKey: ['report-labour-cost', from, to],
    queryFn: async () => {
      const { data } = await api.get('/reports/labour-cost', { params: { from, to } })
      return data
    },
    onError: (e) => showApiError(e, 'Failed to load labour cost data'),
  } as Parameters<typeof useQuery>[0])
}

export default function LabourCostPage() {
  const [from, setFrom] = useState(() => {
    const d = new Date()
    d.setDate(d.getDate() - 42)
    return d.toISOString().split('T')[0]
  })
  const [to, setTo] = useState(() => new Date().toISOString().split('T')[0])

  const { data = MOCK_DATA, isLoading } = useLabourCost(from, to)

  const totalCost = data.reduce((sum, d) => sum + d.cost, 0)
  const totalHours = data.reduce((sum, d) => sum + d.hours, 0)
  const avgCostPerHour = totalHours > 0 ? totalCost / totalHours : 0

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-neutral-900">Labour Cost Report</h1>
          <p className="text-neutral-500 text-sm mt-1">Analyse total labour spend over time</p>
        </div>
        <div className="flex items-center gap-2 text-sm">
          <label className="text-neutral-500">From</label>
          <input
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            className="h-9 px-3 rounded-md border border-neutral-200 text-sm focus:outline-none focus:ring-2 focus:ring-primary-600"
          />
          <label className="text-neutral-500">To</label>
          <input
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            className="h-9 px-3 rounded-md border border-neutral-200 text-sm focus:outline-none focus:ring-2 focus:ring-primary-600"
          />
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {isLoading ? (
          Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-24 w-full" />)
        ) : (
          <>
            <Card>
              <CardContent className="pt-5">
                <p className="text-sm text-neutral-500">Total Labour Cost</p>
                <p className="text-2xl font-bold mt-1">{formatCurrency(totalCost)}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-5">
                <p className="text-sm text-neutral-500">Total Hours Worked</p>
                <p className="text-2xl font-bold mt-1">{totalHours.toLocaleString()}h</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-5">
                <p className="text-sm text-neutral-500">Avg Cost / Hour</p>
                <p className="text-2xl font-bold mt-1">{formatCurrency(avgCostPerHour)}</p>
              </CardContent>
            </Card>
          </>
        )}
      </div>

      {/* Bar chart */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Labour Cost by Period</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <Skeleton className="h-64 w-full" />
          ) : (
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={data}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="period" tick={{ fontSize: 12 }} axisLine={false} tickLine={false} />
                <YAxis
                  tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`}
                  tick={{ fontSize: 11 }}
                  axisLine={false}
                  tickLine={false}
                  width={48}
                />
                <Tooltip
                  formatter={(v: number) => [formatCurrency(v), 'Labour Cost']}
                  contentStyle={{ borderRadius: 8, border: '1px solid #e5e5e5', fontSize: 12 }}
                />
                <Legend />
                <Bar dataKey="cost" name="Labour Cost" fill="#4F46E5" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      {/* Line chart - hours */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Hours Worked by Period</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <Skeleton className="h-64 w-full" />
          ) : (
            <ResponsiveContainer width="100%" height={260}>
              <LineChart data={data}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="period" tick={{ fontSize: 12 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 11 }} axisLine={false} tickLine={false} width={40} />
                <Tooltip
                  formatter={(v: number) => [`${v}h`, 'Hours']}
                  contentStyle={{ borderRadius: 8, border: '1px solid #e5e5e5', fontSize: 12 }}
                />
                <Line
                  type="monotone"
                  dataKey="hours"
                  stroke="#10B981"
                  strokeWidth={2}
                  dot={{ fill: '#10B981', r: 4 }}
                />
              </LineChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
