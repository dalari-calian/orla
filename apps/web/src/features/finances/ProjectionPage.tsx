import { formatBRL } from '@orla/core/money'
import type { ProjectionRow } from '@orla/contracts'
import { ChevronDown, CircleCheck, TriangleAlert } from 'lucide-react'
import { PageHeader } from '@/components/layout/PageHeader'
import { Card } from '@/components/ui/Card'
import { ErrorState, Skeleton } from '@/components/ui/States'
import { errorMessage } from '@/lib/api'
import { cn } from '@/lib/cn'
import { useProjection } from './api'
import { MonthBarsChart } from './charts'
import { monthLabel, shortMonthLabel } from './labels'

const columns = [
  { key: 'incomeCents', label: 'Entradas' },
  { key: 'fixedCents', label: 'Fixas' },
  { key: 'installmentCents', label: 'Parcelas' },
  { key: 'plannedCents', label: 'Planejamentos' },
  { key: 'variableCents', label: 'Variáveis' },
  { key: 'goalCents', label: 'Meta' },
] as const satisfies readonly { key: keyof ProjectionRow; label: string }[]

function Surplus({ cents, className }: { cents: number; className?: string }) {
  return (
    <span className={cn('font-semibold tabular', cents < 0 && 'text-negative', className)}>
      {formatBRL(cents)}
    </span>
  )
}

/** Mobile: cada mês é uma linha com a sobra; tocar abre a conta do mês. */
function MonthList({ rows }: { rows: ProjectionRow[] }) {
  return (
    <ul className="overflow-hidden rounded-card bg-surface shadow-card lg:hidden">
      {rows.map((row) => (
        <li key={row.month} className="[&+li]:border-t [&+li]:border-separator">
          <details className="group">
            <summary className="flex min-h-14 cursor-pointer list-none items-center gap-3 px-4">
              <span className="flex-1 text-body">{monthLabel(row.month)}</span>
              <Surplus cents={row.surplusCents} />
              <ChevronDown
                className="size-4 text-text-3 transition-transform group-open:rotate-180"
                aria-hidden
              />
            </summary>
            <dl className="grid grid-cols-2 gap-x-4 gap-y-2 px-4 pb-4 text-subhead">
              {columns.map((column) => (
                <div key={column.key} className="flex justify-between gap-2">
                  <dt className="text-text-2">{column.label}</dt>
                  <dd className="tabular">{formatBRL(row[column.key])}</dd>
                </div>
              ))}
            </dl>
          </details>
        </li>
      ))}
    </ul>
  )
}

/** Desktop: tabela mês a mês com os meses negativos destacados. */
function MonthTable({ rows }: { rows: ProjectionRow[] }) {
  return (
    <Card className="hidden overflow-x-auto p-0 lg:block lg:p-0">
      <table className="w-full text-subhead tabular">
        <thead>
          <tr className="border-b border-separator text-footnote text-text-2">
            <th scope="col" className="px-5 py-3 text-left font-medium">
              Mês
            </th>
            {columns.map((column) => (
              <th key={column.key} scope="col" className="px-3 py-3 text-right font-medium">
                {column.label}
              </th>
            ))}
            <th scope="col" className="px-5 py-3 text-right font-medium">
              Sobra
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr
              key={row.month}
              className={cn(
                'border-b border-separator last:border-0',
                row.surplusCents < 0 && 'bg-negative/6',
              )}
            >
              <th scope="row" className="px-5 py-3 text-left font-medium">
                {monthLabel(row.month)}
              </th>
              {columns.map((column) => (
                <td
                  key={column.key}
                  className={cn(
                    'px-3 py-3 text-right',
                    column.key === 'incomeCents' ? 'text-positive' : 'text-text',
                  )}
                >
                  {formatBRL(row[column.key])}
                </td>
              ))}
              <td className="px-5 py-3 text-right">
                <Surplus cents={row.surplusCents} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  )
}

/** /financas/projecao — próximos 12 meses (RF-52, docs/10 › Projeção 12 meses). */
export function ProjectionPage() {
  const query = useProjection()

  return (
    <>
      <PageHeader
        title="Projeção 12 meses"
        subtitle="O que já está previsto: salário, contas fixas, parcelas e planejamentos."
        back={{ to: '/financas', label: 'Finanças' }}
      />
      {query.isPending ? (
        <div className="space-y-5" aria-busy>
          <Skeleton className="h-24 rounded-card" />
          <Skeleton className="h-64 rounded-card" />
        </div>
      ) : query.isError ? (
        <Card>
          <ErrorState
            description={errorMessage(query.error)}
            onRetry={() => void query.refetch()}
          />
        </Card>
      ) : (
        <div className="animate-fade-in space-y-5">
          {query.data.firstNegativeMonth ? (
            <Card className="flex items-start gap-3 bg-negative/8" role="alert">
              <TriangleAlert className="mt-0.5 size-5 shrink-0 text-negative" aria-hidden />
              <div>
                <p className="text-headline font-semibold text-negative">
                  Em {monthLabel(query.data.firstNegativeMonth)} a sobra fica negativa
                </p>
                <p className="text-footnote text-text-2">
                  O previsto para o mês passa das entradas menos a meta. Reveja planejamentos ou a
                  meta desse mês.
                </p>
              </div>
            </Card>
          ) : (
            <Card className="flex items-start gap-3">
              <CircleCheck className="mt-0.5 size-5 shrink-0 text-positive" aria-hidden />
              <div>
                <p className="text-headline font-semibold">Todos os meses fecham no azul</p>
                <p className="text-footnote text-text-2">
                  Com o que está previsto hoje, a meta é cumprida até{' '}
                  {shortMonthLabel(
                    query.data.rows[query.data.rows.length - 1]?.month ?? query.data.from,
                  )}
                  .
                </p>
              </div>
            </Card>
          )}

          <Card>
            <p className="mb-2 text-headline font-semibold">Sobra prevista por mês</p>
            <MonthBarsChart
              name="Sobra"
              height={220}
              ariaLabel={`Sobra prevista: ${query.data.rows
                .map((row) => `${shortMonthLabel(row.month)} ${formatBRL(row.surplusCents)}`)
                .join(', ')}`}
              data={query.data.rows.map((row) => ({ month: row.month, value: row.surplusCents }))}
            />
          </Card>

          <MonthList rows={query.data.rows} />
          <MonthTable rows={query.data.rows} />
        </div>
      )}
    </>
  )
}
