import type { ImportJob } from '@orla/contracts'
import { FileSpreadsheet, Upload } from 'lucide-react'
import { Link } from 'react-router'
import { PageHeader } from '@/components/layout/PageHeader'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { EmptyState, ErrorState, Skeleton } from '@/components/ui/States'
import { useToast } from '@/components/ui/Toast'
import { errorMessage } from '@/lib/api'
import { cn } from '@/lib/cn'
import { useImportJobs, useUndoImport } from './api'

const kindLabel: Record<ImportJob['kind'], string> = {
  monthly_sheet: 'Planilha mensal',
  transactions: 'Lançamentos',
  installments: 'Parcelamentos',
  portfolio_sheet: 'Planilha da carteira',
  assets: 'Ativos',
  trades: 'Operações',
  dividends: 'Proventos',
}

const dateTime = new Intl.DateTimeFormat('pt-BR', {
  day: '2-digit',
  month: 'short',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
})

function summary(job: ImportJob): string {
  const parts = [
    job.stats.transactions > 0 && `${job.stats.transactions} lançamentos`,
    job.stats.installmentPlans > 0 && `${job.stats.installmentPlans} parcelamentos`,
    job.stats.monthGoals > 0 && `${job.stats.monthGoals} metas`,
    job.stats.trades > 0 && `${job.stats.trades} operações`,
    job.stats.dividends > 0 && `${job.stats.dividends} proventos`,
    job.stats.balances > 0 && `${job.stats.balances} balanços`,
    job.stats.contributions > 0 && `${job.stats.contributions} aportes`,
    job.stats.assets > 0 && `${job.stats.assets} ativos`,
  ].filter(Boolean)
  return parts.length > 0 ? parts.join(' · ') : 'Nada gravado'
}

/** /config/importacoes — histórico com "Desfazer" (RI-03). */
export function ImportHistoryPage() {
  const query = useImportJobs()
  const undo = useUndoImport()
  const toast = useToast()

  return (
    <>
      <PageHeader
        title="Importações"
        subtitle="Cada importação pode ser desfeita: tudo o que ela criou sai de uma vez."
        back={{ to: '/config', label: 'Ajustes' }}
        actions={
          <Link
            to="/config/importar"
            className="flex min-h-11 items-center gap-1.5 px-3 text-subhead font-medium text-accent"
          >
            <Upload className="size-5" aria-hidden />
            <span className="hidden sm:inline">Importar</span>
          </Link>
        }
      />
      <div className="max-w-3xl">
        {query.isPending ? (
          <div className="space-y-3" aria-busy>
            <Skeleton className="h-24 rounded-card" />
            <Skeleton className="h-24 rounded-card" />
          </div>
        ) : query.isError ? (
          <Card>
            <ErrorState
              description={errorMessage(query.error)}
              onRetry={() => void query.refetch()}
            />
          </Card>
        ) : query.data.length === 0 ? (
          <Card className="p-0 md:p-0">
            <EmptyState
              icon={FileSpreadsheet}
              title="Nenhuma importação ainda"
              description="Traga o histórico das suas planilhas para o Orla."
              action={
                <Link
                  to="/config/importar"
                  className="inline-flex min-h-11 items-center font-semibold text-accent"
                >
                  Importar planilha
                </Link>
              }
            />
          </Card>
        ) : (
          <ul className="animate-fade-in space-y-3">
            {query.data.map((job) => {
              const undone = job.status === 'undone'
              return (
                <li key={job.id}>
                  <Card
                    className={cn(
                      'flex flex-col gap-3 sm:flex-row sm:items-center',
                      undone && 'opacity-70',
                    )}
                  >
                    <div className="min-w-0 flex-1">
                      <p className="flex items-center gap-2">
                        <span className="truncate text-headline font-semibold">{job.fileName}</span>
                        <span
                          className={cn(
                            'shrink-0 rounded-full px-2 py-0.5 text-caption font-medium',
                            undone ? 'bg-surface-2 text-text-2' : 'bg-positive/12 text-positive',
                          )}
                        >
                          {undone ? 'Desfeita' : 'Importada'}
                        </span>
                      </p>
                      <p className="text-footnote text-text-2">
                        {kindLabel[job.kind]} ·{' '}
                        {dateTime.format(new Date(job.committedAt ?? job.createdAt))}
                      </p>
                      <p className="mt-1 text-subhead">{summary(job)}</p>
                      {job.stats.created.length > 0 && (
                        <p className="truncate text-footnote text-text-2">
                          Criados: {job.stats.created.join(', ')}
                        </p>
                      )}
                    </div>
                    {!undone && (
                      <Button
                        variant="destructive"
                        loading={undo.isPending && undo.variables === job.id}
                        onClick={() => {
                          if (
                            !window.confirm(
                              `Desfazer a importação de ${job.fileName}? Tudo o que ela criou será removido.`,
                            )
                          )
                            return
                          undo.mutate(job.id, {
                            onSuccess: () => toast({ message: 'Importação desfeita' }),
                            onError: (error) =>
                              toast({ message: errorMessage(error), tone: 'error' }),
                          })
                        }}
                      >
                        Desfazer
                      </Button>
                    )}
                  </Card>
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </>
  )
}
