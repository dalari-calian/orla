import { describe, expect, it } from 'vitest'
import {
  statementClosingMonth,
  statementCompetenceMonth,
  statementDates,
  statementStatus,
} from './card-statement.ts'

// Nubank Roxinho do seed: fecha dia 3, vence dia 10.
const nubank = { closingDay: 3, dueDay: 10 }
// Cartão que fecha no fim do mês e vence no começo do seguinte.
const lateClosing = { closingDay: 31, dueDay: 7 }

describe('RF-30 — em qual fatura a compra cai', () => {
  it('compra antes do fechamento cai na fatura deste mês', () => {
    expect(statementClosingMonth('2026-11-02', nubank)).toBe('2026-11')
    expect(statementCompetenceMonth('2026-11-02', nubank)).toBe('2026-11')
  })

  it('compra no dia do fechamento cai na fatura seguinte', () => {
    expect(statementClosingMonth('2026-11-03', nubank)).toBe('2026-12')
    expect(statementCompetenceMonth('2026-11-03', nubank)).toBe('2026-12')
  })

  it('vira o ano', () => {
    expect(statementCompetenceMonth('2026-12-20', nubank)).toBe('2027-01')
  })

  it('fechamento dia 31 em fevereiro fecha no último dia do mês', () => {
    expect(statementClosingMonth('2026-02-27', lateClosing)).toBe('2026-02')
    // 28/02 é o dia do fechamento em 2026 → próxima fatura.
    expect(statementClosingMonth('2026-02-28', lateClosing)).toBe('2026-03')
    expect(statementDates('2026-02', lateClosing, 'closing_month').closingDate).toBe('2026-02-28')
  })

  it('vencimento antes do fechamento → vence no mês seguinte ao fechamento', () => {
    // Fecha 31/01, vence 07/02 → competência (vencimento) = fevereiro.
    expect(statementCompetenceMonth('2026-01-15', lateClosing)).toBe('2026-02')
    expect(statementCompetenceMonth('2026-01-15', lateClosing, 'closing_month')).toBe('2026-01')
  })
})

describe('datas e situação da fatura', () => {
  it('fechamento e vencimento da competência (padrão: mês do vencimento)', () => {
    expect(statementDates('2026-11', nubank)).toEqual({
      closingDate: '2026-11-03',
      dueDate: '2026-11-10',
    })
    expect(statementDates('2026-02', lateClosing)).toEqual({
      closingDate: '2026-01-31',
      dueDate: '2026-02-07',
    })
  })

  it('competência pelo mês do fechamento', () => {
    expect(statementDates('2026-01', lateClosing, 'closing_month')).toEqual({
      closingDate: '2026-01-31',
      dueDate: '2026-02-07',
    })
  })

  it('aberta antes do fechamento, fechada depois, paga quando tudo está realizado', () => {
    const base = { closingDate: '2026-11-03', transactionCount: 2, allSettled: false }
    expect(statementStatus({ ...base, today: '2026-11-02' })).toBe('open')
    expect(statementStatus({ ...base, today: '2026-11-03' })).toBe('closed')
    expect(statementStatus({ ...base, today: '2026-11-03', allSettled: true })).toBe('paid')
    // Sem lançamentos não há o que pagar.
    expect(
      statementStatus({ ...base, today: '2026-11-04', transactionCount: 0, allSettled: true }),
    ).toBe('closed')
  })
})
