/**
 * Parcelamentos (docs/04 §5, RF-40..48). Tudo em centavos inteiros.
 */
import { compareMonths } from '../dates/calendar.ts'
import { addMonths, type CompetenceMonth } from '../dates/competence-month.ts'
import { MoneyError, assertCents, splitCents, sumCents, type Cents } from '../money/cents.ts'

export class InstallmentError extends RangeError {
  override name = 'InstallmentError'
}

export type InstallmentStatus = 'forecast' | 'settled'
export type InstallmentPlanStatus = 'active' | 'paid_off' | 'canceled'

/** Limite prático de parcelas (financiamentos longos cabem; evita gerar milhares de linhas). */
export const MAX_INSTALLMENTS = 480

function assertCount(count: number): void {
  if (!Number.isInteger(count) || count < 1 || count > MAX_INSTALLMENTS) {
    throw new InstallmentError(`Número de parcelas precisa ser entre 1 e ${MAX_INSTALLMENTS}`)
  }
}

/** RF-41: `floor(total / n)` por parcela e o resto dos centavos na 1ª. */
export function splitInstallments(totalCents: Cents, count: number): Cents[] {
  assertCount(count)
  assertCents(totalCents, 'total')
  if (totalCents <= 0) throw new InstallmentError('O total precisa ser maior que zero')
  if (totalCents < count) throw new InstallmentError('Cada parcela precisa ter pelo menos R$ 0,01')
  return splitCents(totalCents, count)
}

/** RF-41: informando o valor da parcela, o total é `parcela × n`. */
export function installmentTotal(installmentCents: Cents, count: number): Cents {
  assertCount(count)
  assertCents(installmentCents, 'parcela')
  if (installmentCents <= 0) throw new InstallmentError('A parcela precisa ser maior que zero')
  const total = installmentCents * count
  if (!Number.isSafeInteger(total)) throw new MoneyError('Total grande demais')
  return total
}

export interface ScheduledInstallment {
  number: number
  competenceMonth: CompetenceMonth
  amountCents: Cents
  status: InstallmentStatus
}

/**
 * RF-42/43: gera as `n` parcelas em competências consecutivas a partir da primeira.
 * Com `currentInstallment = k` ("já estou na parcela k"), as parcelas 1..k-1 nascem
 * realizadas (histórico) e k..n previstas.
 */
export function buildInstallmentSchedule(input: {
  totalCents: Cents
  count: number
  firstCompetenceMonth: string
  currentInstallment?: number | undefined
}): ScheduledInstallment[] {
  const amounts = splitInstallments(input.totalCents, input.count)
  const current = input.currentInstallment ?? 1
  if (!Number.isInteger(current) || current < 1 || current > input.count) {
    throw new InstallmentError(`A parcela atual precisa ser entre 1 e ${input.count}`)
  }
  return amounts.map((amountCents, index) => ({
    number: index + 1,
    competenceMonth: addMonths(input.firstCompetenceMonth, index),
    amountCents,
    status: index + 1 < current ? 'settled' : 'forecast',
  }))
}

/** "Já estou na parcela k" neste mês → a 1ª parcela foi k−1 meses antes. */
export function firstMonthFromCurrentInstallment(
  currentMonth: string,
  currentInstallment: number,
): CompetenceMonth {
  if (!Number.isInteger(currentInstallment) || currentInstallment < 1) {
    throw new InstallmentError('Parcela atual inválida')
  }
  return addMonths(currentMonth, -(currentInstallment - 1))
}

export interface InstallmentLike {
  number: number
  competenceMonth: string
  amountCents: Cents
  status: InstallmentStatus
}

export interface InstallmentIndicators {
  /** Parcela cuja competência é o mês visualizado (null fora do intervalo). */
  currentNumber: number | null
  phase: 'not_started' | 'running' | 'finished'
  paidCents: Cents
  remainingCents: Cents
  paidCount: number
  remainingCount: number
  /** pago / total, de 0 a 1 (só para exibir a barra). */
  progress: number
  lastCompetenceMonth: CompetenceMonth
}

/**
 * RF-44: indicadores derivados de um parcelamento no mês visualizado.
 * "Pago" = Σ parcelas realizadas (inclui a quitação antecipada, que entra como realizada).
 * Quitado ou cancelado → não falta nada.
 */
export function installmentIndicators(
  plan: {
    totalCents: Cents
    count: number
    firstCompetenceMonth: string
    status: InstallmentPlanStatus
  },
  installments: readonly InstallmentLike[],
  viewMonth: string,
): InstallmentIndicators {
  const lastCompetenceMonth = addMonths(plan.firstCompetenceMonth, plan.count - 1)
  const settled = installments.filter((item) => item.status === 'settled')
  const paidCents = sumCents(settled.map((item) => item.amountCents))
  const closed = plan.status !== 'active'
  const remainingCents = closed ? 0 : Math.max(0, plan.totalCents - paidCents)
  const paidCount = settled.filter((item) => item.number > 0).length
  const remainingCount = closed
    ? 0
    : installments.filter((item) => item.status === 'forecast').length

  let phase: InstallmentIndicators['phase'] = 'running'
  let currentNumber: number | null = null
  if (compareMonths(viewMonth, plan.firstCompetenceMonth) < 0) phase = 'not_started'
  else if (compareMonths(viewMonth, lastCompetenceMonth) > 0) phase = 'finished'
  else {
    currentNumber =
      installments.find((item) => item.competenceMonth === viewMonth && item.number > 0)?.number ??
      null
  }
  if (closed) phase = 'finished'

  return {
    currentNumber,
    phase,
    paidCents,
    remainingCents,
    paidCount,
    remainingCount,
    progress: plan.totalCents > 0 ? Math.min(1, paidCents / plan.totalCents) : 0,
    lastCompetenceMonth,
  }
}

/** RF-45: total para quitar tudo = Σ "falta pagar" dos parcelamentos ativos. */
export function payoffTotal(plans: readonly { remainingCents: Cents }[]): Cents {
  return sumCents(plans.map((plan) => plan.remainingCents))
}

export interface MonthlyCommitment {
  months: { month: CompetenceMonth; amountCents: Cents }[]
  /** Primeiro mês, a partir de `from`, sem nenhuma parcela prevista dali em diante. */
  freeFromMonth: CompetenceMonth
}

/**
 * RF-45: compromisso mensal = Σ parcelas previstas por mês, de `from` até `months` meses
 * à frente, e a partir de quando você fica livre das parcelas.
 */
export function monthlyCommitment(
  installments: readonly {
    competenceMonth: string
    amountCents: Cents
    status: InstallmentStatus
  }[],
  from: string,
  months = 12,
): MonthlyCommitment {
  const forecast = installments.filter(
    (item) => item.status === 'forecast' && compareMonths(item.competenceMonth, from) >= 0,
  )
  const result = Array.from({ length: months }, (_, index) => {
    const month = addMonths(from, index)
    const amountCents = sumCents(
      forecast.filter((item) => item.competenceMonth === month).map((item) => item.amountCents),
    )
    return { month, amountCents }
  })
  const last = forecast.reduce<string | null>(
    (latest, item) =>
      latest === null || compareMonths(item.competenceMonth, latest) > 0
        ? item.competenceMonth
        : latest,
    null,
  )
  return { months: result, freeFromMonth: last === null ? addMonths(from, 0) : addMonths(last, 1) }
}

export interface Payoff {
  amountCents: Cents
  /** Desconto obtido = falta pagar − valor pago (negativo se pagou mais, ex.: juros). */
  discountCents: Cents
}

/** RF-46: quitação antecipada — valor pago e desconto obtido. */
export function computePayoff(remainingCents: Cents, paidCents: Cents): Payoff {
  assertCents(paidCents, 'valor pago')
  if (paidCents <= 0) throw new InstallmentError('Informe o valor pago na quitação')
  if (remainingCents <= 0) throw new InstallmentError('Este parcelamento não tem saldo a quitar')
  return { amountCents: paidCents, discountCents: remainingCents - paidCents }
}

export interface ExistingInstallment {
  id: string
  number: number
  amountCents: Cents
  status: InstallmentStatus
  isOverride: boolean
}

export interface InstallmentEditPlan {
  /** Parcelas pagas ou editadas à mão: não mudam (RF-47). */
  keep: string[]
  update: { id: string; number: number; competenceMonth: CompetenceMonth; amountCents: Cents }[]
  create: { number: number; competenceMonth: CompetenceMonth; amountCents: Cents }[]
  /** Parcelas previstas que deixaram de existir (n diminuiu). */
  remove: string[]
}

/**
 * RF-47: editar total / nº de parcelas / 1ª competência regera só as parcelas previstas
 * não editadas. O valor que falta (total − parcelas mantidas) é redividido entre elas,
 * com o resto dos centavos na primeira.
 */
export function planInstallmentEdit(input: {
  totalCents: Cents
  count: number
  firstCompetenceMonth: string
  existing: readonly ExistingInstallment[]
}): InstallmentEditPlan {
  assertCount(input.count)
  assertCents(input.totalCents, 'total')
  const installments = input.existing.filter((item) => item.number > 0)
  const kept = installments.filter((item) => item.status === 'settled' || item.isOverride)
  const tooHigh = kept.find((item) => item.number > input.count)
  if (tooHigh) {
    throw new InstallmentError(
      `A parcela ${tooHigh.number} já foi paga ou editada; o parcelamento precisa ter pelo menos ${tooHigh.number} parcelas`,
    )
  }
  const keptNumbers = new Set(kept.map((item) => item.number))
  const freeNumbers = Array.from({ length: input.count }, (_, index) => index + 1).filter(
    (number) => !keptNumbers.has(number),
  )
  const remaining = input.totalCents - sumCents(kept.map((item) => item.amountCents))
  if (remaining < 0) {
    throw new InstallmentError('O total ficou menor que as parcelas já pagas')
  }
  if (freeNumbers.length === 0 && remaining !== 0) {
    throw new InstallmentError('Todas as parcelas já foram pagas; o total precisa ser a soma delas')
  }
  if (freeNumbers.length > 0 && remaining < freeNumbers.length) {
    throw new InstallmentError('O valor que falta não cobre as parcelas restantes')
  }
  const amounts = freeNumbers.length > 0 ? splitCents(remaining, freeNumbers.length) : []
  const byNumber = new Map(
    installments.filter((item) => !keptNumbers.has(item.number)).map((item) => [item.number, item]),
  )

  const plan: InstallmentEditPlan = {
    keep: kept.map((item) => item.id),
    update: [],
    create: [],
    remove: [],
  }
  freeNumbers.forEach((number, index) => {
    const amountCents = amounts[index] ?? 0
    const competenceMonth = addMonths(input.firstCompetenceMonth, number - 1)
    const existing = byNumber.get(number)
    if (existing) plan.update.push({ id: existing.id, number, competenceMonth, amountCents })
    else plan.create.push({ number, competenceMonth, amountCents })
  })
  plan.remove = installments
    .filter((item) => !keptNumbers.has(item.number) && item.number > input.count)
    .map((item) => item.id)
  return plan
}
