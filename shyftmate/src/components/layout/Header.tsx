import React from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { Bell, ChevronRight, LogOut, User, Settings } from 'lucide-react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { useAuth } from '@/hooks/useAuth'
import { initials } from '@/lib/utils'

const BREADCRUMB_LABELS: Record<string, string> = {
  dashboard: 'Dashboard',
  schedule: 'Schedule',
  timesheets: 'Timesheets',
  leave: 'Leave',
  messages: 'Messages',
  reports: 'Reports',
  agreements: 'Agreements',
  prospects: 'Prospects',
  export: 'Export',
  paycodes: 'Paycodes',
  admin: 'Admin',
  orgs: 'Organisations',
  users: 'Users',
  locations: 'Locations',
  'leave-types': 'Leave Types',
  settings: 'Settings',
}

function useBreadcrumbs() {
  const location = useLocation()
  const parts = location.pathname.split('/').filter(Boolean)
  return parts.map((part, idx) => ({
    label: BREADCRUMB_LABELS[part] ?? part,
    href: '/' + parts.slice(0, idx + 1).join('/'),
    isLast: idx === parts.length - 1,
  }))
}

export function Header() {
  const navigate = useNavigate()
  const { user, logout } = useAuth()
  const breadcrumbs = useBreadcrumbs()

  function handleLogout() {
    logout()
    navigate('/login')
  }

  const userName = user ? `${user.first_name} ${user.last_name}` : 'User'

  return (
    <header className="h-16 flex items-center justify-between px-6 bg-white border-b border-neutral-200 shrink-0">
      {/* Breadcrumb */}
      <nav className="flex items-center gap-1 text-sm">
        {breadcrumbs.map((crumb, idx) => (
          <React.Fragment key={crumb.href}>
            {idx > 0 && <ChevronRight className="w-3 h-3 text-neutral-400" />}
            {crumb.isLast ? (
              <span className="font-medium text-neutral-900">{crumb.label}</span>
            ) : (
              <button
                onClick={() => navigate(crumb.href)}
                className="text-neutral-500 hover:text-neutral-700 transition-colors"
              >
                {crumb.label}
              </button>
            )}
          </React.Fragment>
        ))}
      </nav>

      {/* Right actions */}
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="icon" className="relative">
          <Bell className="w-4 h-4" />
          {/* Notification dot */}
          <span className="absolute top-2 right-2 w-2 h-2 bg-red-500 rounded-full" />
        </Button>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="flex items-center gap-2 rounded-full focus:outline-none focus:ring-2 focus:ring-primary-600 focus:ring-offset-2">
              <Avatar className="h-8 w-8">
                <AvatarImage src={user?.avatar_url ?? undefined} />
                <AvatarFallback className="text-xs">{initials(userName)}</AvatarFallback>
              </Avatar>
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuLabel>
              <div className="flex flex-col gap-0.5">
                <span className="font-medium">{userName}</span>
                <span className="text-xs font-normal text-neutral-500">{user?.email}</span>
                {user?.org_name && (
                  <span className="text-xs font-normal text-neutral-400">{user.org_name}</span>
                )}
              </div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => navigate('/admin/settings')}>
              <User className="w-4 h-4 mr-2" />
              Profile
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => navigate('/admin/settings')}>
              <Settings className="w-4 h-4 mr-2" />
              Settings
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={handleLogout}
              className="text-red-600 focus:text-red-600 focus:bg-red-50"
            >
              <LogOut className="w-4 h-4 mr-2" />
              Sign out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  )
}
