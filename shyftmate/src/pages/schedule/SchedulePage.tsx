import React, { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import FullCalendar from '@fullcalendar/react'
import dayGridPlugin from '@fullcalendar/daygrid'
import timeGridPlugin from '@fullcalendar/timegrid'
import interactionPlugin from '@fullcalendar/interaction'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Plus, Send } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ConfirmDialog } from '@/components/ConfirmDialog'
import api, { showApiError } from '@/lib/api'
import type { Shift, ShiftCreateInput } from '@/types'

const shiftSchema = z.object({
  user_id: z.string().optional(),
  role_name: z.string().optional(),
  start_time: z.string().min(1, 'Start time is required'),
  end_time: z.string().min(1, 'End time is required'),
  break_minutes: z.coerce.number().min(0).default(30),
  notes: z.string().optional(),
})

type ShiftForm = z.infer<typeof shiftSchema>

function useShifts(start: string, end: string) {
  return useQuery<Shift[]>({
    queryKey: ['shifts', start, end],
    queryFn: async () => {
      const { data } = await api.get('/shifts', { params: { start, end } })
      return data
    },
    onError: (error) => {
      showApiError(error, 'Failed to load shifts')
    },
  } as Parameters<typeof useQuery>[0])
}

function shiftToEvent(shift: Shift) {
  const colorMap: Record<string, string> = {
    open: '#3B82F6',
    filled: '#10B981',
    cancelled: '#9CA3AF',
  }
  return {
    id: shift.id,
    title: shift.employee_name ?? 'Open Shift',
    start: shift.start_time,
    end: shift.end_time,
    backgroundColor: colorMap[shift.status] ?? '#6366F1',
    borderColor: colorMap[shift.status] ?? '#6366F1',
    extendedProps: { shift },
  }
}

export default function SchedulePage() {
  const qc = useQueryClient()
  const [dateRange, setDateRange] = useState({ start: '', end: '' })
  const [modalOpen, setModalOpen] = useState(false)
  const [publishOpen, setPublishOpen] = useState(false)
  const [editingShift, setEditingShift] = useState<Shift | null>(null)

  const { data: shifts = [] } = useShifts(dateRange.start, dateRange.end)

  const createMutation = useMutation({
    mutationFn: (payload: ShiftCreateInput) => api.post('/shifts', payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['shifts'] })
      toast.success('Shift created')
      setModalOpen(false)
    },
    onError: (e) => showApiError(e, 'Failed to create shift'),
  })

  const updateMutation = useMutation({
    mutationFn: ({ id, ...payload }: ShiftCreateInput & { id: string }) =>
      api.patch(`/shifts/${id}`, payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['shifts'] })
      toast.success('Shift updated')
      setModalOpen(false)
    },
    onError: (e) => showApiError(e, 'Failed to update shift'),
  })

  const publishMutation = useMutation({
    mutationFn: () => api.post('/shifts/publish'),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['shifts'] })
      toast.success('Roster published and staff notified')
      setPublishOpen(false)
    },
    onError: (e) => showApiError(e, 'Failed to publish roster'),
  })

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<ShiftForm>({ resolver: zodResolver(shiftSchema) })

  function openCreate(start?: string, end?: string) {
    setEditingShift(null)
    reset({
      start_time: start ? start.slice(0, 16) : '',
      end_time: end ? end.slice(0, 16) : '',
      break_minutes: 30,
    })
    setModalOpen(true)
  }

  function openEdit(shift: Shift) {
    setEditingShift(shift)
    reset({
      user_id: shift.user_id ?? undefined,
      role_name: shift.role_name ?? undefined,
      start_time: shift.start_time.slice(0, 16),
      end_time: shift.end_time.slice(0, 16),
      break_minutes: shift.break_minutes,
      notes: shift.notes ?? undefined,
    })
    setModalOpen(true)
  }

  function onSubmit(data: ShiftForm) {
    if (editingShift) {
      updateMutation.mutate({ id: editingShift.id, ...data })
    } else {
      createMutation.mutate(data)
    }
  }

  const isSubmitting = createMutation.isPending || updateMutation.isPending

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-neutral-900">Schedule</h1>
          <p className="text-neutral-500 text-sm mt-1">Manage team roster and shifts</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setPublishOpen(true)}>
            <Send className="w-4 h-4 mr-2" />
            Publish Roster
          </Button>
          <Button onClick={() => openCreate()}>
            <Plus className="w-4 h-4 mr-2" />
            New Shift
          </Button>
        </div>
      </div>

      <div className="bg-white rounded-lg border border-neutral-200 p-4">
        <FullCalendar
          plugins={[dayGridPlugin, timeGridPlugin, interactionPlugin]}
          initialView="timeGridWeek"
          headerToolbar={{
            left: 'prev,next today',
            center: 'title',
            right: 'dayGridMonth,timeGridWeek,timeGridDay',
          }}
          events={shifts.map(shiftToEvent)}
          selectable
          editable
          select={(info) => openCreate(info.startStr, info.endStr)}
          eventClick={(info) => {
            const shift = info.event.extendedProps.shift as Shift
            openEdit(shift)
          }}
          eventDrop={(info) => {
            const shift = info.event.extendedProps.shift as Shift
            updateMutation.mutate({
              id: shift.id,
              start_time: info.event.startStr,
              end_time: info.event.endStr ?? shift.end_time,
              break_minutes: shift.break_minutes,
            })
          }}
          datesSet={(info) => {
            setDateRange({
              start: info.startStr,
              end: info.endStr,
            })
          }}
          height="auto"
          slotMinTime="06:00:00"
          slotMaxTime="23:00:00"
          allDaySlot={false}
        />
      </div>

      {/* Shift modal */}
      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editingShift ? 'Edit Shift' : 'New Shift'}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div className="space-y-1.5">
              <Label>Role / Position</Label>
              <Input placeholder="e.g. Barista, Cashier" {...register('role_name')} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Start Time</Label>
                <Input type="datetime-local" {...register('start_time')} />
                {errors.start_time && (
                  <p className="text-xs text-red-500">{errors.start_time.message}</p>
                )}
              </div>
              <div className="space-y-1.5">
                <Label>End Time</Label>
                <Input type="datetime-local" {...register('end_time')} />
                {errors.end_time && (
                  <p className="text-xs text-red-500">{errors.end_time.message}</p>
                )}
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Break (minutes)</Label>
              <Input type="number" min={0} step={5} {...register('break_minutes')} />
            </div>
            <div className="space-y-1.5">
              <Label>Notes</Label>
              <Input placeholder="Optional notes" {...register('notes')} />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setModalOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting ? 'Saving...' : editingShift ? 'Save Changes' : 'Create Shift'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={publishOpen}
        onOpenChange={setPublishOpen}
        title="Publish Roster"
        description="This will notify all assigned employees of their shifts. Continue?"
        confirmLabel="Publish"
        onConfirm={() => publishMutation.mutate()}
        isLoading={publishMutation.isPending}
      />
    </div>
  )
}
