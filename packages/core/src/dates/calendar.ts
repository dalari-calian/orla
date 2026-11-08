/**
 * Datas de calendário (`YYYY-MM-DD`), sem hora nem fuso: data do gasto, do recebimento,
 * de fechamento/vencimento de fatura. No banco são colunas `date`, que o Prisma lê como
 * `Date` à meia-noite UTC — por isso as conversões usam os campos UTC.
 */
import {
  APP_TIME_ZONE,
  CompetenceMonthError,
  formatCompetenceMonth,
  parseCompetenceMonth,
  type CompetenceMonth,
} from './competence-month.ts'

export type IsoDate = `${number}-${number}-${number}`

const PATTERN = /^(\d{4})-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/

export interface YearMonthDay {
  year: number
  /** 1–12 */
  month: number
  /** 1–31 */
  day: number
}

export function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate()
}

export function isIsoDate(value: unknown): value is IsoDate {
  if (typeof value !== 'string') return false
  const match = PATTERN.exec(value)
  if (!match) return false
  return Number(match[3]) <= daysInMonth(Number(match[1]), Number(match[2]))
}

export function parseIsoDate(value: string): YearMonthDay {
  if (!isIsoDate(value))
    throw new CompetenceMonthError(`Data inválida: "${value}" (use AAAA-MM-DD)`)
  const [year, month, day] = value.split('-').map(Number) as [number, number, number]
  return { year, month, day }
}

export function formatIsoDate({ year, month, day }: YearMonthDay): IsoDate {
  const value = `${formatCompetenceMonth({ year, month })}-${String(day).padStart(2, '0')}`
  if (!isIsoDate(value)) throw new CompetenceMonthError(`Data inválida: ${value}`)
  return value
}

/**
 * Dia `day` do mês de competência; se o mês não tem esse dia (31 em fevereiro),
 * usa o último dia do mês (RF-30).
 */
export function dateInMonth(month: string, day: number): IsoDate {
  if (!Number.isInteger(day) || day < 1 || day > 31)
    throw new CompetenceMonthError(`Dia inválido: ${day}`)
  const ym = parseCompetenceMonth(month)
  return formatIsoDate({ ...ym, day: Math.min(day, daysInMonth(ym.year, ym.month)) })
}

/** `2026-11-15` → `2026-11`. */
export function isoDateToCompetenceMonth(value: string): CompetenceMonth {
  const { year, month } = parseIsoDate(value)
  return formatCompetenceMonth({ year, month })
}

/** `2026-11-15` → Date de 2026-11-15T00:00:00Z (o formato do Prisma para colunas `date`). */
export function isoDateToDate(value: string): Date {
  const { year, month, day } = parseIsoDate(value)
  return new Date(Date.UTC(year, month - 1, day))
}

/** Date de uma coluna `date` (meia-noite UTC) → `YYYY-MM-DD`. */
export function dateToIsoDate(date: Date): IsoDate {
  if (Number.isNaN(date.getTime())) throw new CompetenceMonthError('Data inválida')
  return formatIsoDate({
    year: date.getUTCFullYear(),
    month: date.getUTCMonth() + 1,
    day: date.getUTCDate(),
  })
}

/** Data de hoje no fuso de referência (padrão America/Sao_Paulo). */
export function todayIsoDate(now: Date = new Date(), timeZone: string = APP_TIME_ZONE): IsoDate {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
  }).formatToParts(now)
  const get = (type: string) => Number(parts.find((part) => part.type === type)?.value)
  return formatIsoDate({ year: get('year'), month: get('month'), day: get('day') })
}

/** Compara dois meses `YYYY-MM` (ou duas datas ISO): negativo, zero ou positivo. */
export function compareMonths(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0
}

/** Quantos meses de `from` até `to` (negativo se `to` vem antes). */
export function monthsBetween(from: string, to: string): number {
  const a = parseCompetenceMonth(from)
  const b = parseCompetenceMonth(to)
  return (b.year - a.year) * 12 + (b.month - a.month)
}
