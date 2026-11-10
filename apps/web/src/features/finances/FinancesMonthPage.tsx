import { monthName, plannedProgress } from '@orla/core'
import { formatBRL } from '@orla/core/money'
import type { MonthResponse, Transaction, UpdateMonthSettingsRequest } from '@orla/contracts'
import {
  BanknoteArrowUp,
  CalendarRange,
  CalendarSync,
  Check,
  Circle,
  ChartLine,
  ChevronDown,
  CreditCard,
  LayoutDashboard,
  PiggyBank,
  Plus,
  ReceiptText,
  Repeat,
  TriangleAlert,
} from 'lucide-react'
import { useMemo, useState, type ReactNode } from 'react'
import { Link } from 'react-router'
import { PageHeader } from '@/components/layout/PageHeader'
import { Button } from '@/components/ui/Button'
import { AnimatedMoney } from '@/components/ui/AnimatedMoney'
import { Card } from '@/components/ui/Card'
import { IconBadge } from '@/components/ui/CategoryIcon'
import { SlideSwap } from '@/components/ui/SlideSwap'
import { ChipGroup } from '@/components/ui/Chips'
import { MoneyInput } from '@/components/ui/MoneyInput'
import { ProgressBar } from '@/components/ui/Progress'
import { Sheet } from '@/components/ui/Sheet'
import { EmptyState, ErrorState, Skeleton } from '@/components/ui/States'
import { useToast } from '@/components/ui/Toast'
import { accounts, categories, creditCards, payees } from '@/features/registrations/api'
import { CreditCardForm } from '@/features/registrations/forms'
import { errorMessage } from '@/lib/api'
import { cn } from '@/lib/cn'
import { NewRecurringSheet } from './NewRecurringSheet'
import type { RecurringKind } from './RecurringTemplatesPage'
import { useMonth, useTransactionMutations, useUpdateMonthSettings } from './api'
import { CarryoverBanner, CarryoverSheet } from './Carryover'
import { useEntrySheet } from './EntrySheet'
import { monthLabel, useMonthParam } from './labels'
import { MonthSwitcher } from './MonthSwitcher'
import { TransactionRow } from './TransactionRow'

type Filter = 'all' | 'income' | 'expense' | 'investment' | 'forecast'

const filterOptions = [
  { value: 'all', label: 'Todos' },
  { value: 'income', label: 'Receitas' },
  { value: 'expense', label: 'Despesas' },
  { value: 'investment', label: 'Investimento' },
  { value: 'forecast', label: 'Previstos' },
] as const

/** Seções colapsáveis da lista do mês (docs/10). */
const sectionDefs = [
  // Saldo do mês anterior (RF-54) não é renda nem gasto: seção própria, no topo.
  {
    key: 'carryover',
    title: 'Saldo anterior',
    match: (t: Transaction) => t.nature === 'carryover',
  },
  {
    key: 'income',
    title: 'Receitas',
    match: (t: Transaction) => t.type === 'income' && t.nature !== 'carryover',
  },
  {
    key: 'fixed',
    title: 'Fixas',
    match: (t: Transaction) => t.type === 'expense' && t.nature === 'fixed',
  },
  {
    key: 'installment',
    title: 'Parcelas do mês',
    match: (t: Transaction) => t.nature === 'installment',
  },
  { key: 'planned', title: 'Planejamentos', match: (t: Transaction) => t.nature === 'planned' },
  { key: 'variable', title: 'Variáveis', match: (t: Transaction) => t.nature === 'variable' },
] as const

function MoneyLine({
  label,
  value,
  detail,
  tone,
}: {
  label: string
  value: number
  detail?: string
  tone?: 'positive' | 'negative'
}) {
  return (
    <div className="min-w-0">
      <p className="text-footnote text-text-2">{label}</p>
      <p
        className={cn(
          'truncate text-headline font-semibold tabular',
          tone === 'positive' && 'text-positive',
          tone === 'negative' && 'text-negative',
        )}
      >
        {formatBRL(value)}
      </p>
      {detail && <p className="truncate text-caption text-text-2">{detail}</p>}
    </div>
  )
}

/** Resumo do mês (RF-51): sobra prevista em destaque, entradas, saídas e meta. */
function SummaryCard({ data, onEditGoal }: { data: MonthResponse; onEditGoal: () => void }) {
  const { summary } = data
  const negative = summary.projectedSurplusCents < 0
  return (
    <Card className="space-y-4">
      <div>
        <p className="text-subhead text-text-2">Sobra prevista</p>
        <p
          className={cn(
            'mt-1 text-[34px] leading-tight font-semibold tracking-tight tabular',
            negative && 'text-negative',
          )}
        >
          <AnimatedMoney cents={summary.projectedSurplusCents} />
        </p>
        {negative ? (
          <p className="mt-2 flex items-start gap-1.5 text-footnote text-negative" role="alert">
            <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
            Você vai furar a meta em {formatBRL(summary.goalShortfallCents)}.
          </p>
        ) : (
          <p className="mt-1 text-footnote text-text-2">Livre para gastar sem furar a meta.</p>
        )}
      </div>
      <div className="grid grid-cols-3 gap-3 border-t border-separator pt-4">
        <MoneyLine
          label="Entradas"
          value={summary.incomeForecastCents}
          detail={`recebido ${formatBRL(summary.incomeSettledCents)}`}
          tone="positive"
        />
        <MoneyLine
          label="Saídas"
          value={summary.expenseForecastCents}
          detail={`pago ${formatBRL(summary.expenseSettledCents)}`}
        />
        <button type="button" onClick={onEditGoal} className="min-w-0 text-left">
          <MoneyLine
            label="Meta"
            value={summary.savingsGoalCents}
            detail={
              summary.goalInvestedCents > 0
                ? `investido ${formatBRL(summary.goalInvestedCents)}`
                : data.settings.savingsGoalCents !== null
                  ? 'deste mês · editar'
                  : 'padrão · editar'
            }
          />
        </button>
      </div>
      {summary.carryoverCents !== 0 && (
        <div className="flex items-center justify-between border-t border-separator pt-3 text-subhead">
          <span className="text-text-2">Saldo de {monthName(data.carryover.previousMonth)}</span>
          <span
            className={cn(
              'font-medium tabular',
              summary.carryoverCents > 0 ? 'text-positive' : 'text-negative',
            )}
          >
            {summary.carryoverCents > 0 ? '+' : ''}
            {formatBRL(summary.carryoverCents)}
          </span>
        </div>
      )}
      <div className="flex items-center justify-between border-t border-separator pt-3 text-subhead">
        <span className="text-text-2">Saldo do mês até agora</span>
        <span className="font-medium tabular">{formatBRL(summary.currentBalanceCents)}</span>
      </div>
    </Card>
  )
}

/**
 * Meta de investimento do mês (RF-50), tratada como uma conta: o valor da meta (só deste mês
 * ou a padrão) e quanto já foi investido — o investido sai do saldo do mês.
 */
function MonthGoalSheet({
  month,
  data,
  open,
  onClose,
}: {
  month: string
  data: MonthResponse
  open: boolean
  onClose: () => void
}) {
  const update = useUpdateMonthSettings(month)
  const toast = useToast()
  const { summary } = data
  const [goalValue, setGoalValue] = useState<number | null>(summary.savingsGoalCents)
  const [invested, setInvested] = useState<number | null>(data.settings.goalInvestedCents)
  const goal = data.settings.defaultSavingsGoal
  const defaultLabel =
    goal.mode === 'fixed'
      ? formatBRL(goal.amountCents)
      : goal.mode === 'percent'
        ? `${goal.percent.replace('.', ',')}% das entradas`
        : 'sem meta'
  const target = goalValue ?? 0
  const investedNow = invested ?? 0

  const save = (input: UpdateMonthSettingsRequest, message: string) =>
    update.mutate(input, {
      onSuccess: () => {
        toast({ message })
        onClose()
      },
    })

  function submit() {
    const input: UpdateMonthSettingsRequest = {
      goalInvestedCents: invested && invested > 0 ? invested : null,
    }
    // Só grava a meta "deste mês" se ela mudou (senão continua seguindo a padrão).
    if (goalValue !== summary.savingsGoalCents) input.savingsGoalCents = goalValue ?? 0
    save(input, 'Meta do mês atualizada')
  }

  return (
    <Sheet open={open} onClose={onClose} title={`Meta de ${monthLabel(month)}`}>
      <div className="space-y-4">
        <MoneyInput
          label="Meta deste mês"
          value={goalValue}
          onChange={setGoalValue}
          large
          hint={`Padrão: ${defaultLabel}. Mude a padrão em Configurações › Metas.`}
        />
        <MoneyInput
          label="Quanto já investiu"
          value={invested}
          onChange={setInvested}
          hint="Sai do saldo do mês, como uma conta paga. Pode ser menos que a meta."
        />
        {target > 0 && (
          <div className="space-y-1.5 rounded-field bg-surface-2 p-3">
            <ProgressBar
              value={Math.min(investedNow / target, 1)}
              tone={investedNow >= target ? 'positive' : 'accent'}
              label="Quanto da meta já foi investido"
            />
            <p className="text-footnote text-text-2 tabular">
              {investedNow >= target
                ? `Meta atingida: investido ${formatBRL(investedNow)}`
                : `Investido ${formatBRL(investedNow)} de ${formatBRL(target)} · faltam ${formatBRL(target - investedNow)}`}
            </p>
          </div>
        )}
        {update.error && (
          <p role="alert" className="text-footnote text-negative">
            {errorMessage(update.error)}
          </p>
        )}
        <Button block loading={update.isPending} onClick={submit}>
          Salvar
        </Button>
        {target > 0 && investedNow < target && (
          <Button
            block
            variant="secondary"
            disabled={update.isPending}
            onClick={() =>
              save(
                {
                  goalInvestedCents: target,
                  ...(goalValue !== summary.savingsGoalCents && { savingsGoalCents: target }),
                },
                'Meta do mês investida',
              )
            }
          >
            Investi a meta inteira
          </Button>
        )}
        {data.settings.savingsGoalCents !== null && (
          <Button
            block
            variant="plain"
            disabled={update.isPending}
            onClick={() => save({ savingsGoalCents: null }, 'Voltou a usar a meta padrão')}
          >
            Voltar a usar a meta padrão
          </Button>
        )}
      </div>
    </Sheet>
  )
}

/**
 * A meta na lista do mês, como uma conta a pagar: o check marca a meta inteira como investida
 * (ou desfaz); tocar na linha abre o sheet para informar um valor parcial ou mudar a meta.
 */
function GoalRow({
  month,
  data,
  onOpen,
}: {
  month: string
  data: MonthResponse
  onOpen: () => void
}) {
  const update = useUpdateMonthSettings(month)
  const toast = useToast()
  const [toggled, setToggled] = useState(false)
  const { savingsGoalCents: goal, goalInvestedCents: invested } = data.summary
  const done = invested > 0 && invested >= goal
  const subtitle = done
    ? 'investido'
    : invested > 0
      ? `investido ${formatBRL(invested)} · faltam ${formatBRL(goal - invested)}`
      : 'a investir'

  return (
    <li className="relative flex items-center transition-colors hover:bg-surface-2 has-[:active]:bg-surface-2">
      <button
        type="button"
        onClick={onOpen}
        className="flex min-h-15 min-w-0 flex-1 items-center gap-3 py-2.5 pl-4 text-left"
      >
        <IconBadge icon={PiggyBank} color="var(--accent)" />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-body">Meta de investimento</span>
          <span className="block truncate text-footnote text-text-2">{subtitle}</span>
        </span>
        <span className="shrink-0 text-right">
          <span className={cn('block text-body font-medium tabular', !done && 'opacity-70')}>
            −{formatBRL(Math.max(goal, invested))}
          </span>
          <span className="block text-caption text-text-2">{done ? 'investido' : 'previsto'}</span>
        </span>
      </button>
      <button
        type="button"
        disabled={update.isPending}
        aria-pressed={done}
        aria-label={
          done ? 'Desmarcar a meta como investida' : 'Marcar a meta inteira como investida'
        }
        onClick={() => {
          setToggled(true)
          update.mutate(
            { goalInvestedCents: done ? null : goal },
            { onError: (error) => toast({ message: errorMessage(error), tone: 'error' }) },
          )
        }}
        className="press flex size-12 shrink-0 items-center justify-center text-text-3 hover:text-accent disabled:opacity-50"
      >
        {done ? (
          <span
            className={cn(
              'flex size-6 items-center justify-center rounded-full bg-positive text-white',
              toggled && 'animate-pop',
            )}
          >
            <Check className="size-4" strokeWidth={3} aria-hidden />
          </span>
        ) : (
          <Circle className="size-6" strokeWidth={1.75} aria-hidden />
        )}
      </button>
    </li>
  )
}

/** Cadastro rápido de cartão sem sair de Finanças (o mesmo formulário de Configurações › Cartões). */
function NewCardSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const accountList = accounts.useList()
  const { create } = creditCards.useMutations()
  const toast = useToast()
  const active = (accountList.data ?? []).filter((account) => !account.isArchived)
  const close = () => {
    create.reset()
    onClose()
  }

  return (
    <Sheet open={open} onClose={close} title="Novo cartão">
      {open &&
        (accountList.isPending ? (
          <Skeleton className="h-64" />
        ) : active.length === 0 ? (
          <EmptyState
            icon={CreditCard}
            title="Cadastre o banco primeiro"
            description="Todo cartão pertence a uma conta (o banco que emite). Cadastre a conta e volte aqui."
            action={
              <Link
                to="/config/contas"
                onClick={close}
                className="inline-flex min-h-11 items-center font-semibold text-accent"
              >
                Cadastrar conta
              </Link>
            }
            className="py-4"
          />
        ) : (
          <CreditCardForm
            accounts={active}
            error={create.error}
            submitting={create.isPending}
            submitLabel="Criar cartão"
            onSubmit={async (values) => {
              await create.mutateAsync(values)
              toast({ message: 'Cartão criado' })
              close()
            }}
          />
        ))}
    </Sheet>
  )
}

function Section({
  title,
  total,
  children,
}: {
  title: string
  total: number
  children: ReactNode
}) {
  return (
    <details open className="group">
      <summary className="mb-2 flex min-h-11 cursor-pointer list-none items-center gap-2 px-4">
        <ChevronDown
          className="size-4 text-text-2 transition-transform group-not-open:-rotate-90"
          aria-hidden
        />
        <h2 className="flex-1 text-footnote font-medium tracking-wide text-text-2 uppercase">
          {title}
        </h2>
        <span className="text-footnote font-medium text-text-2 tabular">{formatBRL(total)}</span>
      </summary>
      <ul className="overflow-hidden rounded-card bg-surface shadow-card">{children}</ul>
    </details>
  )
}

function LoadingList() {
  return (
    <div className="space-y-px overflow-hidden rounded-card bg-surface shadow-card" aria-busy>
      {[0, 1, 2, 3].map((index) => (
        <div key={index} className="flex items-center gap-3 px-4 py-3">
          <Skeleton className="size-9 rounded-full" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-4 w-2/5" />
            <Skeleton className="h-3 w-1/4" />
          </div>
          <Skeleton className="h-4 w-16" />
        </div>
      ))}
    </div>
  )
}

/** /financas — o mês (docs/10 › Finanças — Mês). */
export function FinancesMonthPage() {
  const [month, setMonth] = useMonthParam()
  const query = useMonth(month)
  const categoryList = categories.useList()
  const payeeList = payees.useList()
  const cardList = creditCards.useList()
  const { settle, unsettle } = useTransactionMutations()
  const { openNew, openEdit } = useEntrySheet()
  const toast = useToast()
  const [filter, setFilter] = useState<Filter>('all')
  const [goalOpen, setGoalOpen] = useState(false)
  const [cardOpen, setCardOpen] = useState(false)
  const [recurringKind, setRecurringKind] = useState<RecurringKind | null>(null)
  const [carryoverOpen, setCarryoverOpen] = useState<Transaction | null>(null)

  const categoryById = useMemo(
    () => new Map((categoryList.data ?? []).map((category) => [category.id, category])),
    [categoryList.data],
  )
  const payeeById = useMemo(
    () => new Map((payeeList.data ?? []).map((payee) => [payee.id, payee.name])),
    [payeeList.data],
  )

  const transactions = query.data?.transactions ?? []
  const byId = new Map(transactions.map((item) => [item.id, item]))
  const visible = transactions.filter((item) => {
    if (filter === 'income') return item.type === 'income'
    if (filter === 'expense') return item.type === 'expense'
    if (filter === 'forecast') return item.status === 'forecast'
    // A aba Investimento mostra só a meta do mês (não é gasto, não entra em Despesas).
    if (filter === 'investment') return false
    return true
  })
  const summary = query.data?.summary
  const hasGoal = Boolean(
    summary && (summary.savingsGoalCents > 0 || summary.goalInvestedCents > 0),
  )
  const showGoal =
    hasGoal &&
    (filter === 'all' ||
      filter === 'investment' ||
      (filter === 'forecast' && (summary?.goalRemainingCents ?? 0) > 0))

  function toggle(transaction: Transaction) {
    const run =
      transaction.status === 'settled'
        ? unsettle.mutateAsync(transaction.id)
        : settle.mutateAsync({ id: transaction.id })
    run.catch((error: unknown) => toast({ message: errorMessage(error), tone: 'error' }))
  }

  const pendingId = settle.isPending
    ? settle.variables.id
    : unsettle.isPending
      ? unsettle.variables
      : null

  return (
    <>
      <PageHeader
        title="Finanças"
        actions={
          <Button
            variant="plain"
            onClick={() => openNew()}
            className="px-3"
            aria-label="Novo lançamento"
          >
            <Plus className="size-5" aria-hidden />
            <span className="hidden sm:inline">Lançar</span>
          </Button>
        }
      />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px] lg:items-start">
        <div className="space-y-5 lg:order-2 lg:sticky lg:top-6">
          <MonthSwitcher month={month} onChange={setMonth} />
          {query.data ? (
            <SummaryCard data={query.data} onEditGoal={() => setGoalOpen(true)} />
          ) : query.isPending ? (
            <Skeleton className="h-56 rounded-card" />
          ) : null}
          {query.data && <CarryoverBanner month={month} carryover={query.data.carryover} />}

          <nav aria-label="Atalhos de Finanças" className="grid grid-cols-2 gap-3">
            <button
              type="button"
              onClick={() => setRecurringKind('fixed')}
              className="press flex min-h-14 items-center gap-2 rounded-card bg-surface px-4 text-left text-subhead font-medium shadow-card"
            >
              <CalendarSync className="size-5 shrink-0 text-accent" aria-hidden />
              Conta fixa
            </button>
            <button
              type="button"
              onClick={() => setRecurringKind('income')}
              className="press flex min-h-14 items-center gap-2 rounded-card bg-surface px-4 text-left text-subhead font-medium shadow-card"
            >
              <BanknoteArrowUp className="size-5 shrink-0 text-accent" aria-hidden />
              Entrada fixa
            </button>
            <Link
              to={`/financas/dashboard?mes=${month}`}
              className="press flex min-h-14 items-center gap-2 rounded-card bg-surface px-4 text-subhead font-medium shadow-card"
            >
              <LayoutDashboard className="size-5 text-accent" aria-hidden />
              Dashboard
            </Link>
            <Link
              to="/financas/projecao"
              className="press flex min-h-14 items-center gap-2 rounded-card bg-surface px-4 text-subhead font-medium shadow-card"
            >
              <ChartLine className="size-5 text-accent" aria-hidden />
              Projeção
            </Link>
            <Link
              to="/financas/parcelamentos"
              className="press flex min-h-14 items-center gap-2 rounded-card bg-surface px-4 text-subhead font-medium shadow-card"
            >
              <CalendarRange className="size-5 text-accent" aria-hidden />
              Parcelamentos
            </Link>
            <Link
              to="/config/recorrentes"
              className="press flex min-h-14 items-center gap-2 rounded-card bg-surface px-4 text-subhead font-medium shadow-card"
            >
              <Repeat className="size-5 text-accent" aria-hidden />
              Recorrentes
            </Link>
            {(cardList.data ?? []).map((card) => (
              <Link
                key={card.id}
                to={`/financas/cartoes/${card.id}/fatura?mes=${month}`}
                className="press flex min-h-14 min-w-0 items-center gap-2 rounded-card bg-surface px-4 text-subhead font-medium shadow-card"
              >
                <CreditCard className="size-5 shrink-0 text-accent" aria-hidden />
                <span className="truncate">Fatura {card.name}</span>
              </Link>
            ))}
            <button
              type="button"
              onClick={() => setCardOpen(true)}
              className="press flex min-h-14 items-center gap-2 rounded-card border border-dashed border-separator px-4 text-subhead font-medium text-accent"
            >
              <Plus className="size-5" aria-hidden />
              Novo cartão
            </button>
          </nav>
        </div>

        <div className="min-w-0 space-y-5 lg:order-1">
          <ChipGroup
            label="Filtrar lançamentos"
            options={filterOptions}
            value={filter}
            onChange={(value) => setFilter(value ?? 'all')}
          />

          <SlideSwap index={filterOptions.findIndex((option) => option.value === filter)}>
            {query.isPending ? (
              <LoadingList />
            ) : query.isError ? (
              <div className="rounded-card bg-surface p-4 shadow-card">
                <ErrorState
                  description={errorMessage(query.error)}
                  onRetry={() => void query.refetch()}
                />
              </div>
            ) : filter === 'investment' && !hasGoal ? (
              <div className="rounded-card bg-surface shadow-card">
                <EmptyState
                  icon={PiggyBank}
                  title={`Sem meta de investimento em ${monthLabel(month)}`}
                  description="Defina quanto quer investir: o valor sai da sobra do mês como uma conta, para não ser gasto."
                  action={<Button onClick={() => setGoalOpen(true)}>Definir meta</Button>}
                />
              </div>
            ) : visible.length === 0 && !showGoal ? (
              <div className="rounded-card bg-surface shadow-card">
                <EmptyState
                  icon={ReceiptText}
                  title={
                    transactions.length === 0
                      ? `Nada lançado em ${monthLabel(month)}`
                      : 'Nenhum lançamento neste filtro'
                  }
                  description={
                    transactions.length === 0
                      ? 'Lance gastos e receitas, ou cadastre o salário e as contas fixas em Recorrentes para eles aparecerem todo mês.'
                      : undefined
                  }
                  action={
                    transactions.length === 0 ? (
                      <Button onClick={() => openNew()}>Lançar agora</Button>
                    ) : (
                      <Button variant="plain" onClick={() => setFilter('all')}>
                        Ver todos
                      </Button>
                    )
                  }
                />
              </div>
            ) : (
              // Entra com fade quando chegam os dados de outro mês (não a cada refetch).
              <div key={query.data?.month} className="animate-fade-in space-y-5">
                {query.data && showGoal && (
                  <Section
                    title="Investimento"
                    total={Math.max(
                      query.data.summary.savingsGoalCents,
                      query.data.summary.goalInvestedCents,
                    )}
                  >
                    <GoalRow month={month} data={query.data} onOpen={() => setGoalOpen(true)} />
                  </Section>
                )}
                {sectionDefs.map((section) => {
                  const items = visible.filter(section.match)
                  if (items.length === 0) return null
                  const total = items.reduce(
                    (sum, item) =>
                      sum +
                      (item.nature === 'planned'
                        ? plannedProgress(item, transactions).reservedCents
                        : item.amountCents),
                    0,
                  )
                  return (
                    <Section key={section.key} title={section.title} total={total}>
                      {items.map((item) => {
                        const progress =
                          item.nature === 'planned' ? plannedProgress(item, transactions) : null
                        const parent = item.parentPlannedId
                          ? byId.get(item.parentPlannedId)
                          : undefined
                        return (
                          <TransactionRow
                            key={item.id}
                            transaction={item}
                            category={
                              item.categoryId ? categoryById.get(item.categoryId) : undefined
                            }
                            payeeName={item.payeeId ? payeeById.get(item.payeeId) : undefined}
                            extraSubtitle={
                              progress && progress.spentCents > 0
                                ? `gasto ${formatBRL(progress.spentCents)} de ${formatBRL(progress.plannedCents)}`
                                : parent
                                  ? `em ${parent.description}`
                                  : undefined
                            }
                            onOpen={() =>
                              item.nature === 'carryover' ? setCarryoverOpen(item) : openEdit(item)
                            }
                            onToggleSettled={() => toggle(item)}
                            toggling={pendingId === item.id}
                          />
                        )
                      })}
                    </Section>
                  )
                })}
              </div>
            )}
          </SlideSwap>
        </div>
      </div>

      <NewCardSheet open={cardOpen} onClose={() => setCardOpen(false)} />
      <NewRecurringSheet kind={recurringKind} onClose={() => setRecurringKind(null)} />

      {query.data && (
        <CarryoverSheet
          month={month}
          transaction={carryoverOpen}
          carryover={query.data.carryover}
          onClose={() => setCarryoverOpen(null)}
        />
      )}

      {query.data && goalOpen && (
        <MonthGoalSheet
          month={month}
          data={query.data}
          open={goalOpen}
          onClose={() => setGoalOpen(false)}
        />
      )}
    </>
  )
}
