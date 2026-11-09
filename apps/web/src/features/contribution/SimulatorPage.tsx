import {
  isTicker,
  normalizeTicker,
  resolveItem,
  simulate,
  suggestPlan,
  todayIsoDate,
  type ClassResult,
  type SimulationResult,
} from '@orla/core'
import { formatBRL } from '@orla/core/money'
import type { AssetClass, ContributionPlan, PortfolioResponse } from '@orla/contracts'
import {
  Check,
  CircleAlert,
  Minus,
  MoreHorizontal,
  Plus,
  ShoppingCart,
  Sparkles,
  Target,
} from 'lucide-react'
import { useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from 'react'
import { useNavigate, useParams } from 'react-router'
import { PageHeader } from '@/components/layout/PageHeader'
import { AnimatedMoney } from '@/components/ui/AnimatedMoney'
import { Button } from '@/components/ui/Button'
import { Card, CardHeader } from '@/components/ui/Card'
import { TextField } from '@/components/ui/Field'
import { MoneyInput } from '@/components/ui/MoneyInput'
import { ProgressBar } from '@/components/ui/Progress'
import { SegmentedControl } from '@/components/ui/SegmentedControl'
import { Sheet } from '@/components/ui/Sheet'
import { EmptyState, ErrorState, Skeleton } from '@/components/ui/States'
import { useToast } from '@/components/ui/Toast'
import { useMonth } from '@/features/finances/api'
import { monthLabel } from '@/features/finances/labels'
import { usePortfolio } from '@/features/portfolio/api'
import { formatPercent, formatPrice, formatQuantity } from '@/features/portfolio/labels'
import { errorMessage } from '@/lib/api'
import { cn } from '@/lib/cn'
import { usePlan, usePlanMutations } from './api'
import {
  assetKeyOf,
  decimalInput,
  defaultSplit,
  assignServerIds,
  draftFromPlan,
  newKey,
  planAssets,
  saveRequest,
  simClasses,
  simItems,
  toInputText,
  toSimAsset,
  toSuggestAsset,
  type Draft,
  type DraftItem,
  type PlanAsset,
} from './model'

const toneClass: Record<ClassResult['tone'], string> = {
  ok: 'bg-positive/14 text-positive',
  warn: 'bg-warning/16 text-warning',
  over: 'bg-negative/14 text-negative',
}

const pp = (value: number) => `${value > 0 ? '+' : ''}${value.toFixed(1).replace('.', ',')} p.p.`

function remainingText(cents: number): string {
  if (cents > 0) return `faltam ${formatBRL(cents)}`
  if (cents < 0) return `passou ${formatBRL(-cents)}`
  return 'no ponto'
}

// ─── Item ────────────────────────────────────────────────────────────────────

type ItemTarget = { item: DraftItem | null; classId: string }

function ItemSheetBody({
  target,
  assets,
  classRemaining,
  onSave,
  onRemove,
}: {
  target: ItemTarget
  assets: PlanAsset[]
  classRemaining: (classId: string) => number
  onSave: (item: DraftItem) => void
  onRemove: (key: string) => void
}) {
  const initial = target.item
  const classAssets = assets.filter((asset) => asset.classId === target.classId)
  const [assetKey, setAssetKey] = useState<string>(
    initial ? assetKeyOf(initial) : (classAssets[0]?.key ?? 'new'),
  )
  const existing = classAssets.find((asset) => asset.key === assetKey)
  const isNew = !existing || assetKey === 'new'
  const [ticker, setTicker] = useState(initial?.newAsset?.ticker ?? '')
  const [name, setName] = useState(initial?.newAsset?.name ?? '')
  const fractional = existing ? existing.fractional : !ticker.trim()
  const [mode, setMode] = useState<DraftItem['mode']>(initial?.mode ?? 'by_value')
  const [quantity, setQuantity] = useState(toInputText(initial?.quantity ?? '0'))
  const [price, setPrice] = useState(toInputText(initial?.unitPrice ?? existing?.price ?? '0'))
  const [value, setValue] = useState<number | null>(initial?.valueCents ?? null)
  const [error, setError] = useState<string | null>(null)
  const effectiveMode = fractional ? 'by_value' : mode

  const resolved = resolveItem({
    mode: effectiveMode,
    quantity: decimalInput(quantity),
    unitPrice: decimalInput(price),
    valueCents: value ?? 0,
    fractional,
  })
  const ownSpent = initial
    ? resolveItem({
        mode: initial.mode,
        quantity: initial.quantity,
        unitPrice: initial.unitPrice,
        valueCents: initial.valueCents,
        fractional,
      }).spentCents
    : 0
  const fillValue = Math.max(0, classRemaining(target.classId) + ownSpent)

  function pickAsset(key: string) {
    setAssetKey(key)
    const asset = classAssets.find((item) => item.key === key)
    if (asset?.price) setPrice(toInputText(asset.price))
  }

  function submit(event: FormEvent) {
    event.preventDefault()
    setError(null)
    if (isNew) {
      const cleanTicker = ticker.trim()
      if (cleanTicker && !isTicker(cleanTicker)) return setError('Ticker inválido (ex.: ITSA4)')
      if (!cleanTicker && !name.trim()) return setError('Informe o ticker ou o nome do ativo')
    }
    if (!fractional && decimalInput(price) === '0') return setError('Informe o preço')
    if (resolved.spentCents <= 0) return setError('Informe quanto vai comprar')
    const normalized = ticker.trim() ? normalizeTicker(ticker.trim()) : null
    onSave({
      key: initial?.key ?? newKey(),
      assetId: isNew ? null : (existing?.assetId ?? null),
      newAsset: isNew
        ? {
            ticker: normalized,
            name: name.trim() || normalized || '',
            assetClassId: target.classId,
          }
        : null,
      mode: effectiveMode,
      quantity: effectiveMode === 'by_quantity' ? decimalInput(quantity) : '0',
      unitPrice: fractional ? '0' : decimalInput(price),
      valueCents: effectiveMode === 'by_value' ? (value ?? 0) : resolved.spentCents,
      executed: false,
      id: initial?.id ?? null,
    })
  }

  return (
    <form noValidate className="space-y-4" onSubmit={submit}>
      <label className="block space-y-1.5">
        <span className="block px-1 text-footnote font-medium text-text-2">Ativo</span>
        <select
          className="min-h-12 w-full rounded-field bg-surface-2 px-4 text-body outline-none focus:ring-2 focus:ring-accent/60"
          value={isNew ? 'new' : assetKey}
          onChange={(event) => pickAsset(event.target.value)}
        >
          {classAssets
            .filter((asset) => !asset.isNew || asset.key === assetKey)
            .map((asset) => (
              <option key={asset.key} value={asset.key}>
                {asset.label}
                {asset.isNew ? ' (novo)' : ''}
              </option>
            ))}
          <option value="new">Ativo que ainda não tenho</option>
        </select>
      </label>
      {isNew && (
        <div className="grid grid-cols-2 gap-3">
          <TextField
            label="Ticker"
            placeholder="Ex.: BBAS3"
            value={ticker}
            onChange={(event) => setTicker(event.target.value)}
            hint="Vazio: renda fixa"
          />
          <TextField
            label="Nome"
            placeholder={ticker ? 'Opcional' : 'Ex.: CDB Nubank'}
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
        </div>
      )}
      {!fractional && (
        <SegmentedControl
          label="Comprar por"
          options={[
            { value: 'by_value', label: 'Valor em R$' },
            { value: 'by_quantity', label: 'Cotas' },
          ]}
          value={mode}
          onChange={setMode}
        />
      )}
      <div className="grid grid-cols-2 gap-3">
        {effectiveMode === 'by_value' ? (
          <MoneyInput
            label={fractional ? 'Valor a aplicar' : 'Quanto gastar'}
            value={value}
            onChange={setValue}
          />
        ) : (
          <TextField
            label="Cotas"
            inputMode="numeric"
            value={quantity}
            onChange={(event) => setQuantity(event.target.value)}
          />
        )}
        {!fractional && (
          <TextField
            label="Preço que vai pagar (R$)"
            inputMode="decimal"
            value={price}
            onChange={(event) => setPrice(event.target.value)}
          />
        )}
      </div>
      <p className="rounded-field bg-surface-2 px-3 py-2 text-subhead tabular">
        {fractional
          ? `Aplica ${formatBRL(resolved.spentCents)}`
          : `${formatQuantity(resolved.quantity.toString())} ${resolved.quantity.equals(1) ? 'cota' : 'cotas'} · ${formatBRL(resolved.spentCents)}`}
        {resolved.changeCents > 0 && (
          <span className="text-text-2"> · troco {formatBRL(resolved.changeCents)}</span>
        )}
      </p>
      {fillValue > 0 && (
        <Button
          variant="secondary"
          block
          onClick={() => {
            setMode('by_value')
            setValue(fillValue)
          }}
        >
          <Target className="size-4" aria-hidden /> Completar a classe ({formatBRL(fillValue)})
        </Button>
      )}
      {error && (
        <p role="alert" className="text-footnote text-negative">
          {error}
        </p>
      )}
      <div className="flex flex-col gap-2 pt-1">
        <Button type="submit" block>
          {initial ? 'Salvar' : 'Adicionar'}
        </Button>
        {initial && (
          <Button variant="destructive" block onClick={() => onRemove(initial.key)}>
            Tirar do carrinho
          </Button>
        )}
      </div>
    </form>
  )
}

// ─── Efetivar ────────────────────────────────────────────────────────────────

interface ExecuteRow {
  checked: boolean
  quantity: string
  price: string
  fees: number | null
  value: number | null
}

function ExecuteSheetBody({
  plan,
  draft,
  assets,
  sim,
  onDone,
}: {
  plan: ContributionPlan
  draft: Draft
  assets: PlanAsset[]
  sim: SimulationResult
  onDone: (allBought: boolean) => void
}) {
  const { execute } = usePlanMutations()
  const toast = useToast()
  const byKey = new Map(assets.map((asset) => [asset.key, asset]))
  const pending = draft.items.filter((item) => !item.executed)
  const [rows, setRows] = useState<Record<string, ExecuteRow>>(() =>
    Object.fromEntries(
      pending.map((item) => {
        const resolved = sim.items[item.key]
        return [
          item.key,
          {
            checked: true,
            quantity: toInputText(resolved?.quantity.toString() ?? '0'),
            price: toInputText(item.unitPrice),
            fees: null,
            value: resolved?.spentCents ?? item.valueCents,
          },
        ]
      }),
    ),
  )
  const [date, setDate] = useState<string>(todayIsoDate())
  const [register, setRegister] = useState(true)
  const fractionalOf = (item: DraftItem) => byKey.get(assetKeyOf(item))?.fractional ?? false
  const totalOf = (item: DraftItem, row: ExecuteRow) =>
    fractionalOf(item)
      ? (row.value ?? 0)
      : resolveItem({
          mode: 'by_quantity',
          quantity: decimalInput(row.quantity),
          unitPrice: decimalInput(row.price),
          valueCents: 0,
          fractional: false,
        }).spentCents + (row.fees ?? 0)
  const chosen = pending.filter((item) => rows[item.key]?.checked)
  const total = chosen.reduce((sum, item) => {
    const row = rows[item.key]
    return row ? sum + totalOf(item, row) : sum
  }, 0)
  const unsaved = chosen.some((item) => !item.id)
  const update = (key: string, patch: Partial<ExecuteRow>) =>
    setRows((current) => ({ ...current, [key]: { ...(current[key] as ExecuteRow), ...patch } }))

  async function submit(event: FormEvent) {
    event.preventDefault()
    const result = await execute.mutateAsync({
      id: plan.id,
      date,
      registerInvested: register,
      items: chosen.map((item) => {
        const row = rows[item.key] as ExecuteRow
        const fractional = fractionalOf(item)
        return fractional
          ? { itemId: item.id ?? '', quantity: '1', unitPrice: '0', totalCents: row.value ?? 0 }
          : {
              itemId: item.id ?? '',
              quantity: decimalInput(row.quantity),
              unitPrice: decimalInput(row.price),
              feesCents: row.fees ?? 0,
            }
      }),
    })
    toast({
      message:
        result.plan.status === 'executed'
          ? `Aporte de ${formatBRL(result.contribution.amountCents)} efetivado`
          : `${result.tradesCreated} ${result.tradesCreated === 1 ? 'compra registrada' : 'compras registradas'}`,
    })
    onDone(result.plan.status === 'executed')
  }

  return (
    <form
      noValidate
      className="space-y-4"
      onSubmit={(event) => void submit(event).catch(() => undefined)}
    >
      <p className="text-subhead text-text-2">
        Confirme o que comprou de verdade: quantidade e preço podem ser diferentes do simulado. Os
        itens não marcados continuam no carrinho.
      </p>
      <ul className="space-y-3">
        {pending.map((item) => {
          const asset = byKey.get(assetKeyOf(item))
          const row = rows[item.key]
          if (!asset || !row) return null
          return (
            <li key={item.key} className="space-y-2 rounded-field border border-separator p-3">
              <label className="flex cursor-pointer items-center gap-3">
                <input
                  type="checkbox"
                  className="size-5 accent-[var(--accent)]"
                  checked={row.checked}
                  onChange={(event) => update(item.key, { checked: event.target.checked })}
                />
                <span className="min-w-0 flex-1 truncate text-body font-medium">
                  {asset.label}
                  {asset.isNew && <span className="text-text-2"> · novo</span>}
                </span>
                <span className="text-subhead tabular">{formatBRL(totalOf(item, row))}</span>
              </label>
              {row.checked &&
                (asset.fractional ? (
                  <MoneyInput
                    label="Valor aplicado"
                    value={row.value}
                    onChange={(value) => update(item.key, { value })}
                  />
                ) : (
                  <div className="grid grid-cols-3 gap-2">
                    <TextField
                      label="Cotas"
                      inputMode="numeric"
                      value={row.quantity}
                      onChange={(event) => update(item.key, { quantity: event.target.value })}
                    />
                    <TextField
                      label="Preço (R$)"
                      inputMode="decimal"
                      value={row.price}
                      onChange={(event) => update(item.key, { price: event.target.value })}
                    />
                    <MoneyInput
                      label="Taxas"
                      value={row.fees}
                      onChange={(fees) => update(item.key, { fees })}
                    />
                  </div>
                ))}
            </li>
          )
        })}
      </ul>
      <TextField
        label="Data da compra"
        type="date"
        value={date}
        onChange={(event) => setDate(event.target.value)}
      />
      <label className="flex min-h-11 cursor-pointer items-center gap-3 rounded-field bg-surface-2 px-3 py-2 text-subhead">
        <input
          type="checkbox"
          className="size-5 accent-[var(--accent)]"
          checked={register}
          onChange={(event) => setRegister(event.target.checked)}
        />
        <span>
          Somar ao investido da meta de{' '}
          {monthLabel(plan.competenceMonth).toLocaleLowerCase('pt-BR')}
        </span>
      </label>
      {unsaved && (
        <p className="text-footnote text-warning">
          Salvando o carrinho... tente de novo em instantes.
        </p>
      )}
      {execute.error && (
        <p role="alert" className="text-footnote text-negative">
          {errorMessage(execute.error)}
        </p>
      )}
      <Button
        type="submit"
        block
        loading={execute.isPending}
        disabled={chosen.length === 0 || unsaved}
      >
        Comprei · {formatBRL(total)}
      </Button>
    </form>
  )
}

// ─── Antes × Depois × Meta ───────────────────────────────────────────────────

function Comparison({ classes, results }: { classes: AssetClass[]; results: ClassResult[] }) {
  const rows = results.filter((item) => item.beforeCents > 0 || item.afterCents > 0 || item.target)
  if (rows.length === 0) return null
  return (
    <Card className="space-y-4">
      <CardHeader title="Antes × depois × meta" />
      <ul className="space-y-4">
        {rows.map((result) => {
          const assetClass = classes.find((item) => item.id === result.id)
          const color = assetClass?.color ?? 'var(--accent)'
          return (
            <li key={result.id} className="space-y-1.5">
              <div className="flex items-baseline justify-between gap-2 text-subhead">
                <span className="flex min-w-0 items-center gap-2">
                  <span
                    className="size-2.5 shrink-0 rounded-full"
                    style={{ backgroundColor: color }}
                  />
                  <span className="truncate font-medium">{assetClass?.name}</span>
                </span>
                <span className="shrink-0 text-footnote text-text-2 tabular">
                  {formatPercent(result.weightBefore)} →{' '}
                  <span className="font-semibold text-text">
                    {formatPercent(result.weightAfter)}
                  </span>
                  {result.target !== null && ` · meta ${formatPercent(result.target)}`}
                </span>
              </div>
              <div className="relative space-y-1">
                <div className="h-1.5 overflow-hidden rounded-full bg-surface-2">
                  <div
                    className="h-full rounded-full bg-text-3 transition-[width] duration-500 ease-ios"
                    style={{ width: `${Math.min(100, result.weightBefore * 100)}%` }}
                  />
                </div>
                <div className="h-2.5 overflow-hidden rounded-full bg-surface-2">
                  <div
                    className="h-full rounded-full transition-[width] duration-500 ease-ios"
                    style={{
                      width: `${Math.min(100, result.weightAfter * 100)}%`,
                      backgroundColor: color,
                    }}
                  />
                </div>
                {result.target !== null && (
                  <span
                    aria-hidden
                    className="absolute -top-0.5 -bottom-0.5 w-0.5 rounded-full bg-text"
                    style={{ left: `${Math.min(100, result.target * 100)}%` }}
                  />
                )}
              </div>
              {result.deviationAfterPp !== null && Math.abs(result.deviationAfterPp) >= 0.05 && (
                <p className="text-caption text-text-2">
                  Depois do aporte: {pp(result.deviationAfterPp)} da meta
                </p>
              )}
            </li>
          )
        })}
      </ul>
      <p className="flex flex-wrap gap-x-4 gap-y-1 text-caption text-text-2">
        <span className="flex items-center gap-1.5">
          <span className="h-1.5 w-4 rounded-full bg-text-3" /> antes
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-4 rounded-full bg-accent" /> depois
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-3 w-0.5 rounded-full bg-text" /> meta
        </span>
      </p>
    </Card>
  )
}

// ─── Editor ──────────────────────────────────────────────────────────────────

function Section({
  title,
  children,
  action,
}: {
  title: string
  children: ReactNode
  action?: ReactNode
}) {
  return (
    <Card className="space-y-3">
      <CardHeader title={title} action={action} />
      {children}
    </Card>
  )
}

function Editor({
  plan,
  portfolio,
  goalCents,
}: {
  plan: ContributionPlan
  portfolio: PortfolioResponse
  goalCents: number | null
}) {
  const { save, remove } = usePlanMutations()
  const toast = useToast()
  const navigate = useNavigate()
  const [draft, setDraft] = useState<Draft>(() => draftFromPlan(plan))
  const [itemTarget, setItemTarget] = useState<ItemTarget | null>(null)
  const [executing, setExecuting] = useState(false)
  const [options, setOptions] = useState(false)
  const [openClass, setOpenClass] = useState<string | null>(null)
  const readOnly = plan.status !== 'draft'
  const classes = portfolio.classes.map((item) => item.assetClass)

  // Autosave (RA-30): 700 ms depois da última mudança; sai da tela → salva na hora.
  const dirty = useRef(false)
  const latest = useRef({ plan, draft })
  useEffect(() => {
    latest.current = { plan, draft }
  })
  const flush = async (): Promise<boolean> => {
    if (!dirty.current || readOnly) return true
    dirty.current = false
    const { plan: current, draft: value } = latest.current
    try {
      const saved = await save.mutateAsync({ id: current.id, ...saveRequest(current, value) })
      // Cada item local ganha o id que o servidor deu (precisa para efetivar).
      setDraft((now) => assignServerIds(now, saved))
      return true
    } catch (error) {
      dirty.current = true
      toast({ message: errorMessage(error), tone: 'error' })
      return false
    }
  }
  const flushRef = useRef(flush)
  useEffect(() => {
    flushRef.current = flush
  })
  async function openExecute() {
    if (await flush()) setExecuting(true)
  }
  useEffect(() => {
    if (!dirty.current) return
    const timer = setTimeout(() => void flushRef.current(), 700)
    return () => clearTimeout(timer)
  }, [draft])
  useEffect(() => () => void flushRef.current(), [])

  const change = (next: (current: Draft) => Draft) => {
    if (readOnly) return
    dirty.current = true
    setDraft(next)
  }

  const assets = useMemo(() => planAssets(portfolio, draft.items), [portfolio, draft.items])
  const sim = useMemo(
    () =>
      simulate({
        totalCents: draft.totalCents,
        split: Object.fromEntries(
          Object.entries(draft.split).map(([id, value]) => [id, decimalInput(value)]),
        ),
        classes: simClasses(portfolio),
        assets: assets.map(toSimAsset),
        items: simItems(draft.items, assets),
      }),
    [draft, assets, portfolio],
  )
  const classResult = (id: string) => sim.classes.find((item) => item.id === id)
  const assetResult = (key: string) => sim.assets.find((item) => item.key === key)
  const byKey = new Map(assets.map((asset) => [asset.key, asset]))
  const pendingCount = draft.items.filter((item) => !item.executed).length
  const alerts = sim.assets.flatMap((item) => item.alerts)

  function rebalance() {
    const pending = draft.items.filter((item) => !item.executed)
    if (pending.length > 0 && !window.confirm('Substituir os itens do carrinho pela sugestão?'))
      return
    const suggestion = suggestPlan(
      draft.totalCents,
      simClasses(portfolio),
      assets.filter((asset) => !asset.isNew).map(toSuggestAsset),
    )
    change((current) => ({
      ...current,
      split: suggestion.split,
      items: [
        ...current.items.filter((item) => item.executed),
        ...suggestion.items.map((item) => ({
          key: newKey(),
          assetId: byKey.get(item.assetKey)?.assetId ?? null,
          newAsset: null,
          mode: item.mode,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          valueCents: item.valueCents,
          executed: false,
          id: null,
        })),
      ],
    }))
    toast({
      message:
        suggestion.items.length > 0
          ? 'Sugestão aplicada: ajuste o que quiser'
          : 'Sem ativos com preço para sugerir compras; a divisão foi ajustada',
    })
  }

  function step(item: DraftItem, delta: number) {
    const resolved = sim.items[item.key]
    const quantity = Math.max(0, Number(resolved?.quantity.toString() ?? 0) + delta)
    change((current) => ({
      ...current,
      items: current.items.map((entry) =>
        entry.key === item.key
          ? {
              ...entry,
              mode: 'by_quantity',
              quantity: String(quantity),
              valueCents: resolveItem({
                mode: 'by_quantity',
                quantity,
                unitPrice: entry.unitPrice,
                valueCents: 0,
                fractional: false,
              }).spentCents,
            }
          : entry,
      ),
    }))
  }

  const header = (
    <PageHeader
      title={draft.name || plan.name}
      subtitle={`${monthLabel(plan.competenceMonth)}${plan.isPrimary ? ' · principal' : ''}${
        readOnly ? ' · efetivada' : save.isPending ? ' · salvando...' : ''
      }`}
      back={{ to: '/aporte', label: 'Aporte' }}
      actions={
        !readOnly && (
          <Button
            variant="plain"
            className="px-3"
            aria-label="Opções da simulação"
            onClick={() => setOptions(true)}
          >
            <MoreHorizontal className="size-5" aria-hidden />
          </Button>
        )
      }
    />
  )

  const totalCard = (
    <Card className="space-y-4">
      <MoneyInput
        label="Valor do aporte"
        value={draft.totalCents}
        onChange={(value) => change((current) => ({ ...current, totalCents: value ?? 0 }))}
        large
      />
      {goalCents !== null && goalCents > 0 && goalCents !== draft.totalCents && !readOnly && (
        <button
          type="button"
          onClick={() => change((current) => ({ ...current, totalCents: goalCents }))}
          className="press rounded-full bg-accent/12 px-3 py-1.5 text-footnote font-semibold text-accent"
        >
          Usar meta do mês · {formatBRL(goalCents)}
        </button>
      )}
    </Card>
  )

  const splitCard = (
    <Section
      title="Divisão por classe"
      action={
        !readOnly && (
          <Button variant="plain" className="px-2" onClick={rebalance}>
            <Sparkles className="size-4" aria-hidden /> Rebalancear
          </Button>
        )
      }
    >
      <ul className="space-y-2">
        {classes.map((assetClass) => {
          const result = classResult(assetClass.id)
          return (
            <li
              key={assetClass.id}
              className="grid grid-cols-[minmax(0,1fr)_5.5rem_6.5rem] items-center gap-2"
            >
              <span className="flex min-w-0 items-center gap-2 text-body">
                <span
                  className="size-2.5 shrink-0 rounded-full"
                  style={{ backgroundColor: assetClass.color }}
                />
                <span className="truncate">{assetClass.name}</span>
              </span>
              <label className="relative">
                <span className="sr-only">% de {assetClass.name}</span>
                <input
                  inputMode="decimal"
                  disabled={readOnly}
                  className="min-h-11 w-full rounded-field bg-surface-2 py-2 pr-7 pl-3 text-right text-body tabular outline-none focus:ring-2 focus:ring-accent/60 disabled:opacity-60"
                  value={toInputText(draft.split[assetClass.id] ?? '0')}
                  placeholder="0"
                  onChange={(event) =>
                    change((current) => ({
                      ...current,
                      split: {
                        ...current.split,
                        [assetClass.id]: event.target.value.replace(',', '.'),
                      },
                    }))
                  }
                />
                <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-text-2">
                  %
                </span>
              </label>
              <span className="text-right text-subhead text-text-2 tabular">
                {formatBRL(result?.allottedCents ?? 0)}
              </span>
            </li>
          )
        })}
      </ul>
      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-separator pt-3 text-footnote">
        <span className={cn('tabular', sim.split.valid ? 'text-positive' : 'text-negative')}>
          {sim.split.valid
            ? 'Soma 100%'
            : `Soma ${sim.split.totalPct.toString().replace('.', ',')}%: precisa dar 100%`}
        </span>
        {!readOnly && (
          <button
            type="button"
            className="font-semibold text-accent"
            onClick={() => change((current) => ({ ...current, split: defaultSplit(classes) }))}
          >
            Usar as metas
          </button>
        )}
      </div>
    </Section>
  )

  const remainingCard = (
    <Card className="space-y-3">
      <p className="text-subhead text-text-2">
        {sim.remainingCents >= 0
          ? `Dos ${formatBRL(draft.totalCents)}, restam`
          : 'Passou do aporte em'}
      </p>
      <AnimatedMoney
        cents={Math.abs(sim.remainingCents)}
        className={cn(
          'block text-[34px] leading-tight font-semibold tracking-tight',
          sim.remainingCents < 0 && 'text-negative',
        )}
      />
      <ProgressBar
        value={draft.totalCents > 0 ? sim.spentCents / draft.totalCents : 0}
        tone={
          sim.remainingCents < 0 ? 'negative' : sim.remainingCents === 0 ? 'positive' : 'accent'
        }
        label="Quanto do aporte já está no carrinho"
      />
      <p className="text-footnote text-text-2 tabular">
        No carrinho {formatBRL(sim.spentCents)}
        {sim.changeCents > 0 && ` · troco das cotas ${formatBRL(sim.changeCents)}`} · carteira{' '}
        {formatBRL(sim.patrimonyBeforeCents)} → {formatBRL(sim.patrimonyAfterCents)}
      </p>
    </Card>
  )

  const classCards = classes.map((assetClass) => {
    const result = classResult(assetClass.id)
    if (!result) return null
    const items = draft.items.filter(
      (item) => byKey.get(assetKeyOf(item))?.classId === assetClass.id,
    )
    if (result.allottedCents === 0 && items.length === 0 && readOnly) return null
    const open =
      openClass === null
        ? items.length > 0 || result.allottedCents > 0
        : openClass === assetClass.id
    return (
      <Card key={assetClass.id} className="p-0 md:p-0">
        <button
          type="button"
          onClick={() => setOpenClass(open && openClass === assetClass.id ? '' : assetClass.id)}
          className="flex w-full items-center gap-3 px-4 py-3 text-left md:px-5"
          aria-expanded={open}
        >
          <span
            className="size-2.5 shrink-0 rounded-full"
            style={{ backgroundColor: assetClass.color }}
          />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-headline font-semibold">{assetClass.name}</span>
            <span className="block text-footnote text-text-2 tabular">
              {formatBRL(result.allottedCents)} · gasto {formatBRL(result.spentCents)}
            </span>
          </span>
          <span
            className={cn(
              'shrink-0 rounded-full px-2.5 py-1 text-caption font-semibold tabular',
              toneClass[result.tone],
            )}
          >
            {remainingText(result.remainingCents)}
          </span>
        </button>
        {open && (
          <div className="border-t border-separator">
            {items.length > 0 && (
              <ul>
                {items.map((item) => {
                  const asset = byKey.get(assetKeyOf(item))
                  const resolved = sim.items[item.key]
                  const weights = assetResult(assetKeyOf(item))
                  if (!asset || !resolved) return null
                  return (
                    <li key={item.key} className="border-b border-separator last:border-b-0">
                      <div className="flex items-center gap-2 px-4 py-2.5 md:px-5">
                        <button
                          type="button"
                          disabled={readOnly || item.executed}
                          onClick={() => setItemTarget({ item, classId: assetClass.id })}
                          className="min-w-0 flex-1 text-left disabled:cursor-default"
                        >
                          <span className="flex items-center gap-1.5 text-body">
                            {item.executed && (
                              <Check
                                className="size-4 shrink-0 text-positive"
                                aria-label="Comprado"
                              />
                            )}
                            <span className="truncate font-medium">{asset.label}</span>
                            {asset.isNew && <span className="text-footnote text-text-2">novo</span>}
                          </span>
                          <span className="block truncate text-footnote text-text-2 tabular">
                            {asset.fractional
                              ? formatBRL(resolved.spentCents)
                              : `${formatQuantity(resolved.quantity.toString())} × ${formatPrice(item.unitPrice)} = ${formatBRL(resolved.spentCents)}`}
                            {weights &&
                              ` · ${formatPercent(weights.weightBefore)} → ${formatPercent(weights.weightAfter)}`}
                          </span>
                        </button>
                        {!readOnly && !item.executed && !asset.fractional && (
                          <span className="flex shrink-0 items-center">
                            <button
                              type="button"
                              aria-label={`Menos uma cota de ${asset.label}`}
                              onClick={() => step(item, -1)}
                              className="press flex size-11 items-center justify-center rounded-full text-text-2 hover:bg-surface-2"
                            >
                              <Minus className="size-4" aria-hidden />
                            </button>
                            <button
                              type="button"
                              aria-label={`Mais uma cota de ${asset.label}`}
                              onClick={() => step(item, 1)}
                              className="press flex size-11 items-center justify-center rounded-full text-accent hover:bg-accent/10"
                            >
                              <Plus className="size-4" aria-hidden />
                            </button>
                          </span>
                        )}
                      </div>
                      {weights?.alerts.map((alert) => (
                        <p
                          key={alert}
                          className="flex items-start gap-1.5 px-4 pb-2 text-footnote text-warning md:px-5"
                        >
                          <CircleAlert className="mt-0.5 size-3.5 shrink-0" aria-hidden />
                          {alert}
                        </p>
                      ))}
                    </li>
                  )
                })}
              </ul>
            )}
            {!readOnly && (
              <button
                type="button"
                onClick={() => setItemTarget({ item: null, classId: assetClass.id })}
                className="flex min-h-12 w-full items-center gap-2 px-4 text-subhead font-semibold text-accent hover:bg-accent/5 md:px-5"
              >
                <Plus className="size-4" aria-hidden /> Adicionar ativo
              </button>
            )}
          </div>
        )}
      </Card>
    )
  })

  return (
    <>
      {header}
      <div className="grid grid-cols-[minmax(0,1fr)] gap-5 pb-24 lg:grid-cols-[minmax(0,1fr)_minmax(0,22rem)] lg:items-start lg:pb-0">
        <div className="space-y-5">
          {totalCard}
          {splitCard}
          <div className="lg:hidden">{remainingCard}</div>
          {classes.length === 0 ? (
            <Card>
              <EmptyState
                icon={ShoppingCart}
                title="Sem classes de ativo"
                description="Crie as classes e metas em Configurações › Metas."
              />
            </Card>
          ) : (
            classCards
          )}
          {alerts.length > 0 && (
            <Card className="space-y-1.5 bg-warning/10">
              {alerts.map((alert) => (
                <p key={alert} className="flex items-start gap-2 text-footnote">
                  <CircleAlert className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden />
                  {alert}
                </p>
              ))}
            </Card>
          )}
          <div className="lg:hidden">
            <Comparison classes={classes} results={sim.classes} />
          </div>
        </div>
        <aside className="hidden space-y-5 lg:sticky lg:top-6 lg:block">
          {remainingCard}
          <Comparison classes={classes} results={sim.classes} />
          {!readOnly && (
            <Button block disabled={pendingCount === 0} onClick={() => void openExecute()}>
              <ShoppingCart className="size-5" aria-hidden /> Efetivar compras
            </Button>
          )}
        </aside>
      </div>

      {!readOnly && (
        <div className="fixed inset-x-0 bottom-[calc(76px+env(safe-area-inset-bottom))] z-30 px-4 lg:hidden">
          <div className="mx-auto flex max-w-[600px] items-center gap-3 rounded-card bg-surface/95 p-2 pl-4 shadow-[0_8px_24px_-6px_rgb(0_0_0/0.25)] backdrop-blur">
            <span className="min-w-0 flex-1 text-footnote text-text-2 tabular">
              <span
                className={cn(
                  'block text-subhead font-semibold',
                  sim.remainingCents < 0 ? 'text-negative' : 'text-text',
                )}
              >
                {sim.remainingCents >= 0
                  ? `Restam ${formatBRL(sim.remainingCents)}`
                  : `Passou ${formatBRL(-sim.remainingCents)}`}
              </span>
              {save.isPending ? 'Salvando...' : 'Salvo'}
            </span>
            <Button disabled={pendingCount === 0} onClick={() => void openExecute()}>
              Efetivar
            </Button>
          </div>
        </div>
      )}

      <Sheet
        open={itemTarget !== null}
        onClose={() => setItemTarget(null)}
        title={itemTarget?.item ? 'Item do aporte' : 'Adicionar ao aporte'}
      >
        {itemTarget && (
          <ItemSheetBody
            key={itemTarget.item?.key ?? `new-${itemTarget.classId}`}
            target={itemTarget}
            assets={assets}
            classRemaining={(classId) => classResult(classId)?.remainingCents ?? 0}
            onSave={(saved) => {
              change((current) => ({
                ...current,
                items: current.items.some((item) => item.key === saved.key)
                  ? current.items.map((item) => (item.key === saved.key ? saved : item))
                  : [...current.items, saved],
              }))
              setItemTarget(null)
            }}
            onRemove={(key) => {
              change((current) => ({
                ...current,
                items: current.items.filter((item) => item.key !== key),
              }))
              setItemTarget(null)
            }}
          />
        )}
      </Sheet>

      <Sheet open={executing} onClose={() => setExecuting(false)} title="Efetivar compras">
        {executing && (
          <ExecuteSheetBody
            plan={plan}
            draft={draft}
            assets={assets}
            sim={sim}
            onDone={(allBought) => {
              setExecuting(false)
              if (allBought) void navigate('/aporte')
            }}
          />
        )}
      </Sheet>

      <Sheet open={options} onClose={() => setOptions(false)} title="Simulação">
        {options && (
          <div className="space-y-4">
            <TextField
              label="Nome"
              value={draft.name}
              maxLength={60}
              onChange={(event) => change((current) => ({ ...current, name: event.target.value }))}
            />
            {!plan.isPrimary && (
              <Button
                variant="secondary"
                block
                loading={save.isPending}
                onClick={() => {
                  dirty.current = false
                  save.mutate(
                    { id: plan.id, ...saveRequest(plan, draft, { isPrimary: true }) },
                    {
                      onSuccess: (saved) => {
                        setDraft((now) => assignServerIds(now, saved))
                        toast({ message: 'Agora é a simulação principal do mês' })
                        setOptions(false)
                      },
                    },
                  )
                }}
              >
                Tornar a principal do mês
              </Button>
            )}
            <Button
              variant="destructive"
              block
              loading={remove.isPending}
              disabled={draft.items.some((item) => item.executed)}
              onClick={() => {
                if (!window.confirm('Excluir esta simulação?')) return
                dirty.current = false
                remove.mutate(plan.id, {
                  onSuccess: () => {
                    toast({ message: 'Simulação excluída' })
                    void navigate('/aporte')
                  },
                  onError: (error) => toast({ message: errorMessage(error), tone: 'error' }),
                })
              }}
            >
              Excluir simulação
            </Button>
            {draft.items.some((item) => item.executed) && (
              <p className="text-footnote text-text-2">
                Já tem compras efetivadas: não dá para excluir. Elas ficam na carteira.
              </p>
            )}
          </div>
        )}
      </Sheet>
    </>
  )
}

/** /aporte/:planId — simulador (docs/06, docs/10 › Aporte). */
export function SimulatorPage() {
  const { planId = '' } = useParams()
  const plan = usePlan(planId)
  const portfolio = usePortfolio()
  const month = useMonth(plan.data?.competenceMonth ?? '', Boolean(plan.data))
  const back = { to: '/aporte', label: 'Aporte' }

  if (plan.isPending || portfolio.isPending) {
    return (
      <>
        <PageHeader title="Simulação" back={back} />
        <div className="space-y-5" aria-busy>
          <Skeleton className="h-32 rounded-card" />
          <Skeleton className="h-56 rounded-card" />
          <Skeleton className="h-40 rounded-card" />
        </div>
      </>
    )
  }
  if (plan.isError || portfolio.isError) {
    const error = plan.error ?? portfolio.error
    return (
      <>
        <PageHeader title="Simulação" back={back} />
        <Card>
          <ErrorState
            title="Não foi possível abrir a simulação"
            description={errorMessage(error)}
            onRetry={() => {
              void plan.refetch()
              void portfolio.refetch()
            }}
          />
        </Card>
      </>
    )
  }
  const summary = month.data?.summary
  const goal = summary ? Math.max(summary.goalRemainingCents, 0) || summary.savingsGoalCents : null
  const bought = plan.data.items.filter((item) => item.executedAt).length
  return (
    <Editor
      key={`${plan.data.id}:${plan.data.status}:${bought}`}
      plan={plan.data}
      portfolio={portfolio.data}
      goalCents={goal}
    />
  )
}
