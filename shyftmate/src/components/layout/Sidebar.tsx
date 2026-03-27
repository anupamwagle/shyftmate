import React from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import {
  LayoutDashboard,
  Calendar,
  Clock,
  Umbrella,
  MessageSquare,
  BarChart3,
  FileText,
  Phone,
  Download,
  Code2,
  Building2,
  Users,
  MapPin,
  Palmtree,
  Settings,
  ChevronLeft,
  ChevronRight,
  Zap,
} from 'lucide-react'
import { usePermission } from '@/hooks/usePermission'
import { cn } from '@/lib/utils'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'

interface NavItem {
  label: string
  icon: React.ElementType
  href: string
  end?: boolean
}

const NAV_ITEMS: NavItem[] = [
  { label: 'Dashboard', icon: LayoutDashboard, href: '/dashboard', end: true },
  { label: 'Schedule', icon: Calendar, href: '/schedule' },
  { label: 'Messages', icon: MessageSquare, href: '/messages' },
]

const EMPLOYEE_NAV: NavItem[] = [
  { label: 'Timesheets', icon: Clock, href: '/timesheets' },
  { label: 'Leave', icon: Umbrella, href: '/leave' },
]

const MANAGER_NAV: NavItem[] = [
  { label: 'Reports', icon: BarChart3, href: '/reports' },
]

const ADMIN_NAV: NavItem[] = [
  { label: 'Agreements', icon: FileText, href: '/agreements' },
  { label: 'Prospects', icon: Phone, href: '/prospects' },
  { label: 'Export', icon: Download, href: '/export' },
  { label: 'Paycodes', icon: Code2, href: '/paycodes' },
]

const SUPER_ADMIN_NAV: NavItem[] = [
  { label: 'Organisations', icon: Building2, href: '/admin/orgs' },
  { label: 'Users', icon: Users, href: '/admin/users' },
  { label: 'Locations', icon: MapPin, href: '/admin/locations' },
  { label: 'Leave Types', icon: Palmtree, href: '/admin/leave-types' },
  { label: 'Settings', icon: Settings, href: '/admin/settings' },
]

interface SidebarProps {
  collapsed: boolean
  onToggle: () => void
}

export function Sidebar({ collapsed, onToggle }: SidebarProps) {
  const { isEmployee, isManager, isAdmin, isSuperAdmin } = usePermission()

  const allItems: { items: NavItem[]; label?: string }[] = [
    { items: NAV_ITEMS },
    ...(isEmployee ? [{ items: EMPLOYEE_NAV }] : []),
    ...(isManager ? [{ items: MANAGER_NAV }] : []),
    ...(isAdmin ? [{ items: ADMIN_NAV, label: 'Admin' }] : []),
    ...(isSuperAdmin ? [{ items: SUPER_ADMIN_NAV, label: 'Platform' }] : []),
  ]

  return (
    <aside
      className={cn(
        'flex flex-col h-full bg-white border-r border-neutral-200 transition-all duration-300',
        collapsed ? 'w-16' : 'w-60'
      )}
    >
      {/* Logo */}
      <div className="flex items-center h-16 px-4 border-b border-neutral-200 shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <div className="w-8 h-8 bg-primary-600 rounded-lg flex items-center justify-center shrink-0">
            <Zap className="w-4 h-4 text-white" />
          </div>
          {!collapsed && (
            <span className="font-bold text-neutral-900 text-lg tracking-tight truncate">
              Shyftmate
            </span>
          )}
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto py-4 space-y-1 px-2">
        {allItems.map((section, sIdx) => (
          <div key={sIdx} className="space-y-0.5">
            {section.label && !collapsed && (
              <p className="px-3 py-1 text-xs font-semibold text-neutral-400 uppercase tracking-wider mt-3">
                {section.label}
              </p>
            )}
            {section.label && collapsed && <div className="h-px bg-neutral-100 my-2 mx-2" />}
            {section.items.map((item) => (
              <SidebarNavItem
                key={item.href}
                item={item}
                collapsed={collapsed}
              />
            ))}
          </div>
        ))}
      </nav>

      {/* Collapse toggle */}
      <div className="p-2 border-t border-neutral-200">
        <button
          onClick={onToggle}
          className="w-full flex items-center justify-center h-9 rounded-md hover:bg-neutral-100 transition-colors text-neutral-500"
          title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          {collapsed ? (
            <ChevronRight className="w-4 h-4" />
          ) : (
            <ChevronLeft className="w-4 h-4" />
          )}
        </button>
      </div>
    </aside>
  )
}

function SidebarNavItem({ item, collapsed }: { item: NavItem; collapsed: boolean }) {
  const location = useLocation()
  const isActive = item.end
    ? location.pathname === item.href
    : location.pathname.startsWith(item.href)

  const Icon = item.icon

  if (collapsed) {
    return (
      <Tooltip delayDuration={0}>
        <TooltipTrigger asChild>
          <NavLink
            to={item.href}
            className={cn(
              'flex items-center justify-center h-9 w-full rounded-md transition-colors',
              isActive
                ? 'bg-primary-50 text-primary-700'
                : 'text-neutral-600 hover:bg-neutral-100 hover:text-neutral-900'
            )}
          >
            <Icon className="w-5 h-5" />
          </NavLink>
        </TooltipTrigger>
        <TooltipContent side="right">{item.label}</TooltipContent>
      </Tooltip>
    )
  }

  return (
    <NavLink
      to={item.href}
      className={cn(
        'flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors',
        isActive
          ? 'bg-primary-50 text-primary-700'
          : 'text-neutral-600 hover:bg-neutral-100 hover:text-neutral-900'
      )}
    >
      <Icon className="w-4 h-4 shrink-0" />
      <span className="truncate">{item.label}</span>
    </NavLink>
  )
}
