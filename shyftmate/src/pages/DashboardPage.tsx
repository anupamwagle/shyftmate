import React from 'react'
import { useQuery } from '@tanstack/react-query'
import { toast } from 'sonner'
import { LiveClockPanel } from '@/components/LiveClockPanel'
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts'
import {
  DollarSign,
  Clock,
  Umbrella,
  TrendingUp,
  TrendingDown,
  CheckCircle2,
  Calendar,
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import api from '@/lib/api'
import { formatCurrency, formatRelative, formatTime, initials } from '@/lib/utils'
import type { DashboardStats } from '@/types'

function useStats() {
  return useQuery<DashboardStats>({
    queryKey: ['dashboard-stats'],
    queryFn: async () => {
      const { data } = await api.get('/dashboard/stats')
      return data
    },
    meta: {
      onError: (error: unknown) => {
        toast.error('Failed to load dashboard', {
          action: { label: 'Retry', onClick: () => window.location.reload() },
        })
        console.error(error)
      },
    },
  })
}

// Mock data for preview when API is unavailable
const MOCK_STATS: DashboardStats = {
  labour_cost_this_week: 28450,
  labour_cost_last_week: 25300,
  pending_timesheet_approvals: 7,
  pending_leave_approvals: 3,
  clocked_in_now: [
    { user_id: '1', employee_name: 'Sarah Chen', avatar_url: null, clocked_in_at: new Date(Date.now() - 90 * 60000).toISOString(), location_name: 'Head Office' },
    { user_id: '2', employee_name: 'Marcus Thompson', avatar_url: null, clocked_in_at: new Date(Date.now() - 45 * 60000).toISOString(), location_name: 'Warehouse' },
    { user_id: '3', employee_name: 'Priya Nair', avatar_url: null, clocked_in_at: new Date(Date.now() - 120 * 60000).toISOString(), location_name: 'Head Office' },
    { user_id: '4', employee_name: 'James Okafor', avatar_url: null, clocked_in_at: new Date(Date.now() - 200 * 60000).toISOString(), location_name: 'Retail Floor' },
  ],
  upcoming_shifts: [],
  recent_activity: [
    { id: '1', org_id: 'org1', user_id: 'u1', user_name: 'Sarah Chen', action: 'Timesheet submitted', resource_type: 'timesheet', resource_id: 't1', details: null, created_at: new Date(Date.now() - 20 * 60000).toISOString() },
    { id: '2', org_id: 'org1', user_id: 'u2', user_name: 'Marcus Thompson', action: 'Leave request created', resource_type: 'leave', resource_id: 'l1', details: null, created_at: new Date(Date.now() - 55 * 60000).toISOString() },
    { id: '3', org_id: 'org1', user_id: 'u3', user_name: 'Admin User', action: 'Roster published', resource_type: 'schedule', resource_id: 's1', details: null, created_at: new Date(Date.now() - 3 * 3600000).toISOString() },
    { id: '4', org_id: 'org1', user_id: 'u4', user_name: 'Priya Nair', action: 'Timesheet approved', resource_type: 'timesheet', resource_id: 't2', details: null, created_at: new Date(Date.now() - 5 * 3600000).toISOString() },
    { id: '5', org_id: 'org1', user_id: 'u5', user_name: 'James Okafor', action: 'Agreement updated', resource_type: 'agreement', resource_id: 'a1', details: null, created_at: new Date(Date.now() - 7 * 3600000).toISOString() },
  ],
  labour_cost_chart: [
    { period: 'Mon', cost: 5200, hours: 82, location_name: null },
    { period: 'Tue', cost: 4800, hours: 76, location_name: null },
    { period: 'Wed', cost: 6100, hours: 95, location_name: null },
    { period: 'Thu', cost: 5500, hours: 88, location_name: null },
    { period: 'Fri', cost: 4900, hours: 79, location_name: null },
    { period: 'Sat', cost: 1950, hours: 32, location_name: null },
    { period: 'Sun', cost: 0, hours: 0, location_name: null },
  ],
}

export default function DashboardPage() {
  const { data, isLoading } = useStats()
  const stats = data ?? MOCK_STATS
  const costDelta = stats.labour_cost_this_week - stats.labour_cost_last_week
  const costDeltaPct = stats.labour_cost_last_week
    ? ((costDelta / stats.labour_cost_last_week) * 100).toFixed(1)
    : '0'
  const costUp = costDelta >= 0

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-neutral-900">Dashboard</h1>
        <p className="text-neutral-500 text-sm mt-1">Welcome back — here&apos;s what&apos;s happening</p>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard
          title="Labour Cost (Week)"
          value={isLoading ? null : formatCurrency(stats.labour_cost_this_week)}
          icon={<DollarSign className="w-5 h-5 text-primary-600" />}
          trend={
            isLoading
              ? null
              : {
                  value: `${costUp ? '+' : ''}${costDeltaPct}%`,
                  up: costUp,
                  label: 'vs last week',
                }
          }
          color="primary"
        />
        <KpiCard
          title="Pending Timesheets"
          value={isLoading ? null : String(stats.pending_timesheet_approvals)}
          icon={<Clock className="w-5 h-5 text-amber-600" />}
          color="amber"
        />
        <KpiCard
          title="Pending Leave"
          value={isLoading ? null : String(stats.pending_leave_approvals)}
          icon={<Umbrella className="w-5 h-5 text-blue-600" />}
          color="blue"
        />
        <KpiCard
          title="Clocked In Now"
          value={isLoading ? null : String(stats.clocked_in_now.length)}
          icon={<CheckCircle2 className="w-5 h-5 text-green-600" />}
          color="green"
        />
      </div>

      {/* Charts row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Labour cost chart */}
        <Card className="lg:col-span-2">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Labour Cost — This Week</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-48 w-full" />
            ) : (
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={stats.labour_cost_chart} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis dataKey="period" tick={{ fontSize: 12 }} axisLine={false} tickLine={false} />
                  <YAxis
                    tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`}
                    tick={{ fontSize: 11 }}
                    axisLine={false}
                    tickLine={false}
                    width={40}
                  />
                  <Tooltip
                    formatter={(v: number) => [formatCurrency(v), 'Cost']}
                    labelStyle={{ fontSize: 12 }}
                    contentStyle={{ borderRadius: 8, border: '1px solid #e5e5e5', fontSize: 12 }}
                  />
                  <Bar dataKey="cost" fill="#4F46E5" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        {/* Clocked in */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Clocked In Now</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {isLoading
              ? Array.from({ length: 4 }).map((_, i) => (
                  <div key={i} className="flex items-center gap-3">
                    <Skeleton className="h-8 w-8 rounded-full" />
                    <div className="flex-1 space-y-1">
                      <Skeleton className="h-3 w-24" />
                      <Skeleton className="h-3 w-16" />
                    </div>
                  </div>
                ))
              : stats.clocked_in_now.slice(0, 6).map((emp) => (
                  <div key={emp.user_id} className="flex items-center gap-3">
                    <div className="relative">
                      <Avatar className="h-8 w-8">
                        <AvatarImage src={emp.avatar_url ?? undefined} />
                        <AvatarFallback className="text-xs">
                          {initials(emp.employee_name)}
                        </AvatarFallback>
                      </Avatar>
                      <span className="absolute bottom-0 right-0 w-2.5 h-2.5 bg-green-500 rounded-full border-2 border-white" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-neutral-800 truncate">
                        {emp.employee_name}
                      </p>
                      <p className="text-xs text-neutral-400">
                        Since {formatTime(emp.clocked_in_at)} · {emp.location_name ?? '—'}
                      </p>
                    </div>
                  </div>
                ))}
            {!isLoading && stats.clocked_in_now.length === 0 && (
              <p className="text-sm text-neutral-400 text-center py-4">Nobody clocked in</p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Live clock-in panel */}
      <LiveClockPanel />

      {/* Bottom row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Upcoming shifts */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <Calendar className="w-4 h-4" />
              Upcoming Shifts
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-12 w-full mb-2" />
              ))
            ) : stats.upcoming_shifts.length === 0 ? (
              <p className="text-sm text-neutral-400 text-center py-4">No upcoming shifts</p>
            ) : (
              <div className="space-y-2">
                {stats.upcoming_shifts.slice(0, 3).map((shift) => (
                  <div key={shift.id} className="flex items-center gap-3 p-2 rounded-lg bg-neutral-50">
                    <div className="w-1.5 h-10 rounded-full bg-primary-600" />
                    <div>
                      <p className="text-sm font-medium">{shift.employee_name ?? 'Open shift'}</p>
                      <p className="text-xs text-neutral-400">
                        {formatTime(shift.start_time)} – {formatTime(shift.end_time)}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Recent activity */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Recent Activity</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="flex gap-3 mb-3">
                  <Skeleton className="h-6 w-6 rounded-full shrink-0" />
                  <div className="flex-1 space-y-1">
                    <Skeleton className="h-3 w-full" />
                    <Skeleton className="h-3 w-16" />
                  </div>
                </div>
              ))
            ) : (
              <div className="space-y-3">
                {stats.recent_activity.map((entry) => (
                  <div key={entry.id} className="flex gap-3">
                    <Avatar className="h-6 w-6 shrink-0 mt-0.5">
                      <AvatarFallback className="text-[10px]">
                        {entry.user_name ? initials(entry.user_name) : '?'}
                      </AvatarFallback>
                    </Avatar>
                    <div>
                      <p className="text-sm text-neutral-700">
                        <span className="font-medium">{entry.user_name}</span>{' '}
                        {entry.action.toLowerCase()}
                      </p>
                      <p className="text-xs text-neutral-400">{formatRelative(entry.created_at)}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

interface KpiCardProps {
  title: string
  value: string | null
  icon: React.ReactNode
  color: 'primary' | 'amber' | 'blue' | 'green'
  trend?: { value: string; up: boolean; label: string } | null
}

const COLOR_MAP = {
  primary: 'bg-primary-50',
  amber: 'bg-amber-50',
  blue: 'bg-blue-50',
  green: 'bg-green-50',
}

function KpiCard({ title, value, icon, color, trend }: KpiCardProps) {
  return (
    <Card>
      <CardContent className="pt-5">
        <div className="flex items-start justify-between">
          <div className="space-y-1">
            <p className="text-sm text-neutral-500">{title}</p>
            {value === null ? (
              <Skeleton className="h-8 w-28" />
            ) : (
              <p className="text-2xl font-bold text-neutral-900">{value}</p>
            )}
            {trend && (
              <p className="text-xs flex items-center gap-1">
                {trend.up ? (
                  <TrendingUp className="w-3 h-3 text-amber-500" />
                ) : (
                  <TrendingDown className="w-3 h-3 text-green-500" />
                )}
                <span className={trend.up ? 'text-amber-600' : 'text-green-600'}>
                  {trend.value}
                </span>
                <span className="text-neutral-400">{trend.label}</span>
              </p>
            )}
          </div>
          <div className={`w-10 h-10 rounded-lg ${COLOR_MAP[color]} flex items-center justify-center`}>
            {icon}
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
