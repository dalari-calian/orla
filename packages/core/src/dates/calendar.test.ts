import { describe, expect, it } from 'vitest'
import {
  compareMonths,
  dateInMonth,
  dateToIsoDate,
  daysInMonth,
  formatIsoDate,
  isIsoDate,
  isoDateToCompetenceMonth,
  isoDateToDate,
  monthsBetween,
  parseIsoDate,
  todayIsoDate,
} from './calendar.ts'

describe('datas ISO', () => {
  it('valida datas reais', () => {
    expect(isIsoDate('2026-11-07')).toBe(true)
    expect(isIsoDate('2028-02-29')).toBe(true)
    expect(isIsoDate('2026-02-29')).toBe(false)
    expect(isIsoDate('2026-13-01')).toBe(false)
    expect(isIsoDate('2026-1-01')).toBe(false)
    expect(isIsoDate(20261107)).toBe(false)
  })

  it('converte entre texto, partes e Date UTC', () => {
    expect(parseIsoDate('2026-11-07')).toEqual({ year: 2026, month: 11, day: 7 })
    expect(formatIsoDate({ year: 2026, month: 1, day: 5 })).toBe('2026-01-05')
    expect(isoDateToDate('2026-11-07').toISOString()).toBe('2026-11-07T00:00:00.000Z')
    expect(dateToIsoDate(new Date('2026-11-07T00:00:00Z'))).toBe('2026-11-07')
    expect(isoDateToCompetenceMonth('2026-11-30')).toBe('2026-11')
  })

  it('rejeita datas inválidas', () => {
    expect(() => parseIsoDate('2026-02-30')).toThrow('Data inválida')
    expect(() => formatIsoDate({ year: 2026, month: 2, day: 30 })).toThrow('Data inválida')
    expect(() => dateToIsoDate(new Date('x'))).toThrow('Data inválida')
  })

  it('dia inexistente no mês vira o último dia', () => {
    expect(daysInMonth(2026, 2)).toBe(28)
    expect(daysInMonth(2028, 2)).toBe(29)
    expect(dateInMonth('2026-02', 31)).toBe('2026-02-28')
    expect(dateInMonth('2026-04', 31)).toBe('2026-04-30')
    expect(dateInMonth('2026-11', 5)).toBe('2026-11-05')
    expect(() => dateInMonth('2026-11', 0)).toThrow('Dia inválido')
  })

  it('hoje respeita o fuso de São Paulo', () => {
    // 02:00 UTC do dia 8 ainda é dia 7 em São Paulo (UTC−3).
    expect(todayIsoDate(new Date('2026-11-08T02:00:00Z'))).toBe('2026-11-07')
    expect(todayIsoDate(new Date('2026-11-08T03:00:00Z'))).toBe('2026-11-08')
  })

  it('compara e mede distância entre meses', () => {
    expect(compareMonths('2026-01', '2026-02')).toBeLessThan(0)
    expect(compareMonths('2026-02', '2026-02')).toBe(0)
    expect(compareMonths('2027-01', '2026-12')).toBeGreaterThan(0)
    expect(monthsBetween('2026-11', '2027-02')).toBe(3)
    expect(monthsBetween('2026-11', '2026-09')).toBe(-2)
  })
})
