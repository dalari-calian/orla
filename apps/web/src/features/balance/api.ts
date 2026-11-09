import {
  balanceFormResponseSchema,
  balanceSchema,
  balancesResponseSchema,
  observedPricesResponseSchema,
  type SaveBalanceRequest,
} from '@orla/contracts'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { z } from 'zod'
import { api } from '@/lib/api'

/** Tudo que depende dos balanços (e a carteira, que recebe o saldo da renda fixa ao fechar). */
const BALANCE_KEYS = ['balances', 'balance-form', 'observed-prices', 'portfolio', 'asset-detail']

export function useBalances() {
  return useQuery({
    queryKey: ['balances'],
    queryFn: ({ signal }) => api.get('/balances', balancesResponseSchema, signal),
  })
}

export function useBalanceForm(month: string, date: string | null, enabled = true) {
  return useQuery({
    queryKey: ['balance-form', month, date],
    queryFn: ({ signal }) =>
      api.get(
        `/balances/form?month=${month}${date ? `&date=${date}` : ''}`,
        balanceFormResponseSchema,
        signal,
      ),
    refetchOnWindowFocus: false,
    enabled,
  })
}

export function useObservedPrices() {
  return useQuery({
    queryKey: ['observed-prices'],
    queryFn: ({ signal }) => api.get('/observed-prices', observedPricesResponseSchema, signal),
  })
}

export function useBalanceMutations() {
  const queryClient = useQueryClient()
  const invalidate = () =>
    queryClient.invalidateQueries({
      predicate: (query) => BALANCE_KEYS.includes(String(query.queryKey[0])),
    })
  return {
    create: useMutation({
      mutationFn: (input: SaveBalanceRequest) => api.post('/balances', balanceSchema, input),
      onSettled: invalidate,
    }),
    save: useMutation({
      mutationFn: ({ id, ...input }: SaveBalanceRequest & { id: string }) =>
        api.put(`/balances/${id}`, balanceSchema, input),
      onSettled: invalidate,
    }),
    close: useMutation({
      mutationFn: (id: string) => api.post(`/balances/${id}/close`, balanceSchema),
      onSettled: invalidate,
    }),
    reopen: useMutation({
      mutationFn: (id: string) => api.post(`/balances/${id}/reopen`, balanceSchema),
      onSettled: invalidate,
    }),
    remove: useMutation({
      mutationFn: (id: string) => api.delete(`/balances/${id}`, z.undefined()),
      onSettled: invalidate,
    }),
  }
}
