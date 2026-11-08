import {
  authConfigResponseSchema,
  meResponseSchema,
  type LoginRequest,
  type MeResponse,
  type RegisterRequest,
  type UpdateProfileRequest,
} from '@orla/contracts'
import { type QueryClient, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { z } from 'zod'
import { ApiRequestError, api } from '@/lib/api'

export const meQueryKey = ['me'] as const

/**
 * Troca de sessão (login, cadastro, logout, sessão expirada): descarta os dados do usuário
 * anterior e grava o novo `me`. Não usa `queryClient.clear()`: ele remove a própria query `me`
 * e os guards já montados ficam presos à query antiga, sem perceber a mudança (a tela não saía
 * do login depois de entrar).
 */
export function switchSession(queryClient: QueryClient, me: MeResponse | null): void {
  void queryClient.cancelQueries({ predicate: (query) => query.queryKey[0] !== meQueryKey[0] })
  queryClient.removeQueries({ predicate: (query) => query.queryKey[0] !== meQueryKey[0] })
  queryClient.setQueryData(meQueryKey, me)
  // Leitura offline (PWA): as respostas da API guardadas são do usuário anterior.
  if (typeof caches !== 'undefined') void caches.delete('orla-api').catch(() => undefined)
}

/** Usuário logado; `null` quando não há sessão (401). */
export function useMe() {
  return useQuery({
    queryKey: meQueryKey,
    queryFn: async ({ signal }): Promise<MeResponse | null> => {
      try {
        return await api.get('/auth/me', meResponseSchema, signal)
      } catch (error) {
        if (error instanceof ApiRequestError && error.status === 401) {
          // Access token vencido: tenta renovar antes de concluir que não há sessão.
          try {
            return await api.post('/auth/refresh', meResponseSchema)
          } catch {
            return null
          }
        }
        throw error
      }
    },
    staleTime: 5 * 60_000,
    retry: false,
  })
}

export function useAuthConfig() {
  return useQuery({
    queryKey: ['auth-config'],
    queryFn: ({ signal }) => api.get('/auth/config', authConfigResponseSchema, signal),
    staleTime: Infinity,
  })
}

export function useLogin() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: LoginRequest) => api.post('/auth/login', meResponseSchema, input),
    onSuccess: (me) => switchSession(queryClient, me),
  })
}

export function useRegister() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: RegisterRequest) => api.post('/auth/register', meResponseSchema, input),
    onSuccess: (me) => switchSession(queryClient, me),
  })
}

export function useLogout() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: () => api.post('/auth/logout', z.undefined()),
    // Limpa tudo do usuário anterior da memória.
    onSettled: () => switchSession(queryClient, null),
  })
}

export function useUpdateProfile() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: UpdateProfileRequest) => api.patch('/auth/me', meResponseSchema, input),
    onSuccess: (me) => queryClient.setQueryData(meQueryKey, me),
  })
}
