/**
 * Balanço mensal e rentabilidade real (docs/07). Funções puras.
 *
 * O balanço é o patrimônio congelado num dia. Rentabilidade real = quanto o patrimônio
 * cresceu descontando o dinheiro novo (aportes) do período `(balanço anterior, este]`.
 * Dinheiro em centavos inteiros; taxas como fração (0,015 = 1,5%).
 */
import { type Cents } from '../money/cents.ts'
import { Decimal, type DecimalInput, toDecimal } from '../money/decimal.ts'

export const BALANCE_STATUSES = ['draft', 'closed'] as const
export type BalanceStatus = (typeof BALANCE_STATUSES)[number]

/** Quando o aporte entra no período (docs/07 §3). */
export const CONTRIBUTION_TIMINGS = ['end', 'start', 'dietz'] as const
export type ContributionTiming = (typeof CONTRIBUTION_TIMINGS)[number]

/** De onde vêm os aportes do período (RB-11). */
export const CONTRIBUTION_SOURCES = ['contributions', 'trades'] as const
export type ContributionSource = (typeof CONTRIBUTION_SOURCES)[number]

/** Dinheiro que entrou (+) ou saiu (−) da carteira numa data. */
export interface Flow {
  /** `AAAA-MM-DD`. */
  date: string
  amountCents: Cents
}

const DAY = 24 * 60 * 60 * 1000
const dayNumber = (date: string) => Math.round(Date.parse(`${date}T00:00:00Z`) / DAY)

/** RB-10: fluxos do período `(depois de start, até end]`; sem start, tudo até end. */
export function flowsInPeriod(flows: readonly Flow[], start: string | null, end: string): Flow[] {
  return flows.filter((flow) => (start === null || flow.date > start) && flow.date <= end)
}

export const sumFlows = (flows: readonly Flow[]): Cents =>
  flows.reduce((sum, flow) => sum + flow.amountCents, 0)

export interface PeriodInput {
  /** Total do balanço anterior (null = primeiro balanço). */
  startValueCents: Cents | null
  endValueCents: Cents
  /** Aportes do período (já filtrados). */
  flows: readonly Flow[]
  startDate: string | null
  endDate: string
  timing: ContributionTiming
}

export interface PeriodResult {
  contributionsCents: Cents
  /** V₁ − V₀ − C (null no primeiro balanço). */
  gainCents: Cents | null
  /** Rentabilidade do período (fração) ou null quando não dá para calcular. */
  rate: number | null
}

/**
 * §3: ganho real = V₁ − V₀ − C.
 * - `end` (padrão): r = ganho / V₀ (o aporte entrou logo antes do balanço);
 * - `start`: r = ganho / (V₀ + C);
 * - `dietz`: Modified Dietz, cada aporte pesa pelos dias que ficou aplicado.
 */
export function periodReturn(input: PeriodInput): PeriodResult {
  const contributions = sumFlows(input.flows)
  if (input.startValueCents === null || input.startDate === null) {
    return { contributionsCents: contributions, gainCents: null, rate: null }
  }
  const v0 = input.startValueCents
  const gain = input.endValueCents - v0 - contributions
  let base: Decimal
  if (input.timing === 'start') base = new Decimal(v0 + contributions)
  else if (input.timing === 'dietz') {
    const start = dayNumber(input.startDate)
    const span = dayNumber(input.endDate) - start
    base = input.flows.reduce((sum, flow) => {
      const weight = span > 0 ? (dayNumber(input.endDate) - dayNumber(flow.date)) / span : 0
      return sum.plus(new Decimal(flow.amountCents).times(Math.min(1, Math.max(0, weight))))
    }, new Decimal(v0))
  } else base = new Decimal(v0)
  return {
    contributionsCents: contributions,
    gainCents: gain,
    rate: base.greaterThan(0) ? new Decimal(gain).dividedBy(base).toNumber() : null,
  }
}

/** Retorno acumulado encadeado (TWR): Π(1 + r) − 1. Meses sem taxa não entram. */
export function chainRates(rates: readonly (number | null)[]): number | null {
  const valid = rates.filter((rate): rate is number => rate !== null)
  if (valid.length === 0) return null
  return valid
    .reduce((acc, rate) => acc.times(1 + rate), new Decimal(1))
    .minus(1)
    .toNumber()
}

// ─── Série de balanços ───────────────────────────────────────────────────────

export interface BalancePoint {
  id: string
  competenceMonth: string
  referenceDate: string
  totalCents: Cents
  /** Proventos do período (parte do ganho, RB-20). */
  dividendsCents: Cents
  /** Aporte congelado no fechamento; null = calcula dos fluxos. */
  frozenContributionsCents?: Cents | null
}

export interface BalanceRow extends BalancePoint {
  previousTotalCents: Cents | null
  contributionsCents: Cents
  gainCents: Cents | null
  rate: number | null
  /** Acumulado desde o primeiro balanço (TWR). */
  cumulative: number | null
  /** Acumulado no ano do balanço (TWR). */
  yearCumulative: number | null
  /** Capital próprio colocado até aqui: 1º balanço + aportes seguintes. */
  investedCents: Cents
  /** Aporte congelado difere do calculado hoje (RB-12). */
  contributionsChanged: boolean
}

/** Uma linha por balanço, em ordem de data, com ganho, taxa e acumulados. */
export function balanceSeries(
  points: readonly BalancePoint[],
  flows: readonly Flow[],
  timing: ContributionTiming,
): BalanceRow[] {
  const sorted = [...points].sort((a, b) => a.referenceDate.localeCompare(b.referenceDate))
  const rows: BalanceRow[] = []
  let invested = 0
  sorted.forEach((point, index) => {
    const previous = index > 0 ? sorted[index - 1] : undefined
    const periodFlows = previous
      ? flowsInPeriod(flows, previous.referenceDate, point.referenceDate)
      : []
    const live = sumFlows(periodFlows)
    const frozen = point.frozenContributionsCents ?? null
    const contributions = frozen ?? live
    // Com o aporte congelado, o Dietz usa o total numa data só (meio do período não se sabe).
    const used: Flow[] =
      frozen !== null && frozen !== live
        ? [{ date: point.referenceDate, amountCents: frozen }]
        : periodFlows
    const result = periodReturn({
      startValueCents: previous?.totalCents ?? null,
      endValueCents: point.totalCents,
      flows: used,
      startDate: previous?.referenceDate ?? null,
      endDate: point.referenceDate,
      timing,
    })
    invested = previous ? invested + contributions : point.totalCents
    const year = point.referenceDate.slice(0, 4)
    const sameYear = [
      ...rows.filter((row) => row.referenceDate.startsWith(year)).map((row) => row.rate),
      result.rate,
    ]
    rows.push({
      ...point,
      previousTotalCents: previous?.totalCents ?? null,
      contributionsCents: contributions,
      gainCents: result.gainCents,
      rate: result.rate,
      cumulative: chainRates([...rows.map((row) => row.rate), result.rate]),
      yearCumulative: chainRates(sameYear),
      investedCents: invested,
      contributionsChanged: frozen !== null && frozen !== live && previous !== undefined,
    })
  })
  return rows
}

export interface YearSummary {
  year: string
  months: number
  gainCents: Cents
  contributionsCents: Cents
  dividendsCents: Cents
  /** TWR no ano. */
  twr: number | null
  /** V(último balanço do ano anterior) + aportado no ano (doc 07). */
  capitalBaseCents: Cents
  /** Ganho real do ano / capital base ("investi 10 mil, tenho 12 mil"). */
  gainOnCapital: number | null
  /** (1 + TWR)^(1/n) − 1. */
  averageMonthlyRate: number | null
  /** Patrimônio no fim do ano se seguir a média, mais os aportes previstos. */
  projectionCents: Cents | null
  lastTotalCents: Cents | null
}

/**
 * Resumo do ano (§3). `plannedMonthlyCents` = aporte previsto por mês (meta) para a projeção;
 * meses restantes = 12 − mês do último balanço do ano.
 */
export function yearSummary(
  rows: readonly BalanceRow[],
  year: string,
  plannedMonthlyCents = 0,
): YearSummary {
  const inYear = rows.filter((row) => row.referenceDate.startsWith(year))
  const before = rows.filter((row) => row.referenceDate < `${year}-01-01`)
  const gains = inYear.filter((row) => row.gainCents !== null)
  const gain = gains.reduce((sum, row) => sum + (row.gainCents ?? 0), 0)
  // Aporte do 1º balanço da série não é "aportado no ano" (vira capital inicial).
  const contributions = inYear
    .filter((row) => row.previousTotalCents !== null)
    .reduce((sum, row) => sum + row.contributionsCents, 0)
  const twr = chainRates(inYear.map((row) => row.rate))
  const months = inYear.filter((row) => row.rate !== null).length
  const start =
    before.at(-1)?.totalCents ?? inYear[0]?.previousTotalCents ?? inYear[0]?.totalCents ?? 0
  const capital = start + contributions
  const average = twr !== null && months > 0 && twr > -1 ? Math.pow(1 + twr, 1 / months) - 1 : null
  const last = inYear.at(-1)
  let projection: Cents | null = null
  if (last && average !== null) {
    const remaining = Math.max(0, 12 - Number(last.referenceDate.slice(5, 7)))
    projection = new Decimal(last.totalCents)
      .times(new Decimal(1 + average).pow(remaining))
      .plus(plannedMonthlyCents * remaining)
      .toDecimalPlaces(0, Decimal.ROUND_HALF_EVEN)
      .toNumber()
  }
  return {
    year,
    months,
    gainCents: gain,
    contributionsCents: contributions,
    dividendsCents: inYear.reduce((sum, row) => sum + row.dividendsCents, 0),
    twr,
    capitalBaseCents: capital,
    gainOnCapital: capital > 0 && gains.length > 0 ? gain / capital : null,
    averageMonthlyRate: average,
    projectionCents: projection,
    lastTotalCents: last?.totalCents ?? null,
  }
}

// ─── Preços observados (RB-30) ───────────────────────────────────────────────

export interface PriceObservation {
  key: string
  date: string
  price: DecimalInput
  dy?: DecimalInput | null
  pvp?: DecimalInput | null
}

export interface ObservedPrice {
  key: string
  count: number
  max: { price: string; date: string }
  min: { price: string; date: string }
  last: { price: string; date: string; dy: string | null; pvp: string | null }
  /** Último DY e P/VP anotados (podem vir de balanços anteriores ao último). */
  lastDy: string | null
  lastPvp: string | null
  history: { date: string; price: string; dy: string | null; pvp: string | null }[]
  /** Distância do preço atual até o mínimo/máximo observado (fração; null sem preço). */
  aboveMin: number | null
  belowMax: number | null
}

const text = (value: DecimalInput | null | undefined) =>
  value === null || value === undefined || value === '' ? null : toDecimal(value).toString()

/**
 * Máximo, mínimo ("melhor preço que já vi"), último DY/P-VP e histórico por ativo, a partir
 * dos balanços. Preço zero é ignorado. `current` = preço de hoje (cotação/manual).
 */
export function observedPrices(
  observations: readonly PriceObservation[],
  current: ReadonlyMap<string, DecimalInput | null> = new Map(),
): ObservedPrice[] {
  const byKey = new Map<string, PriceObservation[]>()
  for (const item of observations) {
    if (!toDecimal(item.price).greaterThan(0)) continue
    byKey.set(item.key, [...(byKey.get(item.key) ?? []), item])
  }
  return [...byKey.entries()].map(([key, list]) => {
    const sorted = [...list].sort((a, b) => a.date.localeCompare(b.date))
    let max = sorted[0] as PriceObservation
    let min = sorted[0] as PriceObservation
    for (const item of sorted) {
      if (toDecimal(item.price).greaterThan(toDecimal(max.price))) max = item
      if (toDecimal(item.price).lessThan(toDecimal(min.price))) min = item
    }
    const last = sorted.at(-1) as PriceObservation
    const now = current.get(key)
    const price = now === null || now === undefined ? null : toDecimal(now)
    const valid = price !== null && price.greaterThan(0)
    return {
      key,
      count: sorted.length,
      max: { price: toDecimal(max.price).toString(), date: max.date },
      min: { price: toDecimal(min.price).toString(), date: min.date },
      last: {
        price: toDecimal(last.price).toString(),
        date: last.date,
        dy: text(last.dy),
        pvp: text(last.pvp),
      },
      lastDy: text([...sorted].reverse().find((item) => text(item.dy) !== null)?.dy),
      lastPvp: text([...sorted].reverse().find((item) => text(item.pvp) !== null)?.pvp),
      history: sorted.map((item) => ({
        date: item.date,
        price: toDecimal(item.price).toString(),
        dy: text(item.dy),
        pvp: text(item.pvp),
      })),
      aboveMin: valid ? price.dividedBy(toDecimal(min.price)).minus(1).toNumber() : null,
      belowMax: valid ? price.dividedBy(toDecimal(max.price)).minus(1).toNumber() : null,
    }
  })
}

/** Valor da linha do balanço: quantidade × preço (bolsa). */
export function balanceItemValue(quantity: DecimalInput, price: DecimalInput): Cents {
  return (
    toDecimal(quantity)
      .times(toDecimal(price))
      .times(100)
      .toDecimalPlaces(0, Decimal.ROUND_HALF_EVEN)
      .toNumber() + 0
  )
}
