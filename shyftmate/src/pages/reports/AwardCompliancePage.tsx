import React, { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { type ColumnDef } from '@tanstack/react-table'
import { CheckCircle, XCircle } from 'lucide-react'
import { DataTable } from '@/components/DataTable'
import { EmptyState } from '@/components/EmptyState'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import api, { showApiError } from '@/lib/api'
import { formatNumber } from '@/lib/utils'
import type { AwardComplianceData } from '@/types'

const MOCK_DATA: AwardComplianceData[] = [
  { employee_name: 'Sarah Chen', agreement_name: 'Retail Award 2020', rule_name: 'Overtime rate', expected: 38.50, actual: 38.50, variance: 0, compliant: true, period: 'Week 12' },
  { employee_name: 'Marcus Thompson', agreement_name: 'Retail Award 2020', rule_name: 'Saturday loading', expected: 125, actual: 100, variance: -25, compliant: false, period: 'Week 12' },
  { employee_name: 'Priya Nair', agreement_name: 'Hospitality Award', rule_name: 'Evening penalty', expected: 115, actual: 115, variance: 0, compliant: true, period: 'Week 12' },
  { employee_name: 'James Okafor', agreement_name: 'Hospitality Award', rule_name: 'Public holiday rate', expected: 250, actual: 225, variance: -25, compliant: false, period: 'Week 12' },
  { employee_name: 'Elena Vasquez', agreement_name: 'Retail Award 2020', rule_name: 'Casual loading', expected: 125, actual: 125, variance: 0, compliant: true, period: 'Week 12' },
]

function useCompliance(period: string) {
  return useQuery<AwardComplianceData[]>({
    queryKey: ['report-compliance', period],
    queryFn: async () => {
      const { data } = await api.get('/reports/award-compliance', { params: { period } })
      return data
    },
    onError: (e) => showApiError(e, 'Failed to load compliance data'),
  } as Parameters<typeof useQuery>[0])
}

export default function AwardCompliancePage() {
  const [period, setPeriod] = useState(() => {
    const d = new Date()
    return `${d.getFullYear()}-W${String(Math.ceil(d.getDate() / 7)).padStart(2, '0')}`
  })

  const { data = MOCK_DATA, isLoading } = useCompliance(period)

  const compliant = data.filter((d) => d.compliant).length
  const nonCompliant = data.filter((d) => !d.compliant).length
  const complianceRate = data.length > 0 ? (compliant / data.length) * 100 : 100

  const columns: ColumnDef<AwardComplianceData>[] = [
    { accessorKey: 'employee_name', header: 'Employee' },
    { accessorKey: 'agreement_name', header: 'Agreement' },
    { accessorKey: 'rule_name', header: 'Rule' },
    {
      accessorKey: 'expected',
      header: 'Expected',
      cell: ({ row }) => `${formatNumber(row.original.expected, 2)}%`,
    },
    {
      accessorKey: 'actual',
      header: 'Actual',
      cell: ({ row }) => `${formatNumber(row.original.actual, 2)}%`,
    },
    {
      accessorKey: 'variance',
      header: 'Variance',
      cell: ({ row }) => {
        const v = row.original.variance
        return (
          <span className={v < 0 ? 'text-red-500 font-medium' : v > 0 ? 'text-green-600 font-medium' : ''}>
            {v === 0 ? '—' : `${v > 0 ? '+' : ''}${formatNumber(v, 2)}%`}
          </span>
        )
      },
    },
    {
      accessorKey: 'compliant',
      header: 'Status',
      cell: ({ row }) =>
        row.original.compliant ? (
          <Badge variant="success" className="flex items-center gap-1 w-fit">
            <CheckCircle className="w-3 h-3" />
            Compliant
          </Badge>
        ) : (
          <Badge variant="error" className="flex items-center gap-1 w-fit">
            <XCircle className="w-3 h-3" />
            Non-Compliant
          </Badge>
        ),
    },
  ]

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-neutral-900">Award Compliance</h1>
        <p className="text-neutral-500 text-sm mt-1">Verify pay rates against award obligations</p>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-5">
            <p className="text-sm text-neutral-500">Compliance Rate</p>
            {isLoading ? (
              <Skeleton className="h-7 w-20 mt-1" />
            ) : (
              <p className={`text-2xl font-bold mt-1 ${complianceRate >= 90 ? 'text-green-600' : 'text-red-500'}`}>
                {formatNumber(complianceRate, 1)}%
              </p>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5">
            <p className="text-sm text-neutral-500">Compliant</p>
            {isLoading ? (
              <Skeleton className="h-7 w-12 mt-1" />
            ) : (
              <p className="text-2xl font-bold mt-1 text-green-600">{compliant}</p>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5">
            <p className="text-sm text-neutral-500">Non-Compliant</p>
            {isLoading ? (
              <Skeleton className="h-7 w-12 mt-1" />
            ) : (
              <p className="text-2xl font-bold mt-1 text-red-500">{nonCompliant}</p>
            )}
          </CardContent>
        </Card>
      </div>

      <DataTable
        columns={columns}
        data={data}
        isLoading={isLoading}
        emptyState={<EmptyState title="No compliance data" description="No pay records found for this period." />}
      />
    </div>
  )
}
