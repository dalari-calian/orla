import { describe, expect, it } from 'vitest'
import { MoneyError } from './cents.ts'
import { HIDDEN_MONEY, formatBRL, formatBRLIntl, formatBRLParts } from './format.ts'

const NBSP = String.fromCharCode(0x00a0)

describe('formatBRL', () => {
  it('formata em pt-BR com milhar e centavos', () => {
    expect(formatBRL(123456)).toBe('R$ 1.234,56')
    expect(formatBRL(0)).toBe('R$ 0,00')
    expect(formatBRL(5)).toBe('R$ 0,05')
    expect(formatBRL(100000000)).toBe('R$ 1.000.000,00')
  })

  it('negativos com sinal antes do símbolo', () => {
    expect(formatBRL(-1050)).toBe('-R$ 10,50')
  })

  it('signDisplay para receitas', () => {
    expect(formatBRL(1050, { signDisplay: 'always' })).toBe('+R$ 10,50')
    expect(formatBRL(0, { signDisplay: 'always' })).toBe('+R$ 0,00')
    expect(formatBRL(0, { signDisplay: 'exceptZero' })).toBe('R$ 0,00')
    expect(formatBRL(1050, { signDisplay: 'exceptZero' })).toBe('+R$ 10,50')
    expect(formatBRL(-1050, { signDisplay: 'never' })).toBe('R$ 10,50')
  })

  it('oculta valores', () => {
    expect(formatBRL(123456, { hidden: true })).toBe(HIDDEN_MONEY)
  })

  it('bate com o Intl (exceto pelo espaço não separável)', () => {
    for (const cents of [0, 1, 99, 123456, -987654321]) {
      expect(formatBRLIntl(cents).replaceAll(NBSP, ' ')).toBe(formatBRL(cents))
    }
  })

  it('rejeita valores que não são centavos inteiros', () => {
    expect(() => formatBRL(10.5)).toThrow(MoneyError)
    expect(() => formatBRLIntl(10.5)).toThrow(MoneyError)
  })
})

describe('formatBRLParts (número herói)', () => {
  it('separa inteiro e centavos', () => {
    expect(formatBRLParts(1248032)).toEqual({
      sign: '',
      symbol: 'R$',
      integer: '12.480',
      fraction: '32',
    })
  })

  it('sinal', () => {
    expect(formatBRLParts(-7).sign).toBe('-')
    expect(formatBRLParts(-7).fraction).toBe('07')
    expect(formatBRLParts(7, { signDisplay: 'always' }).sign).toBe('+')
  })
})
