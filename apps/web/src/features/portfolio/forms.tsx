import { todayIsoDate, tradeTotalCents } from '@orla/core'
import { formatBRL } from '@orla/core/money'
import type {
  Account,
  Asset,
  AssetClass,
  AssetTrade,
  CreateAssetRequest,
  CreateAssetTradeRequest,
  CreateDividendRequest,
  Dividend,
  FixedIncomeInfo,
  Position,
  TradeKindValue,
} from '@orla/contracts'
import { useMemo, useState, type FormEvent, type ReactNode } from 'react'
import { Button } from '@/components/ui/Button'
import { TextField } from '@/components/ui/Field'
import { MoneyInput } from '@/components/ui/MoneyInput'
import { SelectField } from '@/components/ui/Select'
import { errorMessage } from '@/lib/api'
import { cn } from '@/lib/cn'
import { useTickerSearch } from './api'
import { assetLabel, dividendKindLabels, formatPrice, tradeKindLabels } from './labels'

function FormError({ error }: { error: unknown }) {
  if (!error) return null
  return (
    <p role="alert" className="text-footnote text-negative">
      {errorMessage(error)}
    </p>
  )
}

function Actions({ children }: { children: ReactNode }) {
  return <div className="flex flex-col gap-2 pt-2">{children}</div>
}

const decimalText = (value: string) => value.replace(/[^\d.,]/g, '').replace(',', '.')
const isDecimal = (value: string) => /^\d+(\.\d+)?$/.test(value)

// ─── Ativo ───────────────────────────────────────────────────────────────────

const INDEXERS = ['CDI', 'IPCA', 'SELIC', 'PRE', 'OTHER'] as const

/** Posição já existente, informada no cadastro (vira um "Ajuste de posição" na data). */
export interface StartingPosition {
  tradeDate: string
  quantity: string
  unitPrice: string
  totalCents?: number
}

/** Cadastro/edição de ativo (RC-10/11): ticker com autocomplete ou renda fixa com nome livre. */
export function AssetForm({
  initial,
  classes,
  accounts,
  submitting,
  error,
  onSubmit,
  extra,
}: {
  initial?: Asset | undefined
  classes: AssetClass[]
  accounts: Account[]
  submitting: boolean
  error: unknown
  onSubmit: (values: CreateAssetRequest, position: StartingPosition | null) => Promise<unknown>
  extra?: ReactNode
}) {
  const [startQty, setStartQty] = useState('')
  const [startPrice, setStartPrice] = useState('')
  const [startValue, setStartValue] = useState<number | null>(null)
  const [currentPrice, setCurrentPrice] = useState('')
  const [currentValue, setCurrentValue] = useState<number | null>(null)
  const [startDate, setStartDate] = useState<string>(todayIsoDate())
  const [classId, setClassId] = useState(initial?.assetClassId ?? classes[0]?.id ?? '')
  const assetClass = classes.find((item) => item.id === classId)
  const fixedIncome = assetClass?.kind === 'fixed_income'
  const [ticker, setTicker] = useState(initial?.ticker ?? '')
  const [name, setName] = useState(initial?.name ?? '')
  const [accountId, setAccountId] = useState(initial?.accountId ?? '')
  const [info, setInfo] = useState<FixedIncomeInfo>(
    initial?.fixedIncomeInfo ?? { indexer: 'CDI', rate: null, maturity: null, liquidity: 'daily' },
  )
  const [targetWeight, setTargetWeight] = useState(initial?.targetWeightPct ?? '')
  const [maxWeight, setMaxWeight] = useState(initial?.maxWeightPct ?? '')
  const [focused, setFocused] = useState(false)
  const [localError, setLocalError] = useState<string | null>(null)
  const search = useTickerSearch(focused && !initial ? ticker : '')
  const suggestions = search.data?.results ?? []

  function submit(event: FormEvent) {
    event.preventDefault()
    setLocalError(null)
    if (!fixedIncome && !ticker.trim() && !name.trim()) return setLocalError('Informe o ticker')
    if (fixedIncome && !name.trim()) return setLocalError('Dê um nome (ex.: Tesouro Selic 2031)')
    for (const value of [targetWeight, maxWeight]) {
      if (value && (!isDecimal(decimalText(value)) || Number(decimalText(value)) > 100)) {
        return setLocalError('Pesos são percentuais de 0 a 100')
      }
    }
    let position: StartingPosition | null = null
    if (!initial && fixedIncome && startValue) {
      position = { tradeDate: startDate, quantity: '1', unitPrice: '0', totalCents: startValue }
    } else if (!initial && !fixedIncome && (startQty.trim() || startPrice.trim())) {
      const q = decimalText(startQty)
      const p = decimalText(startPrice)
      if (!isDecimal(q) || Number(q) <= 0) return setLocalError('Informe a quantidade que você tem')
      if (!isDecimal(p) || Number(p) <= 0) return setLocalError('Informe o preço médio')
      position = { tradeDate: startDate, quantity: q, unitPrice: p }
    }
    const nowPrice = decimalText(currentPrice)
    if (
      !initial &&
      !fixedIncome &&
      currentPrice.trim() &&
      (!isDecimal(nowPrice) || Number(nowPrice) <= 0)
    )
      return setLocalError('Preço atual inválido')
    void onSubmit(
      {
        assetClassId: classId,
        ticker: fixedIncome ? null : ticker.trim() || null,
        name: name.trim() || undefined,
        accountId: accountId || null,
        fixedIncomeInfo: fixedIncome ? info : null,
        targetWeightPct: targetWeight ? decimalText(targetWeight) : null,
        maxWeightPct: maxWeight ? decimalText(maxWeight) : null,
        ...(!initial && !fixedIncome && currentPrice.trim() && { manualPrice: nowPrice }),
        ...(!initial && fixedIncome && currentValue !== null && { manualValueCents: currentValue }),
      },
      position,
    )
  }

  return (
    <form noValidate className="space-y-4" onSubmit={submit}>
      <SelectField
        label="Classe"
        value={classId}
        onChange={(event) => setClassId(event.target.value)}
      >
        {classes.map((item) => (
          <option key={item.id} value={item.id}>
            {item.name}
          </option>
        ))}
      </SelectField>
      {!fixedIncome && (
        <div className="relative">
          <TextField
            label="Ticker"
            placeholder="Ex.: ITSA4, MXRF11"
            value={ticker}
            disabled={Boolean(initial)}
            autoCapitalize="characters"
            autoComplete="off"
            onFocus={() => setFocused(true)}
            onBlur={() => setTimeout(() => setFocused(false), 150)}
            onChange={(event) => setTicker(event.target.value.toUpperCase().replace(/\s/g, ''))}
            hint={
              initial
                ? 'O ticker não muda depois de cadastrado.'
                : search.data && !search.data.providerAvailable
                  ? 'Sem lista de tickers (cotações desligadas): confira o código.'
                  : undefined
            }
          />
          {focused && suggestions.length > 0 && (
            <ul className="absolute inset-x-0 top-full z-20 mt-1 max-h-60 overflow-y-auto rounded-field bg-surface p-1 shadow-[0_12px_32px_-8px_rgb(0_0_0/0.3)]">
              {suggestions.map((item) => (
                <li key={item.ticker}>
                  <button
                    type="button"
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => {
                      setTicker(item.ticker)
                      if (!name) setName(item.name ?? '')
                      setFocused(false)
                    }}
                    className="flex min-h-11 w-full items-center gap-3 rounded-[10px] px-3 text-left hover:bg-surface-2"
                  >
                    <span className="font-semibold">{item.ticker}</span>
                    <span className="truncate text-footnote text-text-2">{item.name}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
      <TextField
        label={fixedIncome ? 'Nome' : 'Nome (opcional)'}
        placeholder={
          fixedIncome ? 'Ex.: Tesouro Selic 2031, CDB Nubank 100% CDI' : 'Vem do provedor'
        }
        value={name}
        onChange={(event) => setName(event.target.value)}
        autoComplete="off"
      />
      <SelectField
        label="Corretora / banco"
        value={accountId}
        onChange={(event) => setAccountId(event.target.value)}
      >
        <option value="">Não informar</option>
        {accounts.map((account) => (
          <option key={account.id} value={account.id}>
            {account.name}
          </option>
        ))}
      </SelectField>
      {fixedIncome && (
        <div className="grid grid-cols-2 gap-3">
          <SelectField
            label="Indexador"
            value={info.indexer ?? 'CDI'}
            onChange={(event) =>
              setInfo({ ...info, indexer: event.target.value as FixedIncomeInfo['indexer'] })
            }
          >
            {INDEXERS.map((item) => (
              <option key={item} value={item}>
                {item === 'PRE' ? 'Prefixado' : item === 'OTHER' ? 'Outro' : item}
              </option>
            ))}
          </SelectField>
          <TextField
            label="Taxa"
            placeholder="Ex.: 100% CDI"
            value={info.rate ?? ''}
            onChange={(event) => setInfo({ ...info, rate: event.target.value || null })}
          />
          <TextField
            label="Vencimento"
            type="date"
            value={info.maturity ?? ''}
            onChange={(event) => setInfo({ ...info, maturity: event.target.value || null })}
          />
          <SelectField
            label="Liquidez"
            value={info.liquidity ?? 'daily'}
            onChange={(event) =>
              setInfo({ ...info, liquidity: event.target.value as FixedIncomeInfo['liquidity'] })
            }
          >
            <option value="daily">Diária</option>
            <option value="at_maturity">No vencimento</option>
          </SelectField>
        </div>
      )}
      <div className="grid grid-cols-2 gap-3">
        <TextField
          label="Peso na classe (%)"
          inputMode="decimal"
          placeholder="Opcional"
          value={targetWeight}
          onChange={(event) => setTargetWeight(event.target.value)}
        />
        <TextField
          label="Teto na carteira (%)"
          inputMode="decimal"
          placeholder="Opcional"
          value={maxWeight}
          onChange={(event) => setMaxWeight(event.target.value)}
        />
      </div>
      {!initial && (
        <fieldset className="space-y-3 rounded-field border border-separator p-3">
          <legend className="px-1 text-subhead font-medium">Posição atual (opcional)</legend>
          <p className="text-footnote text-text-2">
            {fixedIncome
              ? 'Já tem dinheiro aplicado? Informe o total aplicado e o saldo de hoje, e pule o histórico de aplicações.'
              : 'Já tem este ativo? Informe quantidade, preço médio e o preço de hoje, e pule o histórico de compras.'}
          </p>
          {fixedIncome ? (
            <div className="grid grid-cols-2 gap-3">
              <MoneyInput label="Valor aplicado" value={startValue} onChange={setStartValue} />
              <TextField
                label="Desde"
                type="date"
                value={startDate}
                onChange={(event) => setStartDate(event.target.value)}
              />
              <div className="col-span-2">
                <MoneyInput
                  label="Saldo atual"
                  value={currentValue}
                  onChange={setCurrentValue}
                  hint="Quanto vale hoje (com rendimento). Vazio: vale o aplicado."
                />
              </div>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-3">
                <TextField
                  label="Quantidade"
                  inputMode="decimal"
                  placeholder="Opcional"
                  value={startQty}
                  onChange={(event) => setStartQty(event.target.value)}
                />
                <TextField
                  label="Preço médio (R$)"
                  inputMode="decimal"
                  placeholder="Ex.: 9,73"
                  value={startPrice}
                  onChange={(event) => setStartPrice(event.target.value)}
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <TextField
                  label="Preço atual (R$)"
                  inputMode="decimal"
                  placeholder="Opcional"
                  value={currentPrice}
                  onChange={(event) => setCurrentPrice(event.target.value)}
                />
                <TextField
                  label="Posição em"
                  type="date"
                  value={startDate}
                  onChange={(event) => setStartDate(event.target.value)}
                />
              </div>
              <p className="text-footnote text-text-2">
                O preço atual vale até chegar uma cotação mais nova. Compras e vendas depois da data
                continuam somando.
              </p>
            </>
          )}
        </fieldset>
      )}
      {localError && (
        <p role="alert" className="text-footnote text-negative">
          {localError}
        </p>
      )}
      <FormError error={error} />
      <Actions>
        <Button type="submit" block loading={submitting}>
          {initial ? 'Salvar' : 'Cadastrar ativo'}
        </Button>
        {extra}
      </Actions>
    </form>
  )
}

// ─── Operação ────────────────────────────────────────────────────────────────

const STOCK_KINDS: TradeKindValue[] = [
  'buy',
  'sell',
  'bonus',
  'split',
  'reverse_split',
  'subscription',
  'position_set',
]
const FIXED_KINDS: TradeKindValue[] = [
  'fixed_income_deposit',
  'fixed_income_withdrawal',
  'position_set',
]

/** Valores iniciais de uma operação nova (ex.: "Ajustar posição" já vem com a posição atual). */
export interface TradePreset {
  kind: TradeKindValue
  quantity?: string
  unitPrice?: string
  totalCents?: number | null
}

const decimalInput = (value: string | undefined) => {
  if (!value) return ''
  const n = Number(value)
  return Number.isFinite(n) ? String(Number(n.toFixed(8))).replace('.', ',') : value
}

/** Operação (RC-20/21): total calculado (qtd × preço + taxas), editável para bater com a nota. */
export function TradeForm({
  asset,
  fixedIncome,
  initial,
  preset,
  submitting,
  error,
  onSubmit,
  extra,
}: {
  asset: Asset
  fixedIncome: boolean
  initial?: AssetTrade | undefined
  preset?: TradePreset | undefined
  submitting: boolean
  error: unknown
  onSubmit: (values: CreateAssetTradeRequest) => Promise<unknown>
  extra?: ReactNode
}) {
  const kinds = fixedIncome ? FIXED_KINDS : STOCK_KINDS
  const [kind, setKind] = useState<TradeKindValue>(
    initial?.kind ?? preset?.kind ?? kinds[0] ?? 'buy',
  )
  const [date, setDate] = useState<string>(initial?.tradeDate ?? todayIsoDate())
  const [quantity, setQuantity] = useState(
    initial ? decimalInput(initial.quantity) : decimalInput(preset?.quantity),
  )
  const [price, setPrice] = useState(
    initial ? decimalInput(initial.unitPrice) : decimalInput(preset?.unitPrice),
  )
  const [fees, setFees] = useState<number | null>(initial?.feesCents ?? null)
  const [total, setTotal] = useState<number | null>(
    initial?.totalCents ?? preset?.totalCents ?? null,
  )
  const [totalTouched, setTotalTouched] = useState(Boolean(initial))
  const [ratio, setRatio] = useState(initial?.splitRatio ?? '')
  const [notes, setNotes] = useState(initial?.notes ?? '')
  const [localError, setLocalError] = useState<string | null>(null)
  const split = kind === 'split' || kind === 'reverse_split'
  const positionSet = kind === 'position_set'

  const computed = useMemo(() => {
    const q = decimalText(quantity)
    const p = decimalText(price)
    if (!isDecimal(q) || !isDecimal(p)) return null
    const gross = tradeTotalCents(q, p, 0)
    return kind === 'sell' ? Math.max(0, gross - (fees ?? 0)) : gross + (fees ?? 0)
  }, [quantity, price, fees, kind])

  function submit(event: FormEvent) {
    event.preventDefault()
    setLocalError(null)
    if (fixedIncome) {
      if (total === null || (!total && !positionSet)) return setLocalError('Informe o valor')
      void onSubmit({
        assetId: asset.id,
        kind,
        tradeDate: date,
        quantity: '1',
        unitPrice: (total / 100).toFixed(2),
        totalCents: total,
        notes: notes || null,
      })
      return
    }
    if (split) {
      if (!isDecimal(decimalText(ratio)) || Number(decimalText(ratio)) <= 0) {
        return setLocalError('Informe a proporção (ex.: 10 para 1:10)')
      }
      void onSubmit({
        assetId: asset.id,
        kind,
        tradeDate: date,
        splitRatio: decimalText(ratio),
        notes: notes || null,
      })
      return
    }
    const q = decimalText(quantity)
    const p = decimalText(price || '0')
    if (positionSet) {
      if (!isDecimal(q)) return setLocalError('Informe a quantidade (0 zera a posição)')
      if (!isDecimal(p) || (Number(q) > 0 && Number(p) <= 0))
        return setLocalError('Informe o preço médio')
      // Sem total: o servidor calcula qtd × PM.
      void onSubmit({
        assetId: asset.id,
        kind,
        tradeDate: date,
        quantity: q,
        unitPrice: p,
        feesCents: 0,
        notes: notes || null,
      })
      return
    }
    if (!isDecimal(q) || Number(q) <= 0) return setLocalError('Informe a quantidade')
    if (!isDecimal(p)) return setLocalError('Preço inválido')
    void onSubmit({
      assetId: asset.id,
      kind,
      tradeDate: date,
      quantity: q,
      unitPrice: p,
      feesCents: fees ?? 0,
      ...(totalTouched && total !== null ? { totalCents: total } : {}),
      notes: notes || null,
    })
  }

  return (
    <form noValidate className="space-y-4" onSubmit={submit}>
      <div className="grid grid-cols-2 gap-3">
        <SelectField
          label="Tipo"
          value={kind}
          onChange={(event) => setKind(event.target.value as TradeKindValue)}
        >
          {kinds.map((item) => (
            <option key={item} value={item}>
              {tradeKindLabels[item]}
            </option>
          ))}
        </SelectField>
        <TextField
          label="Data"
          type="date"
          value={date}
          onChange={(event) => setDate(event.target.value)}
        />
      </div>
      {positionSet && (
        <p className="rounded-field bg-surface-2 px-3 py-2 text-footnote text-text-2">
          {fixedIncome
            ? 'A partir desta data, o valor aplicado passa a ser este. As operações anteriores ficam no histórico, mas deixam de contar.'
            : 'A partir desta data, a posição passa a ser esta. As operações anteriores ficam no histórico, mas deixam de contar para a quantidade e o preço médio.'}
        </p>
      )}
      {fixedIncome ? (
        <MoneyInput
          label={
            positionSet
              ? 'Valor aplicado (total)'
              : kind === 'fixed_income_withdrawal'
                ? 'Valor resgatado'
                : 'Valor aplicado'
          }
          value={total}
          onChange={setTotal}
          large
        />
      ) : positionSet ? (
        <div className="grid grid-cols-2 gap-3">
          <TextField
            label="Quantidade"
            inputMode="decimal"
            value={quantity}
            onChange={(event) => setQuantity(event.target.value)}
          />
          <TextField
            label="Preço médio (R$)"
            inputMode="decimal"
            placeholder="Ex.: 9,73"
            value={price}
            onChange={(event) => setPrice(event.target.value)}
            hint={
              isDecimal(decimalText(quantity)) && isDecimal(decimalText(price))
                ? `Custo: ${formatBRL(tradeTotalCents(decimalText(quantity), decimalText(price), 0))}`
                : undefined
            }
          />
        </div>
      ) : split ? (
        <TextField
          label={kind === 'split' ? 'Proporção (novas por ação)' : 'Proporção (antigas por nova)'}
          inputMode="decimal"
          placeholder="Ex.: 10"
          value={ratio}
          onChange={(event) => setRatio(event.target.value)}
          hint={
            kind === 'split'
              ? '1:10 → 10 (cada ação vira 10).'
              : '10:1 → 10 (cada 10 ações viram 1).'
          }
        />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3">
            <TextField
              label="Quantidade"
              inputMode="decimal"
              value={quantity}
              onChange={(event) => setQuantity(event.target.value)}
              autoFocus={!initial}
            />
            <TextField
              label={kind === 'bonus' ? 'Custo atribuído (R$)' : 'Preço unitário (R$)'}
              inputMode="decimal"
              placeholder={kind === 'bonus' ? '0,00' : 'Ex.: 9,73'}
              value={price}
              onChange={(event) => setPrice(event.target.value)}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <MoneyInput label="Taxas" value={fees} onChange={setFees} />
            <MoneyInput
              label="Total da nota"
              value={totalTouched ? total : computed}
              onChange={(value) => {
                setTotalTouched(true)
                setTotal(value)
              }}
              hint={computed !== null ? `Calculado: ${formatBRL(computed)}` : undefined}
            />
          </div>
        </>
      )}
      <TextField
        label="Observação"
        value={notes}
        onChange={(event) => setNotes(event.target.value)}
        placeholder="Opcional"
      />
      {localError && (
        <p role="alert" className="text-footnote text-negative">
          {localError}
        </p>
      )}
      <FormError error={error} />
      <Actions>
        <Button type="submit" block loading={submitting}>
          {initial ? 'Salvar' : positionSet ? 'Salvar posição' : 'Registrar operação'}
        </Button>
        {extra}
      </Actions>
    </form>
  )
}

// ─── Provento ────────────────────────────────────────────────────────────────

export function DividendForm({
  assets,
  assetId: fixedAssetId,
  initial,
  submitting,
  error,
  onSubmit,
  extra,
}: {
  assets: Asset[]
  assetId?: string | undefined
  initial?: Dividend | undefined
  submitting: boolean
  error: unknown
  onSubmit: (values: CreateDividendRequest) => Promise<unknown>
  extra?: ReactNode
}) {
  const [assetId, setAssetId] = useState(initial?.assetId ?? fixedAssetId ?? assets[0]?.id ?? '')
  const [kind, setKind] = useState<CreateDividendRequest['kind']>(initial?.kind ?? 'dividend')
  const [payDate, setPayDate] = useState<string>(initial?.payDate ?? todayIsoDate())
  const [amount, setAmount] = useState<number | null>(initial?.amountCents ?? null)
  const [notes, setNotes] = useState(initial?.notes ?? '')
  const [localError, setLocalError] = useState<string | null>(null)

  return (
    <form
      noValidate
      className="space-y-4"
      onSubmit={(event) => {
        event.preventDefault()
        if (!amount || amount <= 0) return setLocalError('Informe o valor recebido')
        setLocalError(null)
        void onSubmit({ assetId, kind, payDate, amountCents: amount, notes: notes || null })
      }}
    >
      {!fixedAssetId && !initial && (
        <SelectField
          label="Ativo"
          value={assetId}
          onChange={(event) => setAssetId(event.target.value)}
        >
          {assets.map((asset) => (
            <option key={asset.id} value={asset.id}>
              {assetLabel(asset)}
            </option>
          ))}
        </SelectField>
      )}
      <MoneyInput
        label="Valor recebido"
        value={amount}
        onChange={setAmount}
        large
        autoFocus={!initial}
      />
      <div className="grid grid-cols-2 gap-3">
        <SelectField
          label="Tipo"
          value={kind}
          onChange={(event) => setKind(event.target.value as CreateDividendRequest['kind'])}
        >
          {Object.entries(dividendKindLabels).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </SelectField>
        <TextField
          label="Data do pagamento"
          type="date"
          value={payDate}
          onChange={(event) => setPayDate(event.target.value)}
        />
      </div>
      <TextField
        label="Observação"
        value={notes}
        onChange={(event) => setNotes(event.target.value)}
        placeholder="Opcional"
      />
      {localError && (
        <p role="alert" className="text-footnote text-negative">
          {localError}
        </p>
      )}
      <FormError error={error} />
      <Actions>
        <Button type="submit" block loading={submitting}>
          {initial ? 'Salvar' : 'Registrar provento'}
        </Button>
        {extra}
      </Actions>
    </form>
  )
}

/** RC-41: proventos do mês em lote — um valor ao lado de cada ativo; salva só os preenchidos. */
export function DividendBatchForm({
  positions,
  classes,
  submitting,
  error,
  onSubmit,
}: {
  positions: Position[]
  classes: AssetClass[]
  submitting: boolean
  error: unknown
  onSubmit: (
    payDate: string,
    items: { assetId: string; amountCents: number; kind: 'dividend' | 'income' }[],
  ) => Promise<unknown>
}) {
  const [payDate, setPayDate] = useState<string>(todayIsoDate())
  const [values, setValues] = useState<Record<string, number | null>>({})
  const eligible = positions.filter(
    (item) => item.asset.quoteMode === 'auto' && Number(item.quantity) > 0,
  )
  const filled = Object.entries(values).filter(([, value]) => value && value > 0) as [
    string,
    number,
  ][]
  const total = filled.reduce((sum, [, value]) => sum + value, 0)

  return (
    <form
      noValidate
      className="space-y-4"
      onSubmit={(event) => {
        event.preventDefault()
        void onSubmit(
          payDate,
          filled.map(([assetId, amountCents]) => {
            const position = eligible.find((item) => item.asset.id === assetId)
            const reit =
              classes.find((item) => item.id === position?.asset.assetClassId)?.kind === 'reit'
            return { assetId, amountCents, kind: reit ? 'income' : 'dividend' }
          }),
        )
      }}
    >
      <TextField
        label="Data do pagamento"
        type="date"
        value={payDate}
        onChange={(event) => setPayDate(event.target.value)}
      />
      {eligible.length === 0 ? (
        <p className="text-subhead text-text-2">Nenhum ativo de bolsa com posição.</p>
      ) : (
        classes
          .filter((assetClass) =>
            eligible.some((item) => item.asset.assetClassId === assetClass.id),
          )
          .map((assetClass) => (
            <fieldset key={assetClass.id} className="space-y-2">
              <legend className="mb-1 px-1 text-footnote font-medium tracking-wide text-text-2 uppercase">
                {assetClass.name}
              </legend>
              {eligible
                .filter((item) => item.asset.assetClassId === assetClass.id)
                .map((item) => (
                  <div
                    key={item.asset.id}
                    className="grid grid-cols-[minmax(0,1fr)_minmax(0,9rem)] items-center gap-3"
                  >
                    <span className="min-w-0">
                      <span className="block truncate text-body font-medium">
                        {assetLabel(item.asset)}
                      </span>
                      <span className="block truncate text-caption text-text-2">
                        {item.quantity} cotas · {formatPrice(item.price)}
                      </span>
                    </span>
                    <MoneyInput
                      label={`Provento de ${assetLabel(item.asset)}`}
                      value={values[item.asset.id] ?? null}
                      onChange={(value) =>
                        setValues((current) => ({ ...current, [item.asset.id]: value }))
                      }
                    />
                  </div>
                ))}
            </fieldset>
          ))
      )}
      <FormError error={error} />
      <div
        className={cn('sticky bottom-0 -mx-1 flex items-center gap-3 bg-surface px-1 pt-2 pb-1')}
      >
        <span className="flex-1 text-subhead text-text-2 tabular">
          {filled.length} {filled.length === 1 ? 'ativo' : 'ativos'} · {formatBRL(total)}
        </span>
        <Button type="submit" loading={submitting} disabled={filled.length === 0}>
          Salvar proventos
        </Button>
      </div>
    </form>
  )
}
