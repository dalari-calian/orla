import { balanceItemValue, isCompetenceMonth, periodReturn } from '@orla/core'
import { formatBRL } from '@orla/core/money'
import type { BalanceFormResponse, BalanceFormRow, SaveBalanceRequest } from '@orla/contracts'
import { CircleAlert, Lock, RotateCcw } from 'lucide-react'
import { useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router'
import { PageHeader } from '@/components/layout/PageHeader'
import { AnimatedMoney } from '@/components/ui/AnimatedMoney'
import { Button } from '@/components/ui/Button'
import { Card, CardHeader } from '@/components/ui/Card'
import { TextField } from '@/components/ui/Field'
import { MoneyInput } from '@/components/ui/MoneyInput'
import { ErrorState, Skeleton } from '@/components/ui/States'
import { useToast } from '@/components/ui/Toast'
import { monthLabel } from '@/features/finances/labels'
import { useAssetClasses } from '@/features/portfolio/api'
import { formatPercent } from '@/features/portfolio/labels'
import { accounts } from '@/features/registrations/api'
import { errorMessage } from '@/lib/api'
import { cn } from '@/lib/cn'
import { useBalanceForm, useBalanceMutations } from './api'
import { Signed } from './BalancePages'

interface RowState {
  quantity: string
  price: string
  value: number | null
  dy: string
  pvp: string
}

const keyOf = (row: BalanceFormRow) =>
  row.kind === 'cash' ? `cash:${row.accountId}` : (row.assetId ?? row.label)
const toText = (value: string | null) => (value === null ? '' : value.replace('.', ','))
/** "1.234,56" ou "9,73" → "1234.56" / "9.73"; inválido → null. */
function decimal(text: string): string | null {
  const trimmed = text.trim()
  const normalized = trimmed.includes(',') ? trimmed.replace(/\./g, '').replace(',', '.') : trimmed
  return /^\d+(\.\d+)?$/.test(normalized) ? normalized : null
}

function valueOf(row: BalanceFormRow, state: RowState): number | null {
  if (row.manualValue) return state.value
  const quantity = decimal(state.quantity)
  const price = decimal(state.price)
  return quantity && price ? balanceItemValue(quantity, price) : null
}

function Editor({ form, month }: { form: BalanceFormResponse; month: string }) {
  const navigate = useNavigate()
  const toast = useToast()
  const { create, save, close, reopen, remove } = useBalanceMutations()
  const classes = useAssetClasses()
  const accountList = accounts.useList()
  const balance = form.balance
  const readOnly = balance?.status === 'closed'
  const [date, setDate] = useState<string>(form.referenceDate)
  const [notes, setNotes] = useState(balance?.notes ?? '')
  const [state, setState] = useState<Record<string, RowState>>(() =>
    Object.fromEntries(
      form.rows.map((row) => [
        keyOf(row),
        {
          quantity: toText(row.quantity),
          price: toText(row.price),
          value: row.valueCents,
          dy: toText(row.dy),
          pvp: toText(row.pvp),
        },
      ]),
    ),
  )
  const update = (key: string, patch: Partial<RowState>) =>
    setState((current) => ({ ...current, [key]: { ...(current[key] as RowState), ...patch } }))

  const values = form.rows.map((row) => valueOf(row, state[keyOf(row)] as RowState))
  const total = values.reduce<number>((sum, value) => sum + (value ?? 0), 0)
  const missing = form.rows.filter(
    (row, index) => row.kind === 'asset' && values[index] === null,
  ).length
  const result = periodReturn({
    startValueCents: form.previous?.totalCents ?? null,
    endValueCents: total,
    flows: form.flows,
    startDate: form.previous?.referenceDate ?? null,
    endDate: date,
    timing: form.contributionTiming,
  })
  const classInfo = new Map((classes.data ?? []).map((item) => [item.id, item]))
  const accountInfo = new Map((accountList.data ?? []).map((item) => [item.id, item.name]))

  // Grupos: classe › corretora (saldo em conta no fim, por corretora).
  const groups = (() => {
    const map = new Map<string, { title: string; color: string; rows: BalanceFormRow[] }>()
    for (const row of form.rows) {
      const cls = row.assetClassId ? classInfo.get(row.assetClassId) : undefined
      const key = row.kind === 'cash' ? 'cash' : (row.assetClassId ?? 'other')
      const title = row.kind === 'cash' ? 'Saldo em conta' : (cls?.name ?? 'Outros')
      const group = map.get(key) ?? { title, color: cls?.color ?? 'var(--text-3)', rows: [] }
      group.rows.push(row)
      map.set(key, group)
    }
    return [...map.entries()]
  })()

  const groupTotal = (rows: BalanceFormRow[]) =>
    rows.reduce((sum, row) => sum + (valueOf(row, state[keyOf(row)] as RowState) ?? 0), 0)

  function request(): SaveBalanceRequest {
    return {
      competenceMonth: month,
      referenceDate: date,
      notes: notes.trim() || null,
      items: form.rows.flatMap((row): SaveBalanceRequest['items'] => {
        const current = state[keyOf(row)] as RowState
        const value = valueOf(row, current)
        if (value === null) return []
        if (row.kind === 'cash')
          return [{ kind: 'cash' as const, accountId: row.accountId, valueCents: value }]
        return [
          {
            kind: 'asset' as const,
            assetId: row.assetId,
            quantity: row.manualValue ? null : decimal(current.quantity),
            price: row.manualValue ? null : decimal(current.price),
            valueCents: value,
            dy: decimal(current.dy),
            pvp: decimal(current.pvp),
          },
        ]
      }),
    }
  }

  const busy = create.isPending || save.isPending || close.isPending
  async function persist(andClose: boolean) {
    try {
      const saved = balance
        ? await save.mutateAsync({ id: balance.id, ...request() })
        : await create.mutateAsync(request())
      if (andClose) await close.mutateAsync(saved.id)
      toast({ message: andClose ? 'Balanço fechado' : 'Rascunho salvo' })
      if (andClose) void navigate('/balanco')
    } catch (error) {
      toast({ message: errorMessage(error), tone: 'error' })
    }
  }

  const summary = (
    <Card className="space-y-3">
      <p className="text-subhead text-text-2">
        Patrimônio em {monthLabel(month).toLocaleLowerCase('pt-BR')}
      </p>
      <AnimatedMoney
        cents={total}
        className="block text-[34px] leading-tight font-semibold tracking-tight"
      />
      <dl className="space-y-1.5 text-subhead tabular">
        <div className="flex justify-between gap-3">
          <dt className="text-text-2">Balanço anterior</dt>
          <dd>{form.previous ? formatBRL(form.previous.totalCents) : '—'}</dd>
        </div>
        <div className="flex justify-between gap-3">
          <dt className="text-text-2">Diferença</dt>
          <dd>
            <Signed cents={form.previous ? total - form.previous.totalCents : null} />
          </dd>
        </div>
        <div className="flex justify-between gap-3">
          <dt className="text-text-2">Aportes do período</dt>
          <dd>{formatBRL(form.contributionsCents)}</dd>
        </div>
        <div className="flex justify-between gap-3 border-t border-separator pt-1.5 font-semibold">
          <dt>Ganho real</dt>
          <dd>
            <Signed cents={result.gainCents} rate={result.rate} />
          </dd>
        </div>
        {form.dividendsCents > 0 && result.gainCents !== null && (
          <p className="text-footnote text-text-2">
            {formatBRL(form.dividendsCents)} do período vieram de proventos.
          </p>
        )}
      </dl>
      {!form.previous && (
        <p className="text-footnote text-text-2">
          Primeiro balanço: a rentabilidade aparece a partir do próximo.
        </p>
      )}
      {groups.length > 1 && (
        <ul className="space-y-1 border-t border-separator pt-3 text-footnote tabular">
          {groups.map(([key, group]) => {
            const value = groupTotal(group.rows)
            return (
              <li key={key} className="flex items-center justify-between gap-2">
                <span className="flex min-w-0 items-center gap-2">
                  <span
                    className="size-2 shrink-0 rounded-full"
                    style={{ backgroundColor: group.color }}
                  />
                  <span className="truncate">{group.title}</span>
                </span>
                <span>
                  {formatBRL(value)}{' '}
                  <span className="text-text-2">
                    · {formatPercent(total > 0 ? value / total : null)}
                  </span>
                </span>
              </li>
            )
          })}
        </ul>
      )}
    </Card>
  )

  return (
    <>
      <PageHeader
        title={`Balanço de ${monthLabel(month)}`}
        subtitle={readOnly ? 'Fechado' : balance ? 'Rascunho' : 'Novo'}
        back={{ to: '/balanco', label: 'Balanço' }}
      />
      <div className="grid grid-cols-[minmax(0,1fr)] gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,22rem)] lg:items-start">
        <div className="space-y-5">
          <div className="lg:hidden">{summary}</div>
          <Card className="space-y-3">
            <TextField
              label="Data do balanço"
              type="date"
              value={date}
              disabled={readOnly}
              onChange={(event) => setDate(event.target.value)}
              onBlur={() => {
                if (date !== form.referenceDate)
                  void navigate(`/balanco/${month}?data=${date}`, { replace: true })
              }}
              hint="A quantidade de cada ativo é a da posição nessa data. Normalmente logo depois do aporte."
            />
          </Card>
          {groups.map(([key, group]) => (
            <Card key={key} className="p-0 md:p-0">
              <div className="flex items-center justify-between gap-3 px-4 pt-4 md:px-5 md:pt-5">
                <CardHeader title={group.title} className="mb-0" />
                <span className="pb-1 text-subhead text-text-2 tabular">
                  {formatBRL(groupTotal(group.rows))}
                </span>
              </div>
              <ul className="mt-2">
                {group.rows.map((row) => {
                  const key = keyOf(row)
                  const current = state[key] as RowState
                  const value = valueOf(row, current)
                  return (
                    <li key={key} className="space-y-2 border-t border-separator px-4 py-3 md:px-5">
                      <div className="flex items-baseline justify-between gap-3">
                        <span className="min-w-0">
                          <span className="block truncate text-body font-medium">{row.label}</span>
                          {row.kind === 'asset' && (
                            <span className="block truncate text-footnote text-text-2">
                              {row.ticker ? row.name : ''}
                              {row.accountId && accountInfo.get(row.accountId)
                                ? `${row.ticker ? ' · ' : ''}${accountInfo.get(row.accountId)}`
                                : ''}
                            </span>
                          )}
                        </span>
                        <span
                          className={cn(
                            'shrink-0 text-body font-semibold tabular',
                            value === null && 'text-text-3',
                          )}
                        >
                          {value === null ? 'a preencher' : formatBRL(value)}
                        </span>
                      </div>
                      {row.manualValue ? (
                        <div className="flex items-end gap-2">
                          <div className="min-w-0 flex-1">
                            <MoneyInput
                              label={row.kind === 'cash' ? 'Saldo parado na conta' : 'Saldo atual'}
                              value={current.value}
                              onChange={(next) => update(key, { value: next })}
                              hint={
                                row.previousValueCents !== null
                                  ? `Mês passado: ${formatBRL(row.previousValueCents)}`
                                  : undefined
                              }
                            />
                          </div>
                          {!readOnly &&
                            row.previousValueCents !== null &&
                            current.value === null && (
                              <Button
                                variant="secondary"
                                className="mb-6 shrink-0 px-3"
                                aria-label={`Repetir o valor do mês passado em ${row.label}`}
                                onClick={() => update(key, { value: row.previousValueCents })}
                              >
                                <RotateCcw className="size-4" aria-hidden />
                              </Button>
                            )}
                        </div>
                      ) : (
                        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                          <TextField
                            label="Quantidade"
                            inputMode="decimal"
                            disabled={readOnly}
                            value={current.quantity}
                            onChange={(event) => update(key, { quantity: event.target.value })}
                          />
                          <TextField
                            label="Preço (R$)"
                            inputMode="decimal"
                            disabled={readOnly}
                            value={current.price}
                            onChange={(event) => update(key, { price: event.target.value })}
                          />
                          <TextField
                            label="DY (%)"
                            inputMode="decimal"
                            placeholder="Opcional"
                            disabled={readOnly}
                            value={current.dy}
                            onChange={(event) => update(key, { dy: event.target.value })}
                          />
                          <TextField
                            label="P/VP"
                            inputMode="decimal"
                            placeholder="Opcional"
                            disabled={readOnly}
                            value={current.pvp}
                            onChange={(event) => update(key, { pvp: event.target.value })}
                          />
                        </div>
                      )}
                    </li>
                  )
                })}
              </ul>
            </Card>
          ))}
          <Card>
            <TextField
              label="Observação"
              value={notes}
              disabled={readOnly}
              placeholder="Opcional"
              onChange={(event) => setNotes(event.target.value)}
            />
          </Card>
        </div>
        <aside className="space-y-4 lg:sticky lg:top-6">
          <div className="hidden lg:block">{summary}</div>
          {missing > 0 && !readOnly && (
            <p className="flex items-start gap-2 rounded-field bg-warning/12 px-3 py-2 text-footnote">
              <CircleAlert className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden />
              {missing} {missing === 1 ? 'ativo sem valor fica' : 'ativos sem valor ficam'} fora do
              balanço.
            </p>
          )}
          {readOnly ? (
            <div className="flex flex-col gap-2">
              <p className="flex items-center gap-2 text-footnote text-text-2">
                <Lock className="size-4" aria-hidden /> Fechado: os valores e os aportes do período
                estão congelados.
              </p>
              <Button
                variant="secondary"
                block
                loading={reopen.isPending}
                onClick={() => {
                  if (
                    !window.confirm('Reabrir o balanço? Os meses seguintes vão ser recalculados.')
                  )
                    return
                  reopen.mutate(balance.id, {
                    onSuccess: () => toast({ message: 'Balanço reaberto' }),
                    onError: (error) => toast({ message: errorMessage(error), tone: 'error' }),
                  })
                }}
              >
                Reabrir para editar
              </Button>
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              <Button
                block
                loading={busy && close.isPending}
                disabled={busy}
                onClick={() => void persist(true)}
              >
                Fechar balanço
              </Button>
              <Button
                variant="secondary"
                block
                loading={busy && !close.isPending}
                disabled={busy}
                onClick={() => void persist(false)}
              >
                Salvar rascunho
              </Button>
            </div>
          )}
          {balance && (
            <Button
              variant="destructive"
              block
              loading={remove.isPending}
              onClick={() => {
                if (!window.confirm(`Excluir o balanço de ${monthLabel(month)}?`)) return
                remove.mutate(balance.id, {
                  onSuccess: () => {
                    toast({ message: 'Balanço excluído' })
                    void navigate('/balanco')
                  },
                })
              }}
            >
              Excluir balanço
            </Button>
          )}
        </aside>
      </div>
    </>
  )
}

/** /balanco/:mes — fazer/editar o balanço do mês (docs/07 §1, docs/10). */
export function BalanceFormPage() {
  const { mes = '' } = useParams()
  const [params] = useSearchParams()
  const date = params.get('data')
  const valid = isCompetenceMonth(mes)
  const query = useBalanceForm(mes, date, valid)
  const back = { to: '/balanco', label: 'Balanço' }
  if (!valid) {
    return (
      <>
        <PageHeader title="Balanço" back={back} />
        <Card>
          <ErrorState title="Mês inválido" description="Use o formato AAAA-MM, ex.: 2026-11." />
        </Card>
      </>
    )
  }
  if (query.isPending) {
    return (
      <>
        <PageHeader title={`Balanço de ${monthLabel(mes)}`} back={back} />
        <div className="space-y-5" aria-busy>
          <Skeleton className="h-40 rounded-card" />
          <Skeleton className="h-72 rounded-card" />
        </div>
      </>
    )
  }
  if (query.isError) {
    return (
      <>
        <PageHeader title={`Balanço de ${monthLabel(mes)}`} back={back} />
        <Card>
          <ErrorState
            description={errorMessage(query.error)}
            onRetry={() => void query.refetch()}
          />
        </Card>
      </>
    )
  }
  return (
    <Editor
      key={`${mes}:${query.data.referenceDate}:${query.data.balance?.updatedAt ?? 'new'}`}
      form={query.data}
      month={mes}
    />
  )
}
