import {
  contributionPlanSchema,
  contributionSchema,
  executeContributionPlanResponseSchema,
  listResponseSchema,
  type CreateContributionRequest,
  type ExecuteContributionPlanRequest,
  type SaveContributionPlanRequest,
  type UpdateContributionRequest,
} from '@orla/contracts'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { z } from 'zod'
import { invalidateFinances } from '@/features/finances/api'
import { api } from '@/lib/api'

const plansKey = ['contribution-plans'] as const
const contributionsKey = ['contributions'] as const

export function usePlans() {
  return useQuery({
    queryKey: plansKey,
    queryFn: async ({ signal }) =>
      (await api.get('/contribution-plans', listResponseSchema(contributionPlanSchema), signal))
        .data,
  })
}

export function usePlan(id: string) {
  return useQuery({
    queryKey: [...plansKey, id],
    queryFn: ({ signal }) => api.get(`/contribution-plans/${id}`, contributionPlanSchema, signal),
    // O rascunho é editado localmente; não recarregar por cima do que está sendo digitado.
    refetchOnWindowFocus: false,
  })
}

export function usePlanMutations() {
  const queryClient = useQueryClient()
  const invalidateList = () => queryClient.invalidateQueries({ queryKey: plansKey, exact: true })
  return {
    create: useMutation({
      mutationFn: (input: SaveContributionPlanRequest) =>
        api.post('/contribution-plans', contributionPlanSchema, input),
      onSettled: invalidateList,
    }),
    /** Autosave: atualiza o cache do plano sem refazer a busca. */
    save: useMutation({
      mutationFn: ({ id, ...input }: SaveContributionPlanRequest & { id: string }) =>
        api.put(`/contribution-plans/${id}`, contributionPlanSchema, input),
      onSuccess: (plan) => {
        queryClient.setQueryData([...plansKey, plan.id], plan)
        void invalidateList()
      },
    }),
    remove: useMutation({
      mutationFn: (id: string) => api.delete(`/contribution-plans/${id}`, z.undefined()),
      onSettled: invalidateList,
    }),
    execute: useMutation({
      mutationFn: ({ id, ...input }: ExecuteContributionPlanRequest & { id: string }) =>
        api.post(`/contribution-plans/${id}/execute`, executeContributionPlanResponseSchema, input),
      onSuccess: (result) => {
        queryClient.setQueryData([...plansKey, result.plan.id], result.plan)
        // Compras novas: carteira, ativos, aportes e o mês (investido da meta) mudam.
        const keys = ['contribution-plans', 'contributions', 'portfolio', 'assets', 'asset-detail']
        void queryClient.invalidateQueries({
          predicate: (query) => keys.includes(String(query.queryKey[0])),
        })
        void invalidateFinances(queryClient)
      },
    }),
  }
}

export function useContributions() {
  return useQuery({
    queryKey: contributionsKey,
    queryFn: async ({ signal }) =>
      (await api.get('/contributions', listResponseSchema(contributionSchema), signal)).data,
  })
}

export function useContributionMutations() {
  const queryClient = useQueryClient()
  const invalidate = () => queryClient.invalidateQueries({ queryKey: contributionsKey })
  return {
    create: useMutation({
      mutationFn: (input: CreateContributionRequest) =>
        api.post('/contributions', contributionSchema, input),
      onSettled: invalidate,
    }),
    update: useMutation({
      mutationFn: ({ id, ...input }: UpdateContributionRequest & { id: string }) =>
        api.patch(`/contributions/${id}`, contributionSchema, input),
      onSettled: invalidate,
    }),
    remove: useMutation({
      mutationFn: (id: string) => api.delete(`/contributions/${id}`, z.undefined()),
      onSettled: invalidate,
    }),
  }
}
