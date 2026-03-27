import React, { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { ArrowLeft, CheckCircle, RotateCcw, GitBranch } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { StatusBadge } from '@/components/StatusBadge'
import { ConfirmDialog } from '@/components/ConfirmDialog'
import { Skeleton } from '@/components/ui/skeleton'
import { Badge } from '@/components/ui/badge'
import { AgreementMetadataTab } from './AgreementMetadataTab'
import { EmployeeTypesTab } from './EmployeeTypesTab'
import { RuleLinesTab } from './RuleLinesTab'
import { AllowancesTab } from './AllowancesTab'
import { LeavePaycodesTab } from './LeavePaycodesTab'
import { WageTableTab } from './WageTableTab'
import { KronosConfigTab } from './KronosConfigTab'
import { RecurringAllowancesTab } from './RecurringAllowancesTab'
import { AgreementHistoryTab } from './AgreementHistoryTab'
import api, { showApiError } from '@/lib/api'
import type { Agreement, EmployeeType } from '@/types'

const TYPE_LABELS: Record<string, string> = {
  modern_award: 'Modern Award',
  eba: 'EBA',
  common_law: 'Common Law',
}

const STATUS_BANNER: Record<string, string> = {
  draft: 'bg-amber-50 border-amber-200 text-amber-800',
  active: 'bg-green-50 border-green-200 text-green-800',
  superseded: 'bg-neutral-100 border-neutral-200 text-neutral-600',
  archived: 'bg-neutral-100 border-neutral-200 text-neutral-600',
}

function useAgreement(id: string) {
  return useQuery<Agreement>({
    queryKey: ['agreement', id],
    queryFn: async () => {
      const { data } = await api.get(`/agreements/${id}`)
      return data
    },
    onError: (e) => showApiError(e, 'Failed to load agreement'),
  } as Parameters<typeof useQuery>[0])
}

function useEmployeeTypes(id: string) {
  return useQuery<EmployeeType[]>({
    queryKey: ['employee-types', id],
    queryFn: async () => {
      const { data } = await api.get(`/agreements/${id}/employee-types`)
      return data
    },
    onError: (e) => showApiError(e, 'Failed to load employee types'),
  } as Parameters<typeof useQuery>[0])
}

export default function AgreementDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const [activateOpen, setActivateOpen] = useState(false)
  const [rollbackOpen, setRollbackOpen] = useState(false)
  const [newVersionOpen, setNewVersionOpen] = useState(false)

  const { data: agreement, isLoading } = useAgreement(id!)
  const { data: employeeTypes = [] } = useEmployeeTypes(id!)

  const activateMutation = useMutation({
    mutationFn: () => api.post(`/agreements/${id}/activate`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['agreement', id] })
      toast.success('Agreement activated')
      setActivateOpen(false)
    },
    onError: (e) => showApiError(e, 'Failed to activate agreement'),
  })

  const rollbackMutation = useMutation({
    mutationFn: () => api.post(`/agreements/${id}/rollback`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['agreement', id] })
      toast.success('Agreement rolled back to previous version')
      setRollbackOpen(false)
    },
    onError: (e) => showApiError(e, 'Failed to rollback'),
  })

  const newVersionMutation = useMutation({
    mutationFn: () => api.post(`/agreements/${id}/new-version`),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['agreements'] })
      toast.success('New version created')
      navigate(`/agreements/${res.data.id}`)
      setNewVersionOpen(false)
    },
    onError: (e) => showApiError(e, 'Failed to create new version'),
  })

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-96 w-full" />
      </div>
    )
  }

  if (!agreement) return null

  const bannerClass = STATUS_BANNER[agreement.status] ?? STATUS_BANNER.draft

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate('/agreements')}>
          <ArrowLeft className="w-4 h-4" />
        </Button>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-2xl font-bold text-neutral-900 truncate">{agreement.name}</h1>
            <Badge variant="info">{TYPE_LABELS[agreement.type] ?? agreement.type}</Badge>
            <StatusBadge status={agreement.status} />
            <span className="text-neutral-400 text-sm">v{agreement.version}</span>
          </div>
          <p className="text-neutral-500 text-sm mt-0.5">{agreement.code}</p>
        </div>
        <div className="flex gap-2 shrink-0">
          {agreement.status === 'draft' && (
            <Button size="sm" onClick={() => setActivateOpen(true)}>
              <CheckCircle className="w-4 h-4 mr-1" />
              Activate
            </Button>
          )}
          <Button size="sm" variant="outline" onClick={() => setNewVersionOpen(true)}>
            <GitBranch className="w-4 h-4 mr-1" />
            New Version
          </Button>
          {agreement.version > 1 && (
            <Button size="sm" variant="outline" onClick={() => setRollbackOpen(true)}>
              <RotateCcw className="w-4 h-4 mr-1" />
              Rollback
            </Button>
          )}
        </div>
      </div>

      {/* Status banner */}
      <div className={`rounded-md border px-4 py-2.5 text-sm font-medium ${bannerClass}`}>
        {agreement.status === 'draft' && 'This agreement is a draft. Activate it to make it effective.'}
        {agreement.status === 'active' && 'This agreement is active and currently in use.'}
        {agreement.status === 'superseded' && 'This agreement has been superseded by a newer version.'}
        {agreement.status === 'archived' && 'This agreement is archived and no longer in use.'}
      </div>

      {/* Tabs */}
      <Tabs defaultValue="metadata">
        <div className="overflow-x-auto">
          <TabsList className="w-max">
            <TabsTrigger value="metadata">Metadata</TabsTrigger>
            <TabsTrigger value="employee-types">Employee Types</TabsTrigger>
            <TabsTrigger value="rule-lines">Rule Lines</TabsTrigger>
            <TabsTrigger value="allowances">Allowances</TabsTrigger>
            <TabsTrigger value="leave-paycodes">Leave Paycodes</TabsTrigger>
            <TabsTrigger value="wage-table">Wage Table</TabsTrigger>
            <TabsTrigger value="kronos-config">Kronos Config</TabsTrigger>
            <TabsTrigger value="recurring">Recurring Allowances</TabsTrigger>
            <TabsTrigger value="history">History</TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="metadata" className="mt-4">
          <AgreementMetadataTab agreement={agreement} />
        </TabsContent>
        <TabsContent value="employee-types" className="mt-4">
          <EmployeeTypesTab agreementId={id!} />
        </TabsContent>
        <TabsContent value="rule-lines" className="mt-4">
          <RuleLinesTab agreementId={id!} employeeTypes={employeeTypes} />
        </TabsContent>
        <TabsContent value="allowances" className="mt-4">
          <AllowancesTab agreementId={id!} />
        </TabsContent>
        <TabsContent value="leave-paycodes" className="mt-4">
          <LeavePaycodesTab agreementId={id!} />
        </TabsContent>
        <TabsContent value="wage-table" className="mt-4">
          <WageTableTab agreementId={id!} />
        </TabsContent>
        <TabsContent value="kronos-config" className="mt-4">
          <KronosConfigTab agreementId={id!} />
        </TabsContent>
        <TabsContent value="recurring" className="mt-4">
          <RecurringAllowancesTab agreementId={id!} />
        </TabsContent>
        <TabsContent value="history" className="mt-4">
          <AgreementHistoryTab agreementId={id!} />
        </TabsContent>
      </Tabs>

      <ConfirmDialog
        open={activateOpen}
        onOpenChange={setActivateOpen}
        title="Activate Agreement"
        description="This will make the agreement active and apply it to new timesheets. Continue?"
        confirmLabel="Activate"
        onConfirm={() => activateMutation.mutate()}
        isLoading={activateMutation.isPending}
      />

      <ConfirmDialog
        open={rollbackOpen}
        onOpenChange={setRollbackOpen}
        title="Rollback Agreement"
        description="This will revert to the previous version. The current version will be marked as superseded."
        confirmLabel="Rollback"
        variant="destructive"
        onConfirm={() => rollbackMutation.mutate()}
        isLoading={rollbackMutation.isPending}
      />

      <ConfirmDialog
        open={newVersionOpen}
        onOpenChange={setNewVersionOpen}
        title="Create New Version"
        description="This will create a draft copy of this agreement as a new version for editing."
        confirmLabel="Create Version"
        onConfirm={() => newVersionMutation.mutate()}
        isLoading={newVersionMutation.isPending}
      />
    </div>
  )
}
