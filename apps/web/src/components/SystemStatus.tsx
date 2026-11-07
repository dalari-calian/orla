import { useQuery } from '@tanstack/react-query'
import { CircleCheck, CircleAlert, RefreshCw } from 'lucide-react'
import { Card, CardHeader } from '@/components/ui/Card'
import { ErrorState, Skeleton } from '@/components/ui/States'
import { fetchHealth } from '@/lib/api'
import { cn } from '@/lib/cn'

function StatusLine({ label, ok, detail }: { label: string; ok: boolean; detail: string }) {
  const Icon = ok ? CircleCheck : CircleAlert
  return (
    <li className="flex items-center gap-3 py-1.5">
      <Icon className={cn('size-5 shrink-0', ok ? 'text-positive' : 'text-negative')} aria-hidden />
      <span className="flex-1 text-body">{label}</span>
      <span className="text-subhead text-text-2">{detail}</span>
    </li>
  )
}

/** Mostra se a API e o banco estão respondendo (GET /api/v1/health via proxy do Vite). */
export function SystemStatus() {
  const health = useQuery({
    queryKey: ['health'],
    queryFn: ({ signal }) => fetchHealth(signal),
    refetchInterval: 30_000,
  })

  return (
    <Card>
      <CardHeader
        title="Status do sistema"
        action={
          <button
            type="button"
            onClick={() => void health.refetch()}
            aria-label="Verificar de novo"
            className="-mr-2 flex size-11 items-center justify-center rounded-full text-text-2 hover:bg-surface-2"
          >
            <RefreshCw className={cn('size-4', health.isFetching && 'animate-spin')} aria-hidden />
          </button>
        }
      />

      {health.isPending && (
        <div className="space-y-3 py-1.5">
          <Skeleton className="h-5 w-full" />
          <Skeleton className="h-5 w-4/5" />
        </div>
      )}

      {health.isError && (
        <ErrorState
          title="API fora do ar"
          description="Não foi possível falar com a API. Ela está rodando? (pnpm dev)"
          onRetry={() => void health.refetch()}
        />
      )}

      {health.data && (
        <ul>
          <StatusLine label="API" ok detail={`v${health.data.version}`} />
          <StatusLine
            label="Banco de dados"
            ok={health.data.database === 'up'}
            detail={health.data.database === 'up' ? 'Conectado' : 'Sem conexão (pnpm db:up)'}
          />
        </ul>
      )}
    </Card>
  )
}
