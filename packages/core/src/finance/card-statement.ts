/**
 * Faturas de cartão de crédito (docs/04 §4, RF-30..32).
 *
 * Compra no dia `d`, cartão com fechamento `F` e vencimento `V`:
 * - `d < F` → fatura que fecha no mês da compra; `d ≥ F` → fecha no mês seguinte;
 * - fechamento em dia inexistente (31 em fevereiro) → último dia do mês;
 * - a fatura vence no mesmo mês do fechamento se `V > F`; senão, no mês seguinte;
 * - a competência da fatura é o mês do vencimento (padrão) ou do fechamento
 *   (`user_settings.card_competence`).
 */
import { dateInMonth, parseIsoDate, type IsoDate } from '../dates/calendar.ts'
import {
  addMonths,
  formatCompetenceMonth,
  type CompetenceMonth,
} from '../dates/competence-month.ts'

export interface CardCycle {
  closingDay: number
  dueDay: number
}

export type CardCompetenceMode = 'due_month' | 'closing_month'

/** Meses entre o fechamento e o vencimento da mesma fatura (0 ou 1). */
function dueOffset(card: CardCycle): number {
  return card.dueDay > card.closingDay ? 0 : 1
}

/** Mês em que fecha a fatura de uma compra feita em `purchaseDate`. */
export function statementClosingMonth(purchaseDate: string, card: CardCycle): CompetenceMonth {
  const { year, month, day } = parseIsoDate(purchaseDate)
  const purchaseMonth = formatCompetenceMonth({ year, month })
  const closingDate = dateInMonth(purchaseMonth, card.closingDay)
  const closingDayThisMonth = parseIsoDate(closingDate).day
  return day < closingDayThisMonth ? purchaseMonth : addMonths(purchaseMonth, 1)
}

/** Competência da fatura em que a compra cai (RF-03 + RF-30). */
export function statementCompetenceMonth(
  purchaseDate: string,
  card: CardCycle,
  mode: CardCompetenceMode = 'due_month',
): CompetenceMonth {
  const closingMonth = statementClosingMonth(purchaseDate, card)
  return mode === 'closing_month' ? closingMonth : addMonths(closingMonth, dueOffset(card))
}

export interface StatementDates {
  closingDate: IsoDate
  dueDate: IsoDate
}

/** Datas de fechamento e vencimento da fatura de uma competência. */
export function statementDates(
  competenceMonth: string,
  card: CardCycle,
  mode: CardCompetenceMode = 'due_month',
): StatementDates {
  const offset = dueOffset(card)
  const closingMonth =
    mode === 'closing_month' ? competenceMonth : addMonths(competenceMonth, -offset)
  const dueMonth = addMonths(closingMonth, offset)
  return {
    closingDate: dateInMonth(closingMonth, card.closingDay),
    dueDate: dateInMonth(dueMonth, card.dueDay),
  }
}

export type StatementStatus = 'open' | 'closed' | 'paid'

/**
 * Situação da fatura (RF-31): **paga** quando tem lançamentos e todos estão realizados;
 * senão **aberta** até o dia do fechamento (exclusive) e **fechada** a partir dele.
 */
export function statementStatus(input: {
  closingDate: string
  today: string
  transactionCount: number
  allSettled: boolean
}): StatementStatus {
  if (input.transactionCount > 0 && input.allSettled) return 'paid'
  return input.today < input.closingDate ? 'open' : 'closed'
}
