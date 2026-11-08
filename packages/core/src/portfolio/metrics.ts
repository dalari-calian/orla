/**
 * Valores derivados da carteira (docs/05 §6 e §10): valor atual, resultado, pesos,
 * alocação × meta, proventos 12 meses e yield on cost. Percentuais como fração (0,25 = 25%).
 */
import { addMonths, type CompetenceMonth } from '../dates/competence-month.ts'
import { isoDateToCompetenceMonth } from '../dates/calendar.ts'
import { type Cents, sumCents } from '../money/cents.ts'
import { Decimal, type DecimalInput, toDecimal } from '../money/decimal.ts'
import { valueCents } from './position.ts'

export interface ValuationInput {
  quantity: DecimalInput
  costCents: Cents
  /** Cotação/preço em reais (null = sem preço). */
  price: DecimalInput | null
  /** Valor informado à mão (renda fixa / saldo da corretora), em centavos. */
  manualValueCents?: Cents | null
}

export interface Valuation {
  valueCents: Cents
  resultCents: Cents
  /** resultado / custo (null sem custo). */
  resultPct: number | null
}

/**
 * valorAtual = quantidade × cotação; renda fixa (ou sem cotação) usa o valor informado;
 * sem nada, o próprio custo (resultado 0, até o primeiro balanço).
 */
export function valuate(input: ValuationInput): Valuation {
  const value =
    input.manualValueCents !== null && input.manualValueCents !== undefined
      ? input.manualValueCents
      : input.price !== null
        ? valueCents(input.quantity, input.price)
        : input.costCents
  const result = value - input.costCents
  return {
    valueCents: value,
    resultCents: result,
    resultPct: input.costCents > 0 ? result / input.costCents : null,
  }
}

export interface WeightItem {
  id: string
  classId: string
  valueCents: Cents
}

/** Peso de cada ativo na classe e na carteira. */
export function weights(
  items: readonly WeightItem[],
): Map<string, { inClass: number; inPortfolio: number }> {
  const total = sumCents(items.map((item) => item.valueCents))
  const byClass = new Map<string, number>()
  for (const item of items)
    byClass.set(item.classId, (byClass.get(item.classId) ?? 0) + item.valueCents)
  return new Map(
    items.map((item) => {
      const classTotal = byClass.get(item.classId) ?? 0
      return [
        item.id,
        {
          inClass: classTotal > 0 ? item.valueCents / classTotal : 0,
          inPortfolio: total > 0 ? item.valueCents / total : 0,
        },
      ]
    }),
  )
}

export interface AllocationTarget {
  classId: string
  /** Meta em % (ex.: "30" ou 30). */
  targetPct: DecimalInput
  /** Teto em % (alerta), opcional. */
  maxPct?: DecimalInput | null
}

export interface AllocationRow {
  classId: string
  valueCents: Cents
  /** Fração atual (0..1). */
  current: number
  /** Fração da meta (0..1), ou null sem meta. */
  target: number | null
  /** Diferença em pontos percentuais (atual − meta). */
  deviationPp: number | null
  /** |desvio| > 5 p.p. (docs/05 §10). */
  offTarget: boolean
  aboveMax: boolean
  /** Quanto falta aportar para chegar na meta (centavos, ≥ 0). */
  missingCents: Cents
}

export const OFF_TARGET_PP = 5

/** Alocação atual × meta por classe. */
export function allocation(
  classes: readonly { classId: string; valueCents: Cents }[],
  targets: readonly AllocationTarget[],
): AllocationRow[] {
  const total = sumCents(classes.map((item) => item.valueCents))
  return classes.map(({ classId, valueCents: value }) => {
    const goal = targets.find((item) => item.classId === classId)
    const current = total > 0 ? value / total : 0
    const target = goal ? toDecimal(goal.targetPct).dividedBy(100).toNumber() : null
    const max =
      goal?.maxPct !== null && goal?.maxPct !== undefined
        ? toDecimal(goal.maxPct).dividedBy(100).toNumber()
        : null
    const deviationPp = target === null ? null : Math.round((current - target) * 10000) / 100
    return {
      classId,
      valueCents: value,
      current,
      target,
      deviationPp,
      offTarget: deviationPp !== null && Math.abs(deviationPp) > OFF_TARGET_PP,
      aboveMax: max !== null && current > max,
      missingCents: target === null ? 0 : Math.max(0, Math.round(total * target) - value),
    }
  })
}

/** Soma das metas (em %): precisa dar 100 (aviso, não bloqueio enquanto edita). */
export function targetsTotal(targets: readonly Pick<AllocationTarget, 'targetPct'>[]): Decimal {
  return targets.reduce((sum, item) => sum.plus(toDecimal(item.targetPct)), new Decimal(0))
}

export interface DividendLike {
  assetId: string
  /** `AAAA-MM-DD`. */
  payDate: string
  amountCents: Cents
}

/** Proventos dos últimos 12 meses (inclui o mês atual) até `today`. */
export function dividendsLast12Months(dividends: readonly DividendLike[], today: string): Cents {
  const to = isoDateToCompetenceMonth(today)
  const from = addMonths(to, -11)
  return sumCents(
    dividends
      .filter((item) => {
        const month = isoDateToCompetenceMonth(item.payDate)
        return month >= from && month <= to && item.payDate <= today
      })
      .map((item) => item.amountCents),
  )
}

/** Proventos por mês, para os `months` informados (mês sem nada = 0). */
export function dividendsByMonth(
  dividends: readonly DividendLike[],
  months: readonly CompetenceMonth[],
): { month: CompetenceMonth; amountCents: Cents }[] {
  const totals = new Map<string, number>()
  for (const item of dividends) {
    const month = isoDateToCompetenceMonth(item.payDate)
    totals.set(month, (totals.get(month) ?? 0) + item.amountCents)
  }
  return months.map((month) => ({ month, amountCents: totals.get(month) ?? 0 }))
}

/** Yield on cost = proventos 12m / custo (null sem custo). */
export function yieldOnCost(dividends12mCents: Cents, costCents: Cents): number | null {
  return costCents > 0 ? dividends12mCents / costCents : null
}

/** Últimos `count` meses terminando em `month` (do mais antigo ao mais novo). */
export function lastMonths(month: CompetenceMonth, count: number): CompetenceMonth[] {
  return Array.from({ length: count }, (_, index) => addMonths(month, index - count + 1))
}
