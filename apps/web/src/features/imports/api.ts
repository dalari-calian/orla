import {
  type CommitImportRequest,
  type CreateImportRequest,
  importJobSchema,
  type ImportRowsRequest,
  importRowsResponseSchema,
  listResponseSchema,
  restoreResponseSchema,
  type RestoreRequest,
} from '@orla/contracts'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { z } from 'zod'
import { api } from '@/lib/api'

const jobsKey = ['imports'] as const

export function useImportJobs() {
  return useQuery({
    queryKey: jobsKey,
    queryFn: async ({ signal }) =>
      (await api.get('/imports', listResponseSchema(importJobSchema), signal)).data,
  })
}

/** Último mapeamento salvo de cada tipo (docs/08, passo 3). */
export function useSavedMappings() {
  return useQuery({
    queryKey: ['imports', 'mappings'],
    queryFn: ({ signal }) =>
      api.get('/imports/mappings', z.record(z.string(), z.record(z.string(), z.unknown())), signal),
    staleTime: 60_000,
  })
}

export function createImport(input: CreateImportRequest) {
  return api.post('/imports', importJobSchema, input)
}

export function sendImportRows(id: string, input: ImportRowsRequest) {
  return api.post(`/imports/${id}/rows`, importRowsResponseSchema, input)
}

/** Depois de gravar ou desfazer, tudo de finanças e cadastros pode ter mudado. */
function useRefreshAll() {
  const queryClient = useQueryClient()
  return () => queryClient.invalidateQueries()
}

export function useCommitImport() {
  const refresh = useRefreshAll()
  return useMutation({
    mutationFn: ({ id, ...input }: CommitImportRequest & { id: string }) =>
      api.post(`/imports/${id}/commit`, importJobSchema, input),
    onSettled: refresh,
  })
}

export function useUndoImport() {
  const refresh = useRefreshAll()
  return useMutation({
    mutationFn: (id: string) => api.post(`/imports/${id}/undo`, importJobSchema),
    onSettled: refresh,
  })
}

export function useRestoreBackup() {
  const refresh = useRefreshAll()
  return useMutation({
    mutationFn: (input: RestoreRequest) => api.post('/restore', restoreResponseSchema, input),
    onSettled: refresh,
  })
}
