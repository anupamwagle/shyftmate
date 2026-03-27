import React, { useState, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Plus, Pencil, Trash2, GripVertical, ChevronRight, ChevronUp, ChevronDown } from 'lucide-react'
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
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
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { EmptyState } from '@/components/EmptyState'
import { ConfirmDialog } from '@/components/ConfirmDialog'
import api, { showApiError } from '@/lib/api'
import { cn } from '@/lib/utils'
import type { RuleLine, RuleLineCreateInput, EmployeeType } from '@/types'

const ruleSchema = z.object({
  rule_name: z.string().min(1, 'Rule name is required'),
  rule_definition: z.string().optional(),
  timesheet_input: z.string().optional(),
  kronos_name: z.string().optional(),
  jde_standard_costing: z.string().optional(),
  jde_billing: z.string().optional(),
  expreshr_name: z.string().optional(),
  payslip_name: z.string().optional(),
  clause_ref: z.string().optional(),
  page_ref: z.string().optional(),
  sort_order: z.coerce.number().default(0),
})

type RuleForm = z.infer<typeof ruleSchema>

interface Props {
  agreementId: string
  employeeTypes: EmployeeType[]
}

function useRuleLines(agreementId: string, employeeTypeId: string) {
  return useQuery<RuleLine[]>({
    queryKey: ['rule-lines', agreementId, employeeTypeId],
    queryFn: async () => {
      if (!employeeTypeId) return []
      const { data } = await api.get(`/agreements/${agreementId}/rule-lines`, {
        params: { employee_type_id: employeeTypeId },
      })
      return data
    },
    enabled: !!employeeTypeId,
    onError: (e) => showApiError(e, 'Failed to load rule lines'),
  } as Parameters<typeof useQuery>[0])
}

function buildTree(lines: RuleLine[]): RuleLine[] {
  const map = new Map<string, RuleLine>()
  lines.forEach((l) => map.set(l.id, { ...l, children: [] }))
  const roots: RuleLine[] = []
  map.forEach((line) => {
    if (line.parent_rule_id && map.has(line.parent_rule_id)) {
      const parent = map.get(line.parent_rule_id)!
      parent.children = parent.children ?? []
      parent.children.push(line)
    } else {
      roots.push(line)
    }
  })
  return roots.sort((a, b) => a.sort_order - b.sort_order)
}

export function RuleLinesTab({ agreementId, employeeTypes }: Props) {
  const qc = useQueryClient()
  const [selectedEtId, setSelectedEtId] = useState<string>(employeeTypes[0]?.id ?? '')
  const [modalOpen, setModalOpen] = useState(false)
  const [editTarget, setEditTarget] = useState<RuleLine | null>(null)
  const [parentForNew, setParentForNew] = useState<string | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null)

  const { data: lines = [], isLoading } = useRuleLines(agreementId, selectedEtId)
  const tree = useMemo(() => buildTree(lines), [lines])

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  )

  const { register, handleSubmit, reset, formState: { errors } } = useForm<RuleForm>({
    resolver: zodResolver(ruleSchema),
  })

  const createMutation = useMutation({
    mutationFn: (payload: RuleLineCreateInput) =>
      api.post(`/agreements/${agreementId}/rule-lines`, payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['rule-lines', agreementId] })
      toast.success('Rule line added')
      setModalOpen(false)
      reset()
    },
    onError: (e) => showApiError(e, 'Failed to create rule line'),
  })

  const updateMutation = useMutation({
    mutationFn: ({ id, ...payload }: RuleLineCreateInput & { id: string }) =>
      api.patch(`/agreements/${agreementId}/rule-lines/${id}`, payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['rule-lines', agreementId] })
      toast.success('Rule line updated')
      setModalOpen(false)
      reset()
      setEditTarget(null)
    },
    onError: (e) => showApiError(e, 'Failed to update rule line'),
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) =>
      api.delete(`/agreements/${agreementId}/rule-lines/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['rule-lines', agreementId] })
      toast.success('Rule line deleted')
      setDeleteTarget(null)
    },
    onError: (e) => showApiError(e, 'Failed to delete rule line'),
  })

  const reorderMutation = useMutation({
    mutationFn: (orders: { id: string; sort_order: number }[]) =>
      api.post(`/agreements/${agreementId}/rule-lines/reorder`, { orders }),
    onError: (e) => showApiError(e, 'Failed to reorder'),
  })

  const reorderDirectionMutation = useMutation({
    mutationFn: ({ id, direction }: { id: string; direction: 'up' | 'down' }) => {
      const idx = lines.findIndex((r) => r.id === id)
      const targetIdx = direction === 'up' ? idx - 1 : idx + 1
      if (targetIdx < 0 || targetIdx >= lines.length) return Promise.resolve()
      const currentOrder = lines[idx].sort_order ?? idx
      const targetOrder = lines[targetIdx].sort_order ?? targetIdx
      return Promise.all([
        api.post(`/rule-lines/${id}/reorder`, { sort_order: targetOrder }),
        api.post(`/rule-lines/${lines[targetIdx].id}/reorder`, { sort_order: currentOrder }),
      ])
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['rule-lines', agreementId] }),
    onError: (e) => showApiError(e, 'Failed to reorder'),
  })

  function openCreate(parentId?: string) {
    setEditTarget(null)
    setParentForNew(parentId ?? null)
    reset({ rule_name: '', sort_order: lines.length })
    setModalOpen(true)
  }

  function openEdit(rule: RuleLine) {
    setEditTarget(rule)
    setParentForNew(rule.parent_rule_id)
    reset({
      rule_name: rule.rule_name,
      rule_definition: rule.rule_definition ?? '',
      timesheet_input: rule.timesheet_input ?? '',
      kronos_name: rule.kronos_name ?? '',
      jde_standard_costing: rule.jde_standard_costing ?? '',
      jde_billing: rule.jde_billing ?? '',
      expreshr_name: rule.expreshr_name ?? '',
      payslip_name: rule.payslip_name ?? '',
      clause_ref: rule.clause_ref ?? '',
      page_ref: rule.page_ref ?? '',
      sort_order: rule.sort_order,
    })
    setModalOpen(true)
  }

  function onSubmit(data: RuleForm) {
    const payload: RuleLineCreateInput = {
      ...data,
      employee_type_id: selectedEtId,
      parent_rule_id: parentForNew,
    }
    if (editTarget) {
      updateMutation.mutate({ id: editTarget.id, ...payload })
    } else {
      createMutation.mutate(payload)
    }
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event
    if (over && active.id !== over.id) {
      const flatIds = lines.map((l) => l.id)
      const oldIdx = flatIds.indexOf(active.id as string)
      const newIdx = flatIds.indexOf(over.id as string)
      const reordered = arrayMove(lines, oldIdx, newIdx)
      const orders = reordered.map((l, i) => ({ id: l.id, sort_order: i }))
      reorderMutation.mutate(orders)
    }
  }

  if (!employeeTypes.length) {
    return (
      <EmptyState
        title="No employee types"
        description="Add employee types first before creating rule lines."
      />
    )
  }

  return (
    <div className="space-y-4">
      {/* Employee type selector */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <Label className="shrink-0">Employee Type</Label>
          <Select value={selectedEtId} onValueChange={setSelectedEtId}>
            <SelectTrigger className="w-60">
              <SelectValue placeholder="Select employee type" />
            </SelectTrigger>
            <SelectContent>
              {employeeTypes.map((et) => (
                <SelectItem key={et.id} value={et.id}>
                  {et.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <Button size="sm" onClick={() => openCreate()}>
          <Plus className="w-4 h-4 mr-1" />
          Add Rule Line
        </Button>
      </div>

      {/* Rule lines grid */}
      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </div>
      ) : tree.length === 0 ? (
        <EmptyState
          title="No rule lines"
          description="Add rule lines to define pay rules for this employee type."
          action={{ label: 'Add Rule Line', onClick: () => openCreate() }}
        />
      ) : (
        <div className="rounded-md border border-neutral-200 overflow-hidden">
          {/* Header */}
          <div className="bg-neutral-50 border-b border-neutral-200 grid grid-cols-[32px_1fr_160px_160px_140px_140px_120px_120px_100px_80px_80px] gap-2 px-3 py-2 text-xs font-medium text-neutral-500 uppercase tracking-wider min-w-max">
            <div />
            <div>Scenario / Rule Name</div>
            <div>Rule Definition</div>
            <div>Timesheet Input</div>
            <div>Kronos Name</div>
            <div>JDE Std Costing</div>
            <div>JDE Billing</div>
            <div>ExpressHR</div>
            <div>Payslip</div>
            <div>Clause</div>
            <div>Page</div>
          </div>

          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
          >
            <SortableContext
              items={lines.map((l) => l.id)}
              strategy={verticalListSortingStrategy}
            >
              <div className="divide-y divide-neutral-100 overflow-x-auto">
                {tree.map((rule, idx) => (
                  <RuleRow
                    key={rule.id}
                    rule={rule}
                    depth={0}
                    isFirst={idx === 0}
                    isLast={idx === tree.length - 1}
                    onEdit={openEdit}
                    onDelete={(id) => setDeleteTarget(id)}
                    onAddSubRule={(parentId) => openCreate(parentId)}
                    onReorder={(id, direction) => reorderDirectionMutation.mutate({ id, direction })}
                  />
                ))}
              </div>
            </SortableContext>
          </DndContext>
        </div>
      )}

      {/* Edit/Create modal */}
      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editTarget ? 'Edit Rule Line' : parentForNew ? 'Add Sub-Rule' : 'Add Rule Line'}
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="col-span-2 space-y-1.5">
                <Label>Rule Name / Scenario *</Label>
                <Input placeholder="e.g. Ordinary Time" {...register('rule_name')} />
                {errors.rule_name && <p className="text-xs text-red-500">{errors.rule_name.message}</p>}
              </div>
              <div className="col-span-2 space-y-1.5">
                <Label>Rule Definition</Label>
                <Textarea rows={2} placeholder="Describe the rule..." {...register('rule_definition')} />
              </div>
              <div className="space-y-1.5">
                <Label>Timesheet Input</Label>
                <Input {...register('timesheet_input')} />
              </div>
              <div className="space-y-1.5">
                <Label>Kronos Name</Label>
                <Input {...register('kronos_name')} />
              </div>
              <div className="space-y-1.5">
                <Label>JDE Std Costing</Label>
                <Input {...register('jde_standard_costing')} />
              </div>
              <div className="space-y-1.5">
                <Label>JDE Billing</Label>
                <Input {...register('jde_billing')} />
              </div>
              <div className="space-y-1.5">
                <Label>ExpressHR Name</Label>
                <Input {...register('expreshr_name')} />
              </div>
              <div className="space-y-1.5">
                <Label>Payslip Name</Label>
                <Input {...register('payslip_name')} />
              </div>
              <div className="space-y-1.5">
                <Label>Clause Ref</Label>
                <Input placeholder="e.g. 20.1" {...register('clause_ref')} />
              </div>
              <div className="space-y-1.5">
                <Label>Page Ref</Label>
                <Input placeholder="e.g. 45" {...register('page_ref')} />
              </div>
              <div className="space-y-1.5">
                <Label>Sort Order</Label>
                <Input type="number" {...register('sort_order')} />
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setModalOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={createMutation.isPending || updateMutation.isPending}>
                {createMutation.isPending || updateMutation.isPending ? 'Saving...' : 'Save'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(o) => !o && setDeleteTarget(null)}
        title="Delete Rule Line"
        description="This will permanently delete this rule and all its sub-rules."
        confirmLabel="Delete"
        variant="destructive"
        onConfirm={() => deleteTarget && deleteMutation.mutate(deleteTarget)}
        isLoading={deleteMutation.isPending}
      />
    </div>
  )
}

function RuleRow({
  rule,
  depth,
  isFirst,
  isLast,
  onEdit,
  onDelete,
  onAddSubRule,
  onReorder,
}: {
  rule: RuleLine
  depth: number
  isFirst?: boolean
  isLast?: boolean
  onEdit: (r: RuleLine) => void
  onDelete: (id: string) => void
  onAddSubRule: (parentId: string) => void
  onReorder: (id: string, direction: 'up' | 'down') => void
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: rule.id,
  })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  }

  return (
    <>
      <div
        ref={setNodeRef}
        style={style}
        className={cn(
          'grid grid-cols-[32px_1fr_160px_160px_140px_140px_120px_120px_100px_80px_80px] gap-2 px-3 py-2 items-center text-sm hover:bg-neutral-50 group min-w-max',
          isDragging && 'opacity-50 bg-neutral-50'
        )}
      >
        {/* Drag handle */}
        <button
          {...attributes}
          {...listeners}
          className="cursor-grab active:cursor-grabbing text-neutral-300 hover:text-neutral-500 opacity-0 group-hover:opacity-100 transition-opacity"
        >
          <GripVertical className="w-4 h-4" />
        </button>

        {/* Rule name with depth indent */}
        <div className="flex items-center gap-1 min-w-0" style={{ paddingLeft: depth * 24 }}>
          {depth > 0 && <ChevronRight className="w-3 h-3 text-neutral-400 shrink-0" />}
          <span className={cn('truncate font-medium', depth > 0 && 'text-neutral-600 text-xs font-normal')}>
            {rule.rule_name}
          </span>
          {/* Row actions */}
          <div className="flex gap-0.5 opacity-0 group-hover:opacity-100 ml-auto shrink-0">
            {depth === 0 && (
              <>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6"
                  onClick={() => onReorder(rule.id, 'up')}
                  disabled={isFirst}
                  title="Move up"
                >
                  <ChevronUp className="w-3 h-3" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6"
                  onClick={() => onReorder(rule.id, 'down')}
                  disabled={isLast}
                  title="Move down"
                >
                  <ChevronDown className="w-3 h-3" />
                </Button>
              </>
            )}
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6"
              onClick={() => onEdit(rule)}
              title="Edit"
            >
              <Pencil className="w-3 h-3" />
            </Button>
            {depth === 0 && (
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6"
                onClick={() => onAddSubRule(rule.id)}
                title="Add sub-rule"
              >
                <Plus className="w-3 h-3" />
              </Button>
            )}
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6 text-red-400 hover:text-red-600"
              onClick={() => onDelete(rule.id)}
              title="Delete"
            >
              <Trash2 className="w-3 h-3" />
            </Button>
          </div>
        </div>

        <Cell value={rule.rule_definition} />
        <Cell value={rule.timesheet_input} />
        <Cell value={rule.kronos_name} />
        <Cell value={rule.jde_standard_costing} />
        <Cell value={rule.jde_billing} />
        <Cell value={rule.expreshr_name} />
        <Cell value={rule.payslip_name} />
        <Cell value={rule.clause_ref} />
        <Cell value={rule.page_ref} />
      </div>

      {/* Children */}
      {rule.children?.map((child) => (
        <RuleRow
          key={child.id}
          rule={child}
          depth={depth + 1}
          onEdit={onEdit}
          onDelete={onDelete}
          onAddSubRule={onAddSubRule}
          onReorder={onReorder}
        />
      ))}
    </>
  )
}

function Cell({ value }: { value: string | null | undefined }) {
  return (
    <div className="truncate text-xs text-neutral-500 max-w-full" title={value ?? ''}>
      {value || '—'}
    </div>
  )
}
