import {
  accountSchema,
  categorySchema,
  creditCardSchema,
  listResponseSchema,
  payeeSchema,
  settingsResponseSchema,
  type CreateAccountRequest,
  type CreateCategoryRequest,
  type CreateCreditCardRequest,
  type CreatePayeeRequest,
  type MeResponse,
  type UpdateAccountRequest,
  type UpdateCategoryRequest,
  type UpdateCreditCardRequest,
  type UpdatePayeeRequest,
  type UpdateSettingsRequest,
} from '@orla/contracts'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { z } from 'zod'
import { api } from '@/lib/api'
import { meQueryKey } from '@/features/auth/api'

/**
 * Hooks de um recurso CRUD da API (lista + criar/editar/excluir/restaurar), todos
 * invalidando a lista ao terminar. Soft delete: "excluir" pode ser desfeito com restore.
 */
function crudHooks<TItem extends z.ZodType, TCreate, TUpdate>(resource: string, item: TItem) {
  const listSchema = listResponseSchema(item)
  const key = [resource] as const

  function useList() {
    return useQuery({
      queryKey: key,
      queryFn: async ({ signal }) => (await api.get(`/${resource}`, listSchema, signal)).data,
    })
  }

  function useMutations() {
    const queryClient = useQueryClient()
    const onSettled = () => queryClient.invalidateQueries({ queryKey: key })
    return {
      create: useMutation({
        mutationFn: (input: TCreate) => api.post(`/${resource}`, item, input),
        onSettled,
      }),
      update: useMutation({
        mutationFn: ({ id, ...input }: TUpdate & { id: string }) =>
          api.patch(`/${resource}/${id}`, item, input),
        onSettled,
      }),
      remove: useMutation({
        mutationFn: (id: string) => api.delete(`/${resource}/${id}`, z.undefined()),
        onSettled,
      }),
      restore: useMutation({
        mutationFn: (id: string) => api.post(`/${resource}/${id}/restore`, item),
        onSettled,
      }),
    }
  }

  return { key, useList, useMutations }
}

export const accounts = crudHooks<typeof accountSchema, CreateAccountRequest, UpdateAccountRequest>(
  'accounts',
  accountSchema,
)
export const creditCards = crudHooks<
  typeof creditCardSchema,
  CreateCreditCardRequest,
  UpdateCreditCardRequest
>('credit-cards', creditCardSchema)
export const categories = crudHooks<
  typeof categorySchema,
  CreateCategoryRequest,
  UpdateCategoryRequest
>('categories', categorySchema)
export const payees = crudHooks<typeof payeeSchema, CreatePayeeRequest, UpdatePayeeRequest>(
  'payees',
  payeeSchema,
)

// ─── Configurações ───────────────────────────────────────────────────────────

const settingsKey = ['settings'] as const

export function useSettings() {
  return useQuery({
    queryKey: settingsKey,
    queryFn: ({ signal }) => api.get('/me/settings', settingsResponseSchema, signal),
  })
}

export function useUpdateSettings() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: UpdateSettingsRequest) =>
      api.patch('/me/settings', settingsResponseSchema, input),
    onSuccess: (settings) => {
      queryClient.setQueryData(settingsKey, settings)
      // Atualiza o /auth/me em cache na hora (senão a guarda de rota volta para o onboarding).
      queryClient.setQueryData<MeResponse | null>(meQueryKey, (me) =>
        me ? { ...me, onboardingCompleted: settings.onboardingCompleted } : me,
      )
    },
  })
}
