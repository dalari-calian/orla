/**
 * Mês de competência (docs/03 e regra 5 do CLAUDE.md).
 *
 * - Na API/UI ele trafega como texto `YYYY-MM` (`CompetenceMonth`).
 * - No banco é um `date` sempre no dia 1 (`2026-11-01`), que o Prisma lê como
 *   `Date` à meia-noite UTC — por isso as conversões usam os campos UTC.
 * - "Mês atual" é calculado no fuso de referência `America/Sao_Paulo`.
 */

export type CompetenceMonth = `${number}-${number}`

export const APP_TIME_ZONE = 'America/Sao_Paulo'

const PATTERN = /^(\d{4})-(0[1-9]|1[0-2])$/

export class CompetenceMonthError extends RangeError {
  override name = 'CompetenceMonthError'
}

export interface YearMonth {
  year: number
  /** 1–12 */
  month: number
}

export function isCompetenceMonth(value: unknown): value is CompetenceMonth {
  return typeof value === 'string' && PATTERN.test(value)
}

export function parseCompetenceMonth(value: string): YearMonth {
  const match = PATTERN.exec(value)
  if (!match)
    throw new CompetenceMonthError(`Mês de competência inválido: "${value}" (use AAAA-MM)`)
  return { year: Number(match[1]), month: Number(match[2]) }
}

export function formatCompetenceMonth({ year, month }: YearMonth): CompetenceMonth {
  if (
    !Number.isInteger(year) ||
    year < 1 ||
    year > 9999 ||
    !Number.isInteger(month) ||
    month < 1 ||
    month > 12
  ) {
    throw new CompetenceMonthError(`Ano/mês inválido: ${year}-${month}`)
  }
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}` as CompetenceMonth
}

/** `2026-11` → Date de 2026-11-01T00:00:00Z (o formato que o Prisma usa para colunas `date`). */
export function competenceMonthToDate(value: string): Date {
  const { year, month } = parseCompetenceMonth(value)
  return new Date(Date.UTC(year, month - 1, 1))
}

/** Date vinda de uma coluna `date` (meia-noite UTC) → `YYYY-MM`. */
export function dateToCompetenceMonth(date: Date): CompetenceMonth {
  if (Number.isNaN(date.getTime())) throw new CompetenceMonthError('Data inválida')
  return formatCompetenceMonth({ year: date.getUTCFullYear(), month: date.getUTCMonth() + 1 })
}

/** Soma (ou subtrai) meses, atravessando a virada de ano. */
export function addMonths(value: string, months: number): CompetenceMonth {
  if (!Number.isInteger(months))
    throw new CompetenceMonthError(`Quantidade de meses inválida: ${months}`)
  const { year, month } = parseCompetenceMonth(value)
  const index = year * 12 + (month - 1) + months
  return formatCompetenceMonth({ year: Math.floor(index / 12), month: (index % 12) + 1 })
}

/** Mês de competência de um instante, no fuso informado (padrão America/Sao_Paulo). */
export function competenceMonthAt(
  instant: Date,
  timeZone: string = APP_TIME_ZONE,
): CompetenceMonth {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: 'numeric',
  }).formatToParts(instant)
  const year = Number(parts.find((part) => part.type === 'year')?.value)
  const month = Number(parts.find((part) => part.type === 'month')?.value)
  return formatCompetenceMonth({ year, month })
}

/** Mês atual no fuso de referência do app. */
export function currentCompetenceMonth(
  now: Date = new Date(),
  timeZone: string = APP_TIME_ZONE,
): CompetenceMonth {
  return competenceMonthAt(now, timeZone)
}
