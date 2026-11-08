import {
  adminFeedbackListResponseSchema,
  adminFeedbackSchema,
  feedbackSchema,
  listResponseSchema,
  type CreateFeedbackRequest,
  type FeedbackKindValue,
  type FeedbackStatusValue,
  type UpdateFeedbackRequest,
} from '@orla/contracts'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { z } from 'zod'
import { api } from '@/lib/api'

const key = ['feedback'] as const

export function useMyFeedback() {
  return useQuery({
    queryKey: [...key, 'mine'],
    queryFn: async ({ signal }) =>
      (await api.get('/feedback/mine', listResponseSchema(feedbackSchema), signal)).data,
  })
}

export function useAdminFeedback(
  filters: { status: FeedbackStatusValue | null; kind: FeedbackKindValue | null },
  enabled: boolean,
) {
  const params = new URLSearchParams()
  if (filters.status) params.set('status', filters.status)
  if (filters.kind) params.set('kind', filters.kind)
  const query = params.toString()
  return useQuery({
    queryKey: [...key, 'admin', filters],
    queryFn: ({ signal }) =>
      api.get(
        `/admin/feedback${query ? `?${query}` : ''}`,
        adminFeedbackListResponseSchema,
        signal,
      ),
    enabled,
  })
}

export function useFeedbackMutations() {
  const queryClient = useQueryClient()
  const invalidate = () => queryClient.invalidateQueries({ queryKey: key })
  return {
    create: useMutation({
      mutationFn: (input: CreateFeedbackRequest) => api.post('/feedback', feedbackSchema, input),
      onSettled: invalidate,
    }),
    remove: useMutation({
      mutationFn: (id: string) => api.delete(`/feedback/${id}`, z.undefined()),
      onSettled: invalidate,
    }),
    update: useMutation({
      mutationFn: ({ id, ...input }: UpdateFeedbackRequest & { id: string }) =>
        api.patch(`/admin/feedback/${id}`, adminFeedbackSchema, input),
      onSettled: invalidate,
    }),
  }
}
