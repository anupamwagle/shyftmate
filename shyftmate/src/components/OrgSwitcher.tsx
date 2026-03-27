import React from 'react'
import { useQuery, useMutation } from '@tanstack/react-query'
import { Building2, ChevronDown, Check } from 'lucide-react'
import { api } from '../lib/api'
import { useAuthStore } from '../store/authStore'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from './ui/dropdown-menu'
import { Button } from './ui/button'
import { Badge } from './ui/badge'

interface Org {
  id: string
  name: string
  slug: string
  plan: string
  is_active: boolean
}

export function OrgSwitcher() {
  const role = useAuthStore((s) => s.user?.role)
  const currentOrgId = useAuthStore((s) => s.user?.org_id)
  const setOrgContext = useAuthStore((s) => s.setOrgContext)

  // Only visible to super_admin
  if (role !== 'super_admin') return null

  const { data: orgs = [] } = useQuery<Org[]>({
    queryKey: ['orgs-list'],
    queryFn: () => api.get('/orgs').then((r) => r.data),
  })

  const currentOrg = orgs.find((o) => o.id === currentOrgId)

  const switchMutation = useMutation({
    mutationFn: (orgId: string) =>
      api.post('/orgs/switch', { org_id: orgId }).then((r) => r.data),
    onSuccess: (_data, orgId) => {
      setOrgContext(orgId)
      window.location.reload() // Reload to refresh all queries with new org context
    },
  })

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className="gap-1.5 max-w-[180px] border-indigo-200 bg-indigo-50 text-indigo-700 hover:bg-indigo-100"
        >
          <Building2 className="h-3.5 w-3.5 shrink-0" />
          <span className="truncate text-xs font-medium">
            {currentOrg?.name ?? 'Select Org'}
          </span>
          <ChevronDown className="h-3 w-3 shrink-0 opacity-60" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-56">
        <DropdownMenuLabel className="text-xs text-slate-500 font-normal">
          Switch Organisation Context
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {orgs.map((org) => (
          <DropdownMenuItem
            key={org.id}
            onClick={() => org.id !== currentOrgId && switchMutation.mutate(org.id)}
            className="gap-2 cursor-pointer"
          >
            <Building2 className="h-3.5 w-3.5 text-slate-400 shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">{org.name}</p>
              <p className="text-xs text-slate-400 truncate">{org.slug}</p>
            </div>
            <div className="flex items-center gap-1 shrink-0">
              {!org.is_active && (
                <Badge variant="secondary" className="text-xs py-0">Inactive</Badge>
              )}
              {org.id === currentOrgId && (
                <Check className="h-3.5 w-3.5 text-indigo-600" />
              )}
            </div>
          </DropdownMenuItem>
        ))}
        {orgs.length === 0 && (
          <DropdownMenuItem disabled className="text-xs text-slate-400">
            No organisations found
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
