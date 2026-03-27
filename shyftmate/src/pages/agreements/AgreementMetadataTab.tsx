import React from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import api, { showApiError } from '@/lib/api'
import { formatDate } from '@/lib/utils'
import type { Agreement, AgreementType } from '@/types'

const schema = z.object({
  name: z.string().min(1),
  code: z.string().min(1),
  type: z.enum(['modern_award', 'eba', 'common_law'] as const),
  description: z.string().optional(),
  effective_date: z.string().optional(),
  expiry_date: z.string().optional(),
})

type MetadataForm = z.infer<typeof schema>

interface Props {
  agreement: Agreement
}

export function AgreementMetadataTab({ agreement }: Props) {
  const qc = useQueryClient()
  const { register, handleSubmit, setValue, formState: { errors, isDirty } } = useForm<MetadataForm>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: agreement.name,
      code: agreement.code,
      type: agreement.type,
      description: agreement.description ?? '',
      effective_date: agreement.effective_date?.split('T')[0] ?? '',
      expiry_date: agreement.expiry_date?.split('T')[0] ?? '',
    },
  })

  const mutation = useMutation({
    mutationFn: (payload: MetadataForm) => api.patch(`/agreements/${agreement.id}`, payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['agreement', agreement.id] })
      toast.success('Agreement updated')
    },
    onError: (e) => showApiError(e, 'Failed to update agreement'),
  })

  return (
    <form onSubmit={handleSubmit((data) => mutation.mutate(data))} className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Agreement Details</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label>Agreement Name *</Label>
            <Input {...register('name')} />
            {errors.name && <p className="text-xs text-red-500">{errors.name.message}</p>}
          </div>
          <div className="space-y-1.5">
            <Label>Code *</Label>
            <Input {...register('code')} />
            {errors.code && <p className="text-xs text-red-500">{errors.code.message}</p>}
          </div>
          <div className="space-y-1.5">
            <Label>Type *</Label>
            <Select
              defaultValue={agreement.type}
              onValueChange={(v) => setValue('type', v as AgreementType, { shouldDirty: true })}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="modern_award">Modern Award</SelectItem>
                <SelectItem value="eba">EBA</SelectItem>
                <SelectItem value="common_law">Common Law</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Version</Label>
            <Input value={`v${agreement.version}`} disabled />
          </div>
          <div className="space-y-1.5">
            <Label>Effective Date</Label>
            <Input type="date" {...register('effective_date')} />
          </div>
          <div className="space-y-1.5">
            <Label>Expiry Date</Label>
            <Input type="date" {...register('expiry_date')} />
          </div>
          <div className="col-span-2 space-y-1.5">
            <Label>Description</Label>
            <Textarea rows={3} {...register('description')} />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Audit Info</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-sm">
          <div>
            <p className="text-neutral-500 text-xs">Created</p>
            <p className="font-medium">{formatDate(agreement.created_at)}</p>
          </div>
          <div>
            <p className="text-neutral-500 text-xs">Last Updated</p>
            <p className="font-medium">{formatDate(agreement.updated_at)}</p>
          </div>
          <div>
            <p className="text-neutral-500 text-xs">Last Synced</p>
            <p className="font-medium">{formatDate(agreement.last_synced_at)}</p>
          </div>
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button type="submit" disabled={!isDirty || mutation.isPending}>
          {mutation.isPending ? 'Saving...' : 'Save Changes'}
        </Button>
      </div>
    </form>
  )
}
