import { describe, expect, it } from 'vitest'
import {
  CompetenceMonthError,
  addMonths,
  competenceMonthAt,
  competenceMonthToDate,
  currentCompetenceMonth,
  dateToCompetenceMonth,
  formatCompetenceMonth,
  isCompetenceMonth,
  parseCompetenceMonth,
} from './competence-month.ts'

describe('parse / format / isCompetenceMonth', () => {
  it('aceita AAAA-MM válido', () => {
    expect(parseCompetenceMonth('2026-11')).toEqual({ year: 2026, month: 11 })
    expect(isCompetenceMonth('2026-01')).toBe(true)
    expect(formatCompetenceMonth({ year: 2026, month: 3 })).toBe('2026-03')
  })

  it.each(['2026-13', '2026-00', '2026-1', '26-11', '2026-11-01', '', 'nov/2026'])(
    'rejeita "%s"',
    (value) => {
      expect(isCompetenceMonth(value)).toBe(false)
      expect(() => parseCompetenceMonth(value)).toThrow(CompetenceMonthError)
    },
  )

  it('isCompetenceMonth rejeita não-strings', () => {
    expect(isCompetenceMonth(202611)).toBe(false)
    expect(isCompetenceMonth(null)).toBe(false)
  })

  it('format rejeita ano/mês fora da faixa', () => {
    expect(() => formatCompetenceMonth({ year: 2026, month: 13 })).toThrow(CompetenceMonthError)
    expect(() => formatCompetenceMonth({ year: 0, month: 1 })).toThrow(CompetenceMonthError)
    expect(() => formatCompetenceMonth({ year: 2026.5, month: 1 })).toThrow(CompetenceMonthError)
  })
})

describe('conversão para a coluna date (dia 1, UTC)', () => {
  it('ida e volta', () => {
    const date = competenceMonthToDate('2026-11')
    expect(date.toISOString()).toBe('2026-11-01T00:00:00.000Z')
    expect(dateToCompetenceMonth(date)).toBe('2026-11')
  })

  it('data inválida', () => {
    expect(() => dateToCompetenceMonth(new Date('x'))).toThrow(CompetenceMonthError)
  })
})

describe('addMonths', () => {
  it('soma dentro do ano e na virada', () => {
    expect(addMonths('2026-11', 1)).toBe('2026-12')
    expect(addMonths('2026-12', 1)).toBe('2027-01')
    expect(addMonths('2026-11', 14)).toBe('2028-01')
  })

  it('subtrai atravessando o ano', () => {
    expect(addMonths('2026-01', -1)).toBe('2025-12')
    expect(addMonths('2026-03', -15)).toBe('2024-12')
    expect(addMonths('2026-03', 0)).toBe('2026-03')
  })

  it('rejeita quantidade fracionária', () => {
    expect(() => addMonths('2026-03', 1.5)).toThrow(CompetenceMonthError)
  })
})

describe('mês atual no fuso de São Paulo', () => {
  it('31/out 23:30 em SP ainda é outubro (já é novembro em UTC)', () => {
    const instant = new Date('2026-11-01T02:30:00Z') // 31/10 23:30 em SP (UTC-3)
    expect(currentCompetenceMonth(instant)).toBe('2026-10')
    expect(competenceMonthAt(instant, 'UTC')).toBe('2026-11')
  })

  it('virada de ano', () => {
    expect(currentCompetenceMonth(new Date('2027-01-01T02:59:00Z'))).toBe('2026-12')
    expect(currentCompetenceMonth(new Date('2027-01-01T03:00:00Z'))).toBe('2027-01')
  })

  it('usa a data atual por padrão', () => {
    expect(isCompetenceMonth(currentCompetenceMonth())).toBe(true)
  })
})
