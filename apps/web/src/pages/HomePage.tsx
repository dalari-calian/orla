import { currentCompetenceMonth } from '@orla/core'
import { formatBRL, formatBRLParts } from '@orla/core/money'
import {
  BanknoteArrowUp,
  CalendarSync,
  ChartLine,
  CircleCheck,
  LayoutDashboard,
  Minus,
  PiggyBank,
  Plus,
  Receipt,
  ReceiptText,
  Scale,
  type LucideIcon,
} from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { Link } from 'react-router'
import { PageHeader } from '@/components/layout/PageHeader'
import { SystemStatus } from '@/components/SystemStatus'
import { Card, CardHeader } from '@/components/ui/Card'
import { categoryIcons, IconBadge } from '@/components/ui/CategoryIcon'
import { GroupedList, ListRow } from '@/components/ui/GroupedList'
import { ProgressBar } from '@/components/ui/Progress'
import { EmptyState, ErrorState, Skeleton } from '@/components/ui/States'
import { useMe } from '@/features/auth/api'
import { useBalances } from '@/features/balance/api'
import { useInstallmentSummary, useMonth, useRecentTransactions } from '@/features/finances/api'
import { useEntrySheet } from '@/features/finances/EntrySheet'
import { shortDate, shortMonthLabel } from '@/features/finances/labels'
import { NewRecurringSheet } from '@/features/finances/NewRecurringSheet'
import type { RecurringKind } from '@/features/finances/RecurringTemplatesPage'
import { UpcomingList } from '@/features/finances/Upcoming'
import { usePortfolio } from '@/features/portfolio/api'
import { formatPercent } from '@/features/portfolio/labels'
import { categories } from '@/features/registrations/api'
import { errorMessage } from '@/lib/api'
import { cn } from '@/lib/cn'
import { formatMonthYear } from '@/lib/dates'
import { useCountUp } from '@/lib/motion'
import { CURRENT_PHASE } from '@/routes/screens'

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

/** 2. Sobra prevista do mês (herói) com entradas · saídas · meta e quanto já foi pago. */
function MonthHero() {
  const month = useMonth(currentCompetenceMonth())
  const summary = month.data?.summary
  const paidRatio =
    summary && summary.expenseForecastCents > 0
      ? summary.expenseSettledCents / summary.expenseForecastCents
      : 0
  return (
    <Card className="md:col-span-2">
      <p className="text-subhead text-text-2">Sobra prevista do mês</p>
      <div className={cn('mt-2', summary && summary.projectedSurplusCents < 0 && 'text-negative')}>
        <HeroAmount cents={summary?.projectedSurplusCents ?? 0} />
      </div>
      {summary ? (
        <>
          <p className="mt-3 text-footnote text-text-2 tabular">
            Entradas {formatBRL(summary.incomeForecastCents)} · Saídas{' '}
            {formatBRL(summary.expenseForecastCents)} · Meta {formatBRL(summary.savingsGoalCents)}
            {summary.goalInvestedCents > 0 &&
              ` (investido ${formatBRL(summary.goalInvestedCents)})`}
          </p>
          <ProgressBar
            value={paidRatio}
            className="mt-3"
            label="Quanto das saídas do mês já foi pago"
          />
          <p className="mt-1 text-caption text-text-2 tabular">
            Pago {formatBRL(summary.expenseSettledCents)} de{' '}
            {formatBRL(summary.expenseForecastCents)}
          </p>
        </>
      ) : (
        <p className="mt-3 text-footnote text-text-2">
          {month.isError ? 'Não foi possível carregar o mês.' : 'Carregando o mês…'}
        </p>
      )}
      <Link
        to="/financas"
        className="mt-2 inline-flex min-h-11 items-center text-subhead font-medium text-accent"
      >
        Ver o mês em Finanças
      </Link>
    </Card>
  )
}

function Shortcut({
  icon: Icon,
  label,
  to,
  onClick,
  wide = false,
  highlight = false,
}: {
  icon: LucideIcon
  label: string
  to?: string
  onClick?: () => void
  /** Ocupa a linha inteira da grade. */
  wide?: boolean
  /** Destaque (ex.: balanço do mês ainda não feito). */
  highlight?: boolean
}) {
  // `cn` só junta classes (não resolve conflito): fundo e cor saem de um lado OU do outro,
  // senão o `bg-surface-2` vence o `bg-accent` no CSS e sobra texto branco no cinza.
  const className = cn(
    'press flex min-h-20 flex-col items-start justify-between gap-2 rounded-card p-3 text-left text-subhead font-medium',
    wide && 'col-span-2',
    highlight ? 'bg-accent text-white' : 'bg-surface-2 text-text',
  )
  const content = (
    <>
      <Icon className={cn('size-5', highlight ? 'text-white' : 'text-accent')} aria-hidden />
      {label}
    </>
  )
  return to ? (
    <Link to={to} className={className}>
      {content}
    </Link>
  ) : (
    <button type="button" onClick={onClick} className={className}>
      {content}
    </button>
  )
}

/**
 * 4. Atalhos: lançar gasto/receita, cadastrar conta fixa ou entrada fixa (salário) sem passar
 * por Ajustes, ir ao dashboard/projeção e simular o aporte. Fazer balanço chega na fase 7.
 */
function Shortcuts() {
  const { openNew } = useEntrySheet()
  const [recurringKind, setRecurringKind] = useState<RecurringKind | null>(null)
  const balances = useBalances()
  const currentMonth = currentCompetenceMonth()
  // Sem resposta ainda: não destaca (evita piscar).
  const balanceDone = balances.data?.currentMonthDone ?? true
  return (
    <Card>
      <CardHeader title="Atalhos" />
      <div className="grid grid-cols-2 gap-2">
        <Shortcut icon={Minus} label="Gasto" onClick={() => openNew('expense')} />
        <Shortcut icon={Plus} label="Receita" onClick={() => openNew('income')} />
        <Shortcut
          icon={CalendarSync}
          label="Conta fixa"
          onClick={() => setRecurringKind('fixed')}
        />
        <Shortcut
          icon={BanknoteArrowUp}
          label="Entrada fixa"
          onClick={() => setRecurringKind('income')}
        />
        <Shortcut icon={LayoutDashboard} label="Dashboard" to="/financas/dashboard" />
        <Shortcut icon={ChartLine} label="Projeção" to="/financas/projecao" />
        <Shortcut icon={PiggyBank} label="Simular aporte" to="/aporte" />
        <Shortcut
          icon={Scale}
          label={balanceDone ? 'Balanço' : `Fazer balanço de ${shortMonthLabel(currentMonth)}`}
          to={`/balanco/${currentMonth}`}
          highlight={!balanceDone}
        />
      </div>
      <NewRecurringSheet kind={recurringKind} onClose={() => setRecurringKind(null)} />
    </Card>
  )
}

function ListCard({
  title,
  action,
  children,
}: {
  title: string
  action?: ReactNode
  children: ReactNode
}) {
  return (
    <Card className="min-w-0 overflow-hidden p-0 md:p-0">
      <div className="px-4 pt-4 md:px-5 md:pt-5">
        <CardHeader title={title} action={action} />
      </div>
      {children}
    </Card>
  )
}

/** 3. Patrimônio (Carteira): valor total e resultado, das cotações em cache. */
function WealthCard() {
  const query = usePortfolio()
  const balances = useBalances()
  const year = balances.data?.years.at(-1)
  return (
    <Card>
      <CardHeader
        title="Patrimônio"
        action={
          <Link
            to="/carteira"
            className="flex min-h-11 items-center text-subhead font-medium text-accent"
          >
            Carteira
          </Link>
        }
      />
      {query.isPending ? (
        <Skeleton className="h-16" />
      ) : query.isError ? (
        <ErrorState description={errorMessage(query.error)} onRetry={() => void query.refetch()} />
      ) : query.data.positions.length === 0 ? (
        <p className="text-subhead text-text-2">
          Cadastre seus investimentos para ver o patrimônio aqui.
        </p>
      ) : (
        <>
          <p className="text-title-2 font-semibold tabular">
            {formatBRL(query.data.totals.valueCents)}
          </p>
          {year && (
            <p className="text-footnote tabular">
              <span className="text-text-2">Ganho real em {year.year}: </span>
              <span className={cn(year.gainCents >= 0 ? 'text-positive' : 'text-negative')}>
                {year.gainCents >= 0 ? '+' : '−'}
                {formatBRL(Math.abs(year.gainCents))}
                {year.twr !== null && ` (${formatPercent(year.twr, true)})`}
              </span>
            </p>
          )}
          <p
            className={cn(
              'text-footnote tabular',
              query.data.totals.resultCents >= 0 ? 'text-positive' : 'text-negative',
            )}
          >
            {query.data.totals.resultCents >= 0 ? '+' : '−'}
            {formatBRL(Math.abs(query.data.totals.resultCents))} no total
            <span className="text-text-2">
              {' '}
              · proventos 12m {formatBRL(query.data.totals.dividends12mCents)}
            </span>
          </p>
        </>
      )}
    </Card>
  )
}

/** 6. Parcelamentos: total para quitar tudo. */
function InstallmentsCard() {
  const query = useInstallmentSummary()
  return (
    <Card>
      <CardHeader
        title="Parcelamentos"
        action={
          <Link
            to="/financas/parcelamentos"
            className="flex min-h-11 items-center text-subhead font-medium text-accent"
          >
            Ver
          </Link>
        }
      />
      {query.isPending ? (
        <Skeleton className="h-16" />
      ) : query.isError ? (
        <ErrorState description={errorMessage(query.error)} onRetry={() => void query.refetch()} />
      ) : query.data.payoffTotalCents === 0 ? (
        <p className="text-subhead text-text-2">Nenhuma parcela em aberto.</p>
      ) : (
        <>
          <p className="text-footnote text-text-2">Para quitar tudo</p>
          <p className="text-title-2 font-semibold tabular">
            {formatBRL(query.data.payoffTotalCents)}
          </p>
          <p className="text-footnote text-text-2">
            {query.data.activeCount === 1
              ? '1 parcelamento'
              : `${query.data.activeCount} parcelamentos`}{' '}
            · livre em {shortMonthLabel(query.data.freeFromMonth)}
          </p>
        </>
      )}
    </Card>
  )
}

/** 7. Últimos 5 lançamentos realizados. */
function RecentList() {
  const query = useRecentTransactions(5)
  const categoryList = categories.useList()
  const { openEdit } = useEntrySheet()
  if (query.isPending) {
    return (
      <div className="space-y-3 p-4" aria-busy>
        <Skeleton className="h-10" />
        <Skeleton className="h-10" />
      </div>
    )
  }
  if (query.isError) {
    return (
      <div className="p-4">
        <ErrorState description={errorMessage(query.error)} onRetry={() => void query.refetch()} />
      </div>
    )
  }
  if (query.data.data.length === 0) {
    return (
      <EmptyState
        icon={ReceiptText}
        title="Nada lançado ainda"
        description="Use o + para lançar o primeiro gasto."
        className="py-6"
      />
    )
  }
  return (
    <ul className="animate-fade-in">
      {query.data.data.map((item) => {
        const category = categoryList.data?.find((c) => c.id === item.categoryId)
        const income = item.type === 'income'
        return (
          <li key={item.id}>
            <button
              type="button"
              onClick={() => openEdit(item)}
              className="flex min-h-15 w-full items-center gap-3 px-4 py-2.5 text-left transition-colors hover:bg-surface-2 active:bg-surface-2"
            >
              <IconBadge
                icon={category ? categoryIcons[category.icon] : Receipt}
                color={category?.color ?? 'var(--text-2)'}
              />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-body">{item.description}</span>
                <span className="block truncate text-footnote text-text-2">
                  {shortDate(item.date)}
                  {category && ` · ${category.name}`}
                </span>
              </span>
              <span
                className={cn('shrink-0 text-body font-medium tabular', income && 'text-positive')}
              >
                {income ? '+' : '−'}
                {formatBRL(item.amountCents)}
              </span>
            </button>
          </li>
        )
      })}
    </ul>
  )
}

/** Início (docs/10): parte financeira; patrimônio e notícias chegam com a carteira. */
export function HomePage() {
  const me = useMe()
  const firstName = (me.data?.displayName || me.data?.username || '').split(' ')[0]
  return (
    <>
      <PageHeader
        title="Início"
        subtitle={`Olá, ${firstName}! Este é o seu mês de ${formatMonthYear(new Date())}.`}
      />

      <div className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3">
        <MonthHero />
        <Shortcuts />
        <ListCard
          title="Próximos vencimentos"
          action={<span className="text-footnote text-text-2">7 dias</span>}
        >
          <UpcomingList limit={5} />
        </ListCard>
        <WealthCard />
        <InstallmentsCard />
        <ListCard
          title="Últimos lançamentos"
          action={
            <Link
              to="/financas"
              className="flex min-h-11 items-center text-subhead font-medium text-accent"
            >
              Ver tudo
            </Link>
          }
        >
          <RecentList />
        </ListCard>

        <GroupedList title="Roteiro do Orla" className="md:col-span-2">
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
        <SystemStatus />
      </div>
    </>
  )
}
