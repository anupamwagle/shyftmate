// NOTE: This component calls GET /clock/live — that endpoint must be present in the
// workforce router (api/app/routers/workforce.py). See the endpoint added there.

import React from 'react'
import { useQuery } from '@tanstack/react-query'
import { Clock, MapPin, UserCheck } from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'
import { api } from '../lib/api'
import { Badge } from './ui/badge'
import { ScrollArea } from './ui/scroll-area'

interface ClockedInUser {
  user_id: string
  user_name: string
  avatar_url: string | null
  location_id: string
  location_name: string
  clocked_in_at: string
  shift_end: string | null
}

export function LiveClockPanel() {
  const { data: users = [] } = useQuery<ClockedInUser[]>({
    queryKey: ['clocked-in'],
    queryFn: () => api.get('/clock/live').then((r) => r.data),
    refetchInterval: 30_000, // refresh every 30s
  })

  // Group by location
  const byLocation = users.reduce<Record<string, ClockedInUser[]>>((acc, u) => {
    const key = u.location_name
    if (!acc[key]) acc[key] = []
    acc[key].push(u)
    return acc
  }, {})

  return (
    <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
        <div className="flex items-center gap-2">
          <div className="relative">
            <UserCheck className="h-4 w-4 text-green-600" />
            <span className="absolute -top-0.5 -right-0.5 w-2 h-2 bg-green-500 rounded-full animate-pulse" />
          </div>
          <span className="text-sm font-semibold text-slate-900">Live Clock-In</span>
        </div>
        <Badge variant="secondary" className="text-xs">
          {users.length} clocked in
        </Badge>
      </div>

      {users.length === 0 ? (
        <div className="p-6 text-center text-sm text-slate-400">
          No one clocked in right now
        </div>
      ) : (
        <ScrollArea className="max-h-72">
          <div className="divide-y divide-slate-100">
            {Object.entries(byLocation).map(([location, locationUsers]) => (
              <div key={location}>
                <div className="flex items-center gap-1.5 px-4 py-2 bg-slate-50">
                  <MapPin className="h-3 w-3 text-slate-400" />
                  <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
                    {location}
                  </span>
                  <span className="ml-auto text-xs text-slate-400">
                    {locationUsers.length}
                  </span>
                </div>
                {locationUsers.map((u) => (
                  <div key={u.user_id} className="flex items-center gap-3 px-4 py-2.5">
                    {u.avatar_url ? (
                      <img
                        src={u.avatar_url}
                        alt={u.user_name}
                        className="w-7 h-7 rounded-full object-cover"
                      />
                    ) : (
                      <div className="w-7 h-7 rounded-full bg-indigo-100 text-indigo-600 flex items-center justify-center text-xs font-semibold">
                        {u.user_name.charAt(0).toUpperCase()}
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-slate-800 truncate">{u.user_name}</p>
                      <div className="flex items-center gap-1 text-xs text-slate-400">
                        <Clock className="h-3 w-3" />
                        {formatDistanceToNow(new Date(u.clocked_in_at), { addSuffix: true })}
                      </div>
                    </div>
                    {u.shift_end && (
                      <span className="text-xs text-slate-400 shrink-0">
                        until {new Date(u.shift_end).toLocaleTimeString('en-AU', { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            ))}
          </div>
        </ScrollArea>
      )}
    </div>
  )
}
