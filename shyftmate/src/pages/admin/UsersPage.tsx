import React, { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { type ColumnDef } from '@tanstack/react-table'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { UserPlus, Pencil } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { DataTable } from '@/components/DataTable'
import { StatusBadge } from '@/components/StatusBadge'
import { EmptyState } from '@/components/EmptyState'
import { Switch } from '@/components/ui/switch'
import { Badge } from '@/components/ui/badge'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import api, { showApiError } from '@/lib/api'
import { formatDate, initials, titleCase } from '@/lib/utils'
import type { Employee, UserRole } from '@/types'

const inviteSchema = z.object({
  email: z.string().email(),
  first_name: z.string().min(1),
  last_name: z.string().min(1),
  role: z.enum(['employee', 'manager', 'admin', 'super_admin'] as const),
})

type InviteForm = z.infer<typeof inviteSchema>

const ROLE_COLORS: Record<UserRole, 'info' | 'warning' | 'success' | 'default'> = {
  employee: 'info',
  manager: 'warning',
  admin: 'success',
  super_admin: 'default',
}

function useUsers() {
  return useQuery<Employee[]>({
    queryKey: ['users'],
    queryFn: async () => {
      const { data } = await api.get('/admin/users')
      return data
    },
    onError: (e) => showApiError(e, 'Failed to load users'),
  } as Parameters<typeof useQuery>[0])
}

export default function UsersPage() {
  const qc = useQueryClient()
  const { data = [], isLoading } = useUsers()
  const [inviteOpen, setInviteOpen] = useState(false)

  const { register, handleSubmit, reset, setValue, formState: { errors } } = useForm<InviteForm>({
    resolver: zodResolver(inviteSchema),
    defaultValues: { role: 'employee' },
  })

  const inviteMutation = useMutation({
    mutationFn: (p: InviteForm) => api.post('/admin/users/invite', p),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['users'] }); toast.success('Invitation sent'); setInviteOpen(false); reset() },
    onError: (e) => showApiError(e, 'Failed to invite user'),
  })

  const toggleMutation = useMutation({
    mutationFn: ({ id, is_active }: { id: string; is_active: boolean }) =>
      api.patch(`/admin/users/${id}`, { is_active }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['users'] }); toast.success('User updated') },
    onError: (e) => showApiError(e, 'Failed to update user'),
  })

  const columns: ColumnDef<Employee>[] = [
    {
      id: 'employee',
      header: 'Employee',
      cell: ({ row }) => (
        <div className="flex items-center gap-2">
          <Avatar className="h-8 w-8">
            <AvatarImage src={row.original.avatar_url ?? undefined} />
            <AvatarFallback className="text-xs">{initials(`${row.original.first_name} ${row.original.last_name}`)}</AvatarFallback>
          </Avatar>
          <div>
            <p className="font-medium text-neutral-900">{row.original.first_name} {row.original.last_name}</p>
            <p className="text-xs text-neutral-400">{row.original.email}</p>
          </div>
        </div>
      ),
    },
    {
      accessorKey: 'role',
      header: 'Role',
      cell: ({ row }) => (
        <Badge variant={ROLE_COLORS[row.original.role]}>{titleCase(row.original.role)}</Badge>
      ),
    },
    { accessorKey: 'org_name', header: 'Organisation', cell: ({ row }) => row.original.org_name ?? '—' },
    { accessorKey: 'last_login', header: 'Last Login', cell: ({ row }) => formatDate(row.original.last_login) },
    {
      accessorKey: 'is_active',
      header: 'Status',
      cell: ({ row }) => <StatusBadge status={row.original.is_active ? 'active' : 'archived'} />,
    },
    {
      id: 'active-toggle',
      header: 'Active',
      cell: ({ row }) => (
        <Switch
          checked={row.original.is_active}
          onCheckedChange={(v) => toggleMutation.mutate({ id: row.original.user_id, is_active: v })}
          onClick={(e) => e.stopPropagation()}
        />
      ),
    },
    {
      id: 'actions', header: '',
      cell: () => (
        <Button variant="ghost" size="icon"><Pencil className="w-3.5 h-3.5" /></Button>
      ),
    },
  ]

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-neutral-900">Users</h1>
          <p className="text-neutral-500 text-sm mt-1">Manage platform users and roles</p>
        </div>
        <Button onClick={() => setInviteOpen(true)}>
          <UserPlus className="w-4 h-4 mr-2" />
          Invite User
        </Button>
      </div>

      <DataTable columns={columns} data={data} isLoading={isLoading}
        emptyState={<EmptyState title="No users found" description="Invite users to get started." action={{ label: 'Invite User', onClick: () => setInviteOpen(true) }} />}
      />

      <Dialog open={inviteOpen} onOpenChange={setInviteOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Invite User</DialogTitle></DialogHeader>
          <form onSubmit={handleSubmit((d) => inviteMutation.mutate(d))} className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>First Name *</Label>
                <Input {...register('first_name')} />
                {errors.first_name && <p className="text-xs text-red-500">{errors.first_name.message}</p>}
              </div>
              <div className="space-y-1.5">
                <Label>Last Name *</Label>
                <Input {...register('last_name')} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Email *</Label>
              <Input type="email" {...register('email')} />
              {errors.email && <p className="text-xs text-red-500">{errors.email.message}</p>}
            </div>
            <div className="space-y-1.5">
              <Label>Role</Label>
              <Select defaultValue="employee" onValueChange={(v) => setValue('role', v as UserRole)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="employee">Employee</SelectItem>
                  <SelectItem value="manager">Manager</SelectItem>
                  <SelectItem value="admin">Admin</SelectItem>
                  <SelectItem value="super_admin">Super Admin</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setInviteOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={inviteMutation.isPending}>
                {inviteMutation.isPending ? 'Inviting...' : 'Send Invite'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
