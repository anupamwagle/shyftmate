import { useAuth } from './useAuth'
import type { UserRole } from '../types'

const ROLE_HIERARCHY: Record<UserRole, number> = {
  employee: 1,
  manager: 2,
  admin: 3,
  super_admin: 4,
}

export function usePermission() {
  const { user } = useAuth()

  function hasRole(minRole: UserRole): boolean {
    if (!user) return false
    return (ROLE_HIERARCHY[user.role] ?? 0) >= (ROLE_HIERARCHY[minRole] ?? 0)
  }

  function isRole(role: UserRole): boolean {
    return user?.role === role
  }

  return {
    hasRole,
    isRole,
    isEmployee: hasRole('employee'),
    isManager: hasRole('manager'),
    isAdmin: hasRole('admin'),
    isSuperAdmin: hasRole('super_admin'),
    role: user?.role ?? null,
  }
}
