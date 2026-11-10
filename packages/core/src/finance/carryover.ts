/**
 * Saldo do mês anterior (docs/04 §6, RF-54..57): o que sobrou (ou faltou) em um mês
 * pode entrar no seguinte como um lançamento próprio, de natureza `carryover`.
 *
 * - O valor é o **saldo atual** do mês anterior (entradas recebidas − saídas pagas −
 *   investido), não a sobra prevista: só conta o que de fato aconteceu.
 * - O lançamento guarda o valor do momento em que foi aplicado (snapshot). Se o mês
 *   anterior mudar depois, o estado vira `stale` e o usuário decide se atualiza.
 * - Não é renda nem gasto: fica fora das entradas/saídas, da base da meta em % e das
 *   quebras do dashboard; entra só na sobra e no saldo do mês.
 */
import { addMonths, parseCompetenceMonth } from '../dates/competence-month.ts'
import { compareMonths } from '../dates/calendar.ts'
import { assertCents, type Cents } from '../money/cents.ts'

export const CARRYOVER_MODES = ['ask', 'auto', 'off'] as const
/** `ask` = pergunta a cada mês (padrão) · `auto` = aplica sozinho · `off` = nunca. */
export type CarryoverMode = (typeof CARRYOVER_MODES)[number]

const MONTH_NAMES = [
  'janeiro',
  'fevereiro',
  'março',
  'abril',
  'maio',
  'junho',
  'julho',
  'agosto',
  'setembro',
  'outubro',
  'novembro',
  'dezembro',
] as const

/** "2026-11" → "novembro". */
export function monthName(month: string): string {
  return MONTH_NAMES[parseCompetenceMonth(month).month - 1] ?? month
}

export type CarryoverState =
  /** Nada a mostrar (saldo zero, desligado, ignorado ou mês anterior ainda no futuro). */
  | 'none'
  /** Modo `ask`: mostrar o cartão "Levar para <mês>?". */
  | 'offer'
  /** Modo `auto`: a API deve criar/atualizar o lançamento agora. */
  | 'apply'
  /** Já aplicado e igual ao saldo atual do mês anterior. */
  | 'applied'
  /** Aplicado, mas o mês anterior mudou desde então. */
  | 'stale'

export interface CarryoverInput {
  /** Mês que está sendo visto (destino do saldo). */
  month: string
  /** Mês corrente no fuso do app. */
  currentMonth: string
  mode: CarryoverMode
  /** Saldo atual do mês anterior (com sinal). */
  previousBalanceCents: Cents
  /** Lançamento de saldo já existente neste mês, com sinal (null = não há). */
  appliedCents: Cents | null
  /** O usuário tocou em "Ignorar" (ou excluiu o lançamento) neste mês. */
  dismissed: boolean
}

export interface CarryoverDecision {
  state: CarryoverState
  previousMonth: string
  /** Saldo atual do mês anterior — o valor que seria levado. */
  previousBalanceCents: Cents
  appliedCents: Cents | null
  /** O mês anterior ainda não terminou: o valor pode mudar até a virada. */
  previousMonthOpen: boolean
}

/**
 * RF-55: decide o que fazer com o saldo do mês anterior ao abrir um mês.
 * - Mês anterior ainda não começou → nada a oferecer (é projeção, não saldo).
 * - Já aplicado → `applied` se bate, `stale` se mudou (`auto` com o mês anterior
 *   encerrado sincroniza sozinho: `apply`).
 * - Não aplicado → `none` se saldo zero, desligado ou ignorado; `auto` aplica quando o
 *   mês anterior terminou; `ask` oferece (inclusive com o mês anterior em andamento,
 *   para quem fecha o mês antes da virada).
 */
export function decideCarryover(input: CarryoverInput): CarryoverDecision {
  assertCents(input.previousBalanceCents, 'saldo do mês anterior')
  if (input.appliedCents !== null) assertCents(input.appliedCents, 'saldo aplicado')

  const previousMonth = addMonths(input.month, -1)
  const order = compareMonths(previousMonth, input.currentMonth)
  const previousMonthOpen = order === 0
  const base = {
    previousMonth,
    previousBalanceCents: input.previousBalanceCents,
    appliedCents: input.appliedCents,
    previousMonthOpen,
  }
  const autoReady = input.mode === 'auto' && order < 0

  if (input.appliedCents !== null) {
    if (order > 0 || input.appliedCents === input.previousBalanceCents) {
      return { ...base, state: 'applied' }
    }
    return { ...base, state: autoReady ? 'apply' : 'stale' }
  }

  if (order > 0 || input.dismissed || input.mode === 'off' || input.previousBalanceCents === 0) {
    return { ...base, state: 'none' }
  }
  if (input.mode === 'auto') return { ...base, state: autoReady ? 'apply' : 'none' }
  return { ...base, state: 'offer' }
}

export interface CarryoverEntry {
  type: 'income' | 'expense'
  /** Sempre positivo; o sinal vem do tipo (como em toda transação). */
  amountCents: Cents
  description: string
}

/**
 * RF-56: o lançamento que leva o saldo. Positivo → entrada "Saldo de novembro";
 * negativo → saída "Faltou em novembro". Zero → `null` (não há o que levar).
 */
export function carryoverEntry(balanceCents: Cents, previousMonth: string): CarryoverEntry | null {
  assertCents(balanceCents, 'saldo')
  if (balanceCents === 0) return null
  const name = monthName(previousMonth)
  return balanceCents > 0
    ? { type: 'income', amountCents: balanceCents, description: `Saldo de ${name}` }
    : { type: 'expense', amountCents: -balanceCents, description: `Faltou em ${name}` }
}

/** Valor com sinal de um lançamento de saldo (entrada +, saída −). */
export function signedCarryoverCents(entry: { type: string; amountCents: Cents }): Cents {
  return entry.type === 'income' ? entry.amountCents : -entry.amountCents
}
