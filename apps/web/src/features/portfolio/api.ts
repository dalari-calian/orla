import {
  assetClassSchema,
  assetDetailResponseSchema,
  assetSchema,
  assetTradeSchema,
  dividendSchema,
  dividendsSummaryResponseSchema,
  listResponseSchema,
  portfolioResponseSchema,
  quotesStatusSchema,
  tickerSearchResponseSchema,
  type CreateAssetClassRequest,
  type CreateAssetRequest,
  type CreateAssetTradeRequest,
  type CreateDividendRequest,
  type DividendBatchRequest,
  type PutTargetAllocationsRequest,
  type UpdateAssetClassRequest,
  type UpdateAssetRequest,
  type UpdateAssetTradeRequest,
  type UpdateDividendRequest,
} from '@orla/contracts'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { z } from 'zod'
import { api } from '@/lib/api'

/** Tudo que depende da carteira é invalidado junto depois de qualquer escrita. */
const PORTFOLIO_KEYS = [
  'portfolio',
  'asset-classes',
  'assets',
  'asset-detail',
  'dividends',
] as const

function useInvalidatePortfolio() {
  const queryClient = useQueryClient()
  return () =>
    queryClient.invalidateQueries({
      predicate: (query) =>
        (PORTFOLIO_KEYS as readonly string[]).includes(String(query.queryKey[0])),
    })
}

/**
 * Carteira com as cotações do cache do servidor. No navegador também fica em cache por 5 min
 * e não recarrega ao voltar para a aba: cotação nova só quando o servidor tiver (RC-31).
 */
export function usePortfolio() {
  return useQuery({
    queryKey: ['portfolio'],
    queryFn: ({ signal }) => api.get('/portfolio', portfolioResponseSchema, signal),
    staleTime: 5 * 60_000,
    refetchOnWindowFocus: false,
  })
}

export function useRefreshQuotes() {
  const invalidate = useInvalidatePortfolio()
  return useMutation({
    mutationFn: () =>
      api.post('/quotes/refresh', quotesStatusSchema.extend({ refreshed: z.number() })),
    onSettled: invalidate,
  })
}

export function useAssetClasses() {
  return useQuery({
    queryKey: ['asset-classes'],
    queryFn: async ({ signal }) =>
      (await api.get('/asset-classes', listResponseSchema(assetClassSchema), signal)).data,
    staleTime: 5 * 60_000,
  })
}

export function useAssetClassMutations() {
  const invalidate = useInvalidatePortfolio()
  return {
    create: useMutation({
      mutationFn: (input: CreateAssetClassRequest) =>
        api.post('/asset-classes', assetClassSchema, input),
      onSettled: invalidate,
    }),
    update: useMutation({
      mutationFn: ({ id, ...input }: UpdateAssetClassRequest & { id: string }) =>
        api.patch(`/asset-classes/${id}`, assetClassSchema, input),
      onSettled: invalidate,
    }),
    remove: useMutation({
      mutationFn: (id: string) => api.delete(`/asset-classes/${id}`, z.undefined()),
      onSettled: invalidate,
    }),
    putTargets: useMutation({
      mutationFn: (input: PutTargetAllocationsRequest) =>
        api.put('/target-allocations', listResponseSchema(assetClassSchema), input),
      onSettled: invalidate,
    }),
  }
}

export function useAssets(archived = false) {
  return useQuery({
    queryKey: ['assets', archived],
    queryFn: async ({ signal }) =>
      (
        await api.get(
          `/assets${archived ? '?archived=true' : ''}`,
          listResponseSchema(assetSchema),
          signal,
        )
      ).data,
    staleTime: 60_000,
  })
}

export function useAssetDetail(id: string) {
  return useQuery({
    queryKey: ['asset-detail', id],
    queryFn: ({ signal }) => api.get(`/assets/${id}`, assetDetailResponseSchema, signal),
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  })
}

export function useAssetMutations() {
  const invalidate = useInvalidatePortfolio()
  return {
    create: useMutation({
      mutationFn: (input: CreateAssetRequest) => api.post('/assets', assetSchema, input),
      onSettled: invalidate,
    }),
    update: useMutation({
      mutationFn: ({ id, ...input }: UpdateAssetRequest & { id: string }) =>
        api.patch(`/assets/${id}`, assetSchema, input),
      onSettled: invalidate,
    }),
    remove: useMutation({
      mutationFn: (id: string) => api.delete(`/assets/${id}`, z.undefined()),
      onSettled: invalidate,
    }),
  }
}

export function useTradeMutations() {
  const invalidate = useInvalidatePortfolio()
  return {
    create: useMutation({
      mutationFn: (input: CreateAssetTradeRequest) =>
        api.post('/asset-trades', assetTradeSchema, input),
      onSettled: invalidate,
    }),
    update: useMutation({
      mutationFn: ({ id, ...input }: UpdateAssetTradeRequest & { id: string }) =>
        api.patch(`/asset-trades/${id}`, assetTradeSchema, input),
      onSettled: invalidate,
    }),
    remove: useMutation({
      mutationFn: (id: string) => api.delete(`/asset-trades/${id}`, z.undefined()),
      onSettled: invalidate,
    }),
    restore: useMutation({
      mutationFn: (id: string) => api.post(`/asset-trades/${id}/restore`, assetTradeSchema),
      onSettled: invalidate,
    }),
  }
}

export function useDividendMutations() {
  const invalidate = useInvalidatePortfolio()
  return {
    create: useMutation({
      mutationFn: (input: CreateDividendRequest) => api.post('/dividends', dividendSchema, input),
      onSettled: invalidate,
    }),
    batch: useMutation({
      mutationFn: (input: DividendBatchRequest) =>
        api.post('/dividends/batch', listResponseSchema(dividendSchema), input),
      onSettled: invalidate,
    }),
    update: useMutation({
      mutationFn: ({ id, ...input }: UpdateDividendRequest & { id: string }) =>
        api.patch(`/dividends/${id}`, dividendSchema, input),
      onSettled: invalidate,
    }),
    remove: useMutation({
      mutationFn: (id: string) => api.delete(`/dividends/${id}`, z.undefined()),
      onSettled: invalidate,
    }),
    restore: useMutation({
      mutationFn: (id: string) => api.post(`/dividends/${id}/restore`, dividendSchema),
      onSettled: invalidate,
    }),
  }
}

export function useDividendsSummary() {
  return useQuery({
    queryKey: ['dividends', 'summary'],
    queryFn: ({ signal }) => api.get('/dividends/summary', dividendsSummaryResponseSchema, signal),
    staleTime: 5 * 60_000,
  })
}

export function useDividends(from: string, to: string) {
  return useQuery({
    queryKey: ['dividends', 'list', from, to],
    queryFn: async ({ signal }) =>
      (
        await api.get(
          `/dividends?from=${from}&to=${to}`,
          listResponseSchema(dividendSchema),
          signal,
        )
      ).data,
    staleTime: 5 * 60_000,
  })
}

/**
 * Autocomplete de ticker: o servidor busca numa lista em cache (7 dias). Aqui, cada termo
 * também fica em cache por 1 h e só busca a partir de 2 letras.
 */
export function useTickerSearch(query: string) {
  const term = query.trim().toUpperCase()
  return useQuery({
    queryKey: ['tickers', term],
    queryFn: ({ signal }) =>
      api.get(`/tickers/search?q=${encodeURIComponent(term)}`, tickerSearchResponseSchema, signal),
    enabled: term.length >= 2,
    staleTime: 60 * 60_000,
    gcTime: 60 * 60_000,
  })
}
