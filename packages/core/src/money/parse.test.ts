import { describe, expect, it } from 'vitest'
import { MoneyParseError, parseBRL, tryParseBRL } from './parse.ts'

const NBSP = String.fromCharCode(0x00a0)
const NARROW_NBSP = String.fromCharCode(0x202f)
const MINUS_SIGN = String.fromCharCode(0x2212)

describe('parseBRL', () => {
  it.each([
    ['1.234,56', 123456],
    ['R$ 1.234,56', 123456],
    [`R$${NBSP}1.234,56`, 123456],
    [`R$${NARROW_NBSP}1.234,56`, 123456],
    ['r$10', 1000],
    ['1234,56', 123456],
    ['1234', 123400],
    ['0,05', 5],
    [',50', 50],
    ['10,5', 1050],
    ['10,', 1000],
    ['  25,00  ', 2500],
    ['1.000.000,00', 100000000],
    ['+10', 1000],
  ])('"%s" → %i centavos', (input, expected) => {
    expect(parseBRL(input)).toBe(expected)
  })

  it.each([
    ['-10,00', -1000],
    ['-R$ 10,00', -1000],
    ['R$ -10,00', -1000],
    [`${MINUS_SIGN}10,00`, -1000],
    ['(10,00)', -1000],
    ['10,00-', -1000],
  ])('negativo "%s" → %i', (input, expected) => {
    expect(parseBRL(input)).toBe(expected)
  })

  it('ponto sem vírgula: grupos de 3 = milhar; 1–2 casas = decimal', () => {
    expect(parseBRL('1.500')).toBe(150000)
    expect(parseBRL('1.234.567')).toBe(123456700)
    expect(parseBRL('10.5')).toBe(1050)
    expect(parseBRL('10.50')).toBe(1050)
    expect(parseBRL('.5')).toBe(50)
  })

  it('zero não vira -0', () => {
    expect(Object.is(parseBRL('-0,00'), 0)).toBe(true)
  })

  it.each([
    '',
    '   ',
    'abc',
    'R$',
    ',',
    '12,345', // mais de 2 casas
    '1,2,3', // duas vírgulas
    '12.34.5', // milhar inválido
    '1.23,45', // milhar inválido
    '1.2345', // ponto ambíguo
    '10,a',
    '10 reais',
    '1e5',
  ])('rejeita "%s"', (input) => {
    expect(() => parseBRL(input)).toThrow(MoneyParseError)
  })

  it('rejeita valores acima do limite seguro', () => {
    expect(() => parseBRL('999.999.999.999.999.999,00')).toThrow()
  })
})

describe('tryParseBRL', () => {
  it('devolve null em vez de lançar', () => {
    expect(tryParseBRL('abc')).toBeNull()
    expect(tryParseBRL('999999999999999999')).toBeNull()
    expect(tryParseBRL('1,50')).toBe(150)
  })
})
