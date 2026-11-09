import {
  cardStatementSchema,
  dashboardResponseSchema,
  projectionResponseSchema,
  upcomingResponseSchema,
  type DashboardPeriod,
  installmentPlanDetailSchema,
  installmentPlanSchema,
  installmentSummarySchema,
  listResponseSchema,
  monthResponseSchema,
  monthSettingsResponseSchema,
  payeeSuggestionSchema,
  recurringTemplateSchema,
  transactionSchema,
  type CreateInstallmentPlanRequest,
  type CreateRecurringTemplateRequest,
  type CreateTransactionRequest,
  type PayoffInstallmentPlanRequest,
  type SettleTransactionRequest,
  type UpdateInstallmentPlanRequest,
  type UpdateMonthSettingsRequest,
  type UpdateRecurringTemplateRequest,
  type UpdateTransactionRequest,
} from '@orla/contracts'
import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query'
import { z } from 'zod'
import { api } from '@/lib/api'

/**
 * Tudo que depende de lançamentos (mês, faturas, parcelamentos, modelos) é invalidado junto
 * depois de qualquer escrita: os números de uma tela mudam quando outra é editada.
 */
const financeKeys = [
  'month',
  'transactions',
  'statement',
  'installment-plans',
  'recurring-templates',
  'dashboard',
  'projection',
  'upcoming',
]

export function invalidateFinances(queryClient: QueryClient): Promise<void> {
  return queryClient
    .invalidateQueries({ predicate: (query) => financeKeys.includes(String(query.queryKey[0])) })
    .then(() => undefined)
}

function useInvalidate() {
  const queryClient = useQueryClient()
  return () => invalidateFinances(queryClient)
}

// ─── Mês ─────────────────────────────────────────────────────────────────────

/** `enabled: false` evita buscar (e materializar) um mês que ainda não se sabe qual é. */
export function useMonth(month: string, enabled = true) {
  return useQuery({
    queryKey: ['month', month],
    queryFn: ({ signal }) => api.get(`/months/${month}`, monthResponseSchema, signal),
    placeholderData: (previous) => previous,
    enabled,
  })
}

export function useUpdateMonthSettings(month: string) {
  const onSettled = useInvalidate()
  return useMutation({
    mutationFn: (input: UpdateMonthSettingsRequest) =>
      api.patch(`/months/${month}/settings`, monthSettingsResponseSchema, input),
    onSettled,
  })
}

// ─── Dashboard, projeção e vencimentos (Fase 3) ──────────────────────────────

export function useDashboard(month: string, period: DashboardPeriod) {
  return useQuery({
    queryKey: ['dashboard', month, period],
    queryFn: ({ signal }) =>
      api.get(`/months/${month}/dashboard?period=${period}`, dashboardResponseSchema, signal),
    placeholderData: (previous) => previous,
  })
}

export function useProjection(from?: string) {
  return useQuery({
    queryKey: ['projection', from ?? 'current'],
    queryFn: ({ signal }) =>
      api.get(
        from ? `/projection?from=${from}&months=12` : '/projection?months=12',
        projectionResponseSchema,
        signal,
      ),
    placeholderData: (previous) => previous,
  })
}

export function useUpcoming(days = 7) {
  return useQuery({
    queryKey: ['upcoming', days],
    queryFn: ({ signal }) => api.get(`/upcoming?days=${days}`, upcomingResponseSchema, signal),
  })
}

/** Últimos lançamentos realizados (Início). */
export function useRecentTransactions(limit = 5) {
  return useQuery({
    queryKey: ['transactions', 'recent', limit],
    queryFn: ({ signal }) =>
      api.get(
        `/transactions?status=settled&limit=${limit}`,
        listResponseSchema(transactionSchema),
        signal,
      ),
  })
}

// ─── Lançamentos ─────────────────────────────────────────────────────────────

export function useTransactionMutations() {
  const onSettled = useInvalidate()
  return {
    create: useMutation({
      mutationFn: (input: CreateTransactionRequest) =>
        api.post('/transactions', transactionSchema, input),
      onSettled,
    }),
    update: useMutation({
      mutationFn: ({ id, ...input }: UpdateTransactionRequest & { id: string }) =>
        api.patch(`/transactions/${id}`, transactionSchema, input),
      onSettled,
    }),
    settle: useMutation({
      mutationFn: ({ id, ...input }: SettleTransactionRequest & { id: string }) =>
        api.post(`/transactions/${id}/settle`, transactionSchema, input),
      onSettled,
    }),
    unsettle: useMutation({
      mutationFn: (id: string) => api.post(`/transactions/${id}/unsettle`, transactionSchema),
      onSettled,
    }),
    remove: useMutation({
      mutationFn: (id: string) => api.delete(`/transactions/${id}`, z.undefined()),
      onSettled,
    }),
    restore: useMutation({
      mutationFn: (id: string) => api.post(`/transactions/${id}/restore`, transactionSchema),
      onSettled,
    }),
  }
}

/** RM-03: categoria/forma/cartão do último lançamento do estabelecimento. */
export function fetchPayeeSuggestion(queryClient: QueryClient, payeeId: string) {
  return queryClient.fetchQuery({
    queryKey: ['payee-suggestion', payeeId],
    queryFn: ({ signal }) =>
      api.get(`/payees/${payeeId}/suggestion`, payeeSuggestionSchema, signal),
    staleTime: 0,
  })
}

// ─── Modelos recorrentes ─────────────────────────────────────────────────────

const templatesKey = ['recurring-templates'] as const

export function useRecurringTemplates() {
  return useQuery({
    queryKey: templatesKey,
    queryFn: async ({ signal }) =>
      (await api.get('/recurring-templates', listResponseSchema(recurringTemplateSchema), signal))
        .data,
  })
}

export function useRecurringTemplateMutations() {
  const onSettled = useInvalidate()
  return {
    create: useMutation({
      mutationFn: (input: CreateRecurringTemplateRequest) =>
        api.post('/recurring-templates', recurringTemplateSchema, input),
      onSettled,
    }),
    update: useMutation({
      mutationFn: ({ id, ...input }: UpdateRecurringTemplateRequest & { id: string }) =>
        api.patch(`/recurring-templates/${id}`, recurringTemplateSchema, input),
      onSettled,
    }),
    remove: useMutation({
      mutationFn: ({ id, removeFromMonth }: { id: string; removeFromMonth?: string | undefined }) =>
        api.delete(
          `/recurring-templates/${id}${removeFromMonth ? `?removeFromMonth=${removeFromMonth}` : ''}`,
          z.undefined(),
        ),
      onSettled,
    }),
    restore: useMutation({
      mutationFn: (id: string) =>
        api.post(`/recurring-templates/${id}/restore`, recurringTemplateSchema),
      onSettled,
    }),
  }
}

// ─── Parcelamentos ───────────────────────────────────────────────────────────

export type PlanFilter = 'active' | 'finished'

export function useInstallmentPlans(status: PlanFilter) {
  return useQuery({
    queryKey: ['installment-plans', 'list', status],
    queryFn: async ({ signal }) =>
      (
        await api.get(
          `/installment-plans?status=${status}`,
          listResponseSchema(installmentPlanSchema),
          signal,
        )
      ).data,
  })
}

export function useInstallmentSummary() {
  return useQuery({
    queryKey: ['installment-plans', 'summary'],
    queryFn: ({ signal }) =>
      api.get('/installment-plans/summary', installmentSummarySchema, signal),
  })
}

export function useInstallmentPlan(id: string) {
  return useQuery({
    queryKey: ['installment-plans', 'detail', id],
    queryFn: ({ signal }) =>
      api.get(`/installment-plans/${id}`, installmentPlanDetailSchema, signal),
  })
}

export function useInstallmentPlanMutations() {
  const onSettled = useInvalidate()
  return {
    create: useMutation({
      mutationFn: (input: CreateInstallmentPlanRequest) =>
        api.post('/installment-plans', installmentPlanDetailSchema, input),
      onSettled,
    }),
    update: useMutation({
      mutationFn: ({ id, ...input }: UpdateInstallmentPlanRequest & { id: string }) =>
        api.patch(`/installment-plans/${id}`, installmentPlanDetailSchema, input),
      onSettled,
    }),
    payoff: useMutation({
      mutationFn: ({ id, ...input }: PayoffInstallmentPlanRequest & { id: string }) =>
        api.post(`/installment-plans/${id}/payoff`, installmentPlanDetailSchema, input),
      onSettled,
    }),
    cancel: useMutation({
      mutationFn: (id: string) =>
        api.post(`/installment-plans/${id}/cancel`, installmentPlanDetailSchema),
      onSettled,
    }),
    remove: useMutation({
      mutationFn: (id: string) => api.delete(`/installment-plans/${id}`, z.undefined()),
      onSettled,
    }),
    restore: useMutation({
      mutationFn: (id: string) =>
        api.post(`/installment-plans/${id}/restore`, installmentPlanDetailSchema),
      onSettled,
    }),
  }
}

// ─── Fatura ──────────────────────────────────────────────────────────────────

export function useCardStatement(cardId: string, month: string) {
  return useQuery({
    queryKey: ['statement', cardId, month],
    queryFn: ({ signal }) =>
      api.get(`/credit-cards/${cardId}/statements/${month}`, cardStatementSchema, signal),
    placeholderData: (previous) => previous,
  })
}

export function usePayStatement(cardId: string, month: string) {
  const onSettled = useInvalidate()
  return useMutation({
    mutationFn: () =>
      api.post(`/credit-cards/${cardId}/statements/${month}/pay`, cardStatementSchema),
    onSettled,
  })
}
