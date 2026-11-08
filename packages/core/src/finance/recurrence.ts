/**
 * Modelos recorrentes (docs/04 §2–3, RF-10..15, RF-21, RF-23): salário base, contas fixas
 * e planejamentos anuais. Um modelo **projeta** um lançamento previsto em cada mês em que
 * ocorre; o lançamento é criado ("materializado") quando o mês é aberto (RF-11).
 */
import { compareMonths, dateInMonth, type IsoDate } from '../dates/calendar.ts'
import { parseCompetenceMonth } from '../dates/competence-month.ts'

export type RecurrenceFrequency = 'monthly' | 'yearly'

export interface RecurrenceRule {
  frequency: RecurrenceFrequency
  /** 1–12, só para `yearly` (ex.: aniversário em outubro). */
  monthOfYear: number | null
  dayOfMonth: number
  startMonth: string
  endMonth: string | null
  isActive: boolean
}

/** O modelo gera lançamento neste mês? */
export function templateOccursIn(rule: RecurrenceRule, month: string): boolean {
  if (!rule.isActive) return false
  if (compareMonths(month, rule.startMonth) < 0) return false
  if (rule.endMonth !== null && compareMonths(month, rule.endMonth) > 0) return false
  if (rule.frequency === 'yearly') return parseCompetenceMonth(month).month === rule.monthOfYear
  return true
}

/** Data prevista do lançamento no mês (dia 31 em fevereiro → último dia). */
export function templateDateIn(rule: Pick<RecurrenceRule, 'dayOfMonth'>, month: string): IsoDate {
  return dateInMonth(month, rule.dayOfMonth)
}

/**
 * RF-11: modelos que ainda precisam virar lançamento neste mês.
 * `alreadyGenerated` = ids de modelos que já têm lançamento no mês — inclusive excluído,
 * para que um lançamento apagado pelo usuário não reapareça ao reabrir o mês.
 */
export function templatesToMaterialize<T extends RecurrenceRule & { id: string }>(
  templates: readonly T[],
  month: string,
  alreadyGenerated: ReadonlySet<string>,
): T[] {
  return templates.filter(
    (template) => !alreadyGenerated.has(template.id) && templateOccursIn(template, month),
  )
}

export interface GeneratedTransaction {
  competenceMonth: string
  status: 'forecast' | 'settled'
  isOverride: boolean
}

/**
 * RF-13: ao editar o modelo "a partir do mês X", mudam só os lançamentos gerados por ele
 * com competência ≥ X que ainda estão previstos e não foram editados à mão.
 * Meses anteriores, lançamentos já realizados e overrides ficam como estão.
 */
export function isAffectedByTemplateChange(
  transaction: GeneratedTransaction,
  applyFromMonth: string,
): boolean {
  return (
    !transaction.isOverride &&
    transaction.status === 'forecast' &&
    compareMonths(transaction.competenceMonth, applyFromMonth) >= 0
  )
}

/** RF-14: ao excluir o modelo, só saem os lançamentos previstos a partir do mês escolhido. */
export function isRemovedWithTemplate(
  transaction: Omit<GeneratedTransaction, 'isOverride'>,
  fromMonth: string,
): boolean {
  return (
    transaction.status === 'forecast' && compareMonths(transaction.competenceMonth, fromMonth) >= 0
  )
}
