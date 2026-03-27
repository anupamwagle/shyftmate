import React, { useState } from 'react'
import { useQuery, useMutation } from '@tanstack/react-query'
import { Save, Loader2, Globe, Clock, CreditCard, Bell, Shield } from 'lucide-react'
import { toast } from 'sonner'
import { api } from '../../lib/api'
import { Button } from '../../components/ui/button'
import { Input } from '../../components/ui/input'
import { Label } from '../../components/ui/label'
import { Switch } from '../../components/ui/switch'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../../components/ui/card'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '../../components/ui/tabs'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../../components/ui/select'
import { Separator } from '../../components/ui/separator'

interface OrgSettings {
  name: string
  slug: string
  timezone: string
  plan: string
  payroll_frequency: string
  pay_week_start: string
  overtime_threshold_daily: number
  overtime_threshold_weekly: number
  rounding_interval: number
  email_notifications: boolean
  sms_notifications: boolean
  require_gps_clock: boolean
  clock_in_radius_meters: number
}

const TIMEZONES = [
  'Australia/Sydney',
  'Australia/Melbourne',
  'Australia/Brisbane',
  'Australia/Adelaide',
  'Australia/Perth',
  'Australia/Darwin',
  'Australia/Hobart',
  'Pacific/Auckland',
  'Asia/Singapore',
  'UTC',
]

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']
const FREQUENCIES = ['weekly', 'fortnightly', 'monthly']
const ROUNDING = [1, 5, 6, 10, 15, 30]

export default function SettingsPage() {
  const { data: settings, isLoading } = useQuery<OrgSettings>({
    queryKey: ['org-settings'],
    queryFn: () => api.get('/orgs/me/settings').then((r) => r.data),
  })

  const [form, setForm] = useState<Partial<OrgSettings>>({})
  const merged = { ...settings, ...form } as OrgSettings

  React.useEffect(() => {
    if (settings) setForm({})
  }, [settings])

  const set = (k: keyof OrgSettings, v: unknown) => setForm((f) => ({ ...f, [k]: v }))

  const saveMutation = useMutation({
    mutationFn: () => api.patch('/orgs/me/settings', form).then((r) => r.data),
    onSuccess: () => toast.success('Settings saved'),
    onError: () => toast.error('Failed to save settings'),
  })

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="h-8 w-8 animate-spin text-indigo-600" />
      </div>
    )
  }

  return (
    <div className="max-w-3xl space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Organisation Settings</h1>
          <p className="text-sm text-slate-500 mt-0.5">Configure your workspace preferences</p>
        </div>
        <Button
          onClick={() => saveMutation.mutate()}
          disabled={saveMutation.isPending || Object.keys(form).length === 0}
          className="bg-indigo-600 hover:bg-indigo-700"
        >
          {saveMutation.isPending ? (
            <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
          ) : (
            <Save className="h-4 w-4 mr-1.5" />
          )}
          Save Changes
        </Button>
      </div>

      <Tabs defaultValue="general">
        <TabsList>
          <TabsTrigger value="general"><Globe className="h-3.5 w-3.5 mr-1.5" />General</TabsTrigger>
          <TabsTrigger value="payroll"><CreditCard className="h-3.5 w-3.5 mr-1.5" />Payroll</TabsTrigger>
          <TabsTrigger value="attendance"><Clock className="h-3.5 w-3.5 mr-1.5" />Attendance</TabsTrigger>
          <TabsTrigger value="notifications"><Bell className="h-3.5 w-3.5 mr-1.5" />Notifications</TabsTrigger>
          <TabsTrigger value="security"><Shield className="h-3.5 w-3.5 mr-1.5" />Security</TabsTrigger>
        </TabsList>

        {/* General */}
        <TabsContent value="general" className="mt-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Organisation Details</CardTitle>
              <CardDescription>Basic information about your organisation</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-1.5">
                <Label>Organisation Name</Label>
                <Input value={merged.name ?? ''} onChange={(e) => set('name', e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>URL Slug</Label>
                <div className="flex items-center gap-2">
                  <span className="text-sm text-slate-400">shyftmate.com/</span>
                  <Input
                    value={merged.slug ?? ''}
                    onChange={(e) => set('slug', e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))}
                    className="flex-1"
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>Timezone</Label>
                <Select value={merged.timezone ?? 'Australia/Sydney'} onValueChange={(v) => set('timezone', v)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {TIMEZONES.map((tz) => (
                      <SelectItem key={tz} value={tz}>{tz}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Plan</Label>
                <Input value={merged.plan ?? ''} disabled className="bg-slate-50 text-slate-500 capitalize" />
                <p className="text-xs text-slate-400">Contact support to upgrade your plan</p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Payroll */}
        <TabsContent value="payroll" className="mt-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Payroll Configuration</CardTitle>
              <CardDescription>Pay cycle and overtime rules</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label>Pay Frequency</Label>
                  <Select value={merged.payroll_frequency ?? 'weekly'} onValueChange={(v) => set('payroll_frequency', v)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {FREQUENCIES.map((f) => (
                        <SelectItem key={f} value={f} className="capitalize">{f}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>Pay Week Starts</Label>
                  <Select value={merged.pay_week_start ?? 'Monday'} onValueChange={(v) => set('pay_week_start', v)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {DAYS.map((d) => <SelectItem key={d} value={d}>{d}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>Daily OT Threshold (hrs)</Label>
                  <Input
                    type="number"
                    step="0.5"
                    value={merged.overtime_threshold_daily ?? 7.6}
                    onChange={(e) => set('overtime_threshold_daily', parseFloat(e.target.value))}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Weekly OT Threshold (hrs)</Label>
                  <Input
                    type="number"
                    step="0.5"
                    value={merged.overtime_threshold_weekly ?? 38}
                    onChange={(e) => set('overtime_threshold_weekly', parseFloat(e.target.value))}
                  />
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Attendance */}
        <TabsContent value="attendance" className="mt-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Time & Attendance</CardTitle>
              <CardDescription>Clock-in rules and rounding</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-1.5">
                <Label>Time Rounding (minutes)</Label>
                <Select
                  value={String(merged.rounding_interval ?? 15)}
                  onValueChange={(v) => set('rounding_interval', parseInt(v))}
                >
                  <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {ROUNDING.map((r) => (
                      <SelectItem key={r} value={String(r)}>{r} min</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Separator />
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium">Require GPS on Clock-In</p>
                  <p className="text-xs text-slate-500">Employees must be within radius of their location</p>
                </div>
                <Switch
                  checked={!!merged.require_gps_clock}
                  onCheckedChange={(v) => set('require_gps_clock', v)}
                />
              </div>
              {merged.require_gps_clock && (
                <div className="space-y-1.5">
                  <Label>Allowed Radius (meters)</Label>
                  <Input
                    type="number"
                    value={merged.clock_in_radius_meters ?? 200}
                    onChange={(e) => set('clock_in_radius_meters', parseInt(e.target.value))}
                    className="w-40"
                  />
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Notifications */}
        <TabsContent value="notifications" className="mt-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Notification Preferences</CardTitle>
              <CardDescription>Choose how managers and employees receive alerts</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium">Email Notifications</p>
                  <p className="text-xs text-slate-500">Leave requests, shift changes, announcements</p>
                </div>
                <Switch
                  checked={!!merged.email_notifications}
                  onCheckedChange={(v) => set('email_notifications', v)}
                />
              </div>
              <Separator />
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium">SMS Notifications</p>
                  <p className="text-xs text-slate-500">Urgent shift alerts (standard rates apply)</p>
                </div>
                <Switch
                  checked={!!merged.sms_notifications}
                  onCheckedChange={(v) => set('sms_notifications', v)}
                />
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Security */}
        <TabsContent value="security" className="mt-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Security</CardTitle>
              <CardDescription>Authentication and access controls</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="bg-indigo-50 border border-indigo-200 rounded-lg p-4">
                <p className="text-sm font-medium text-indigo-900">Two-Factor Authentication</p>
                <p className="text-xs text-indigo-700 mt-1">
                  Email OTP is mandatory for all users in Shyftmate. This cannot be disabled.
                </p>
              </div>
              <Separator />
              <div className="space-y-1">
                <p className="text-sm font-medium">Allowed Auth Methods</p>
                <div className="space-y-2 mt-2">
                  {['Email + Password', 'Google OAuth2', 'Apple Sign-In'].map((m) => (
                    <div key={m} className="flex items-center justify-between">
                      <span className="text-sm">{m}</span>
                      <Badge variant="default" className="text-xs">Enabled</Badge>
                    </div>
                  ))}
                </div>
                <p className="text-xs text-slate-400 mt-2">Contact support to restrict auth methods.</p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}
