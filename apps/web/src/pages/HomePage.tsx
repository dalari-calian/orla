import { currentCompetenceMonth } from '@orla/core'
import { formatBRL, formatBRLParts } from '@orla/core/money'
import { CircleCheck } from 'lucide-react'
import { Link } from 'react-router'
import { PageHeader } from '@/components/layout/PageHeader'
import { SystemStatus } from '@/components/SystemStatus'
import { Card } from '@/components/ui/Card'
import { GroupedList, ListRow } from '@/components/ui/GroupedList'
import { useMe } from '@/features/auth/api'
import { useMonth } from '@/features/finances/api'
import { cn } from '@/lib/cn'
import { useCountUp } from '@/lib/motion'
import { formatMonthYear } from '@/lib/dates'

const roadmap = [
  { phase: 0, title: 'Fundação', detail: 'Monorepo, banco, API, casca do app' },
  { phase: 1, title: 'Login e cadastros', detail: 'Contas, cartões, categorias' },
  { phase: 2, title: 'Finanças', detail: 'Lançamentos, parcelas, fatura, metas' },
  { phase: 3, title: 'Dashboard e projeção', detail: 'Gráficos e próximos 12 meses' },
  { phase: 4, title: 'Importação', detail: 'Trazer as planilhas para o app' },
  { phase: 5, title: 'Carteira', detail: 'Ativos, operações, proventos, cotações' },
  { phase: 6, title: 'Aporte', detail: 'Simulador e rebalanceamento' },
  { phase: 7, title: 'Balanço', detail: 'Rentabilidade real mês a mês' },
  { phase: 8, title: 'Notícias e polimento', detail: 'Notícias, ocultar valores, E2E' },
]

const CURRENT_PHASE = 2

function HeroAmount({ cents }: { cents: number }) {
  const parts = formatBRLParts(useCountUp(cents))
  return (
    <p
      aria-label={formatBRL(cents)}
      className="text-[44px] leading-none font-semibold tracking-tight tabular lg:text-5xl"
    >
      {parts.sign}
      <span className="mr-1 text-title-2 font-medium text-text-2">{parts.symbol}</span>
      {parts.integer}
      <span className="text-title-2 text-text-2">,{parts.fraction}</span>
    </p>
  )
}

export function HomePage() {
  const me = useMe()
  const firstName = (me.data?.displayName || me.data?.username || '').split(' ')[0]
  const month = useMonth(currentCompetenceMonth())
  const summary = month.data?.summary
  return (
    <>
      <PageHeader
        title="Início"
        subtitle={`Olá, ${firstName}! Este é o seu mês de ${formatMonthYear(new Date())}.`}
      />

      <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
        <Card className="md:col-span-2 xl:col-span-2">
          <p className="text-subhead text-text-2">Sobra prevista do mês</p>
          <div
            className={cn('mt-2', summary && summary.projectedSurplusCents < 0 && 'text-negative')}
          >
            <HeroAmount cents={summary?.projectedSurplusCents ?? 0} />
          </div>
          {summary ? (
            <p className="mt-3 text-footnote text-text-2 tabular">
              Entradas {formatBRL(summary.incomeForecastCents)} · Saídas{' '}
              {formatBRL(summary.expenseForecastCents)} · Meta {formatBRL(summary.savingsGoalCents)}
            </p>
          ) : (
            <p className="mt-3 text-footnote text-text-2">
              {month.isError ? 'Não foi possível carregar o mês.' : 'Carregando o mês…'}
            </p>
          )}
          <Link
            to="/financas"
            className="mt-3 inline-flex min-h-11 items-center text-subhead font-medium text-accent"
          >
            Ver o mês em Finanças
          </Link>
        </Card>

        <SystemStatus />

        <GroupedList title="Roteiro do Orla" className="md:col-span-2 xl:col-span-3">
          {roadmap.map((step) => (
            <ListRow
              key={step.phase}
              icon={step.phase <= CURRENT_PHASE ? CircleCheck : undefined}
              iconColor="var(--positive)"
              title={`Fase ${step.phase} — ${step.title}`}
              subtitle={step.detail}
              value={
                step.phase === CURRENT_PHASE ? 'Agora' : step.phase < CURRENT_PHASE ? 'Feito' : ''
              }
            />
          ))}
        </GroupedList>
      </div>
    </>
  )
}
