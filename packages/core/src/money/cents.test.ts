import { describe, expect, it } from 'vitest'
import {
  MoneyError,
  addCents,
  assertCents,
  centsToReais,
  isCents,
  multiplyCents,
  percentOfCents,
  quantityTimesPriceToCents,
  reaisToCents,
  splitCents,
  subtractCents,
  sumCents,
} from './cents.ts'
import { Decimal, toDecimal } from './decimal.ts'

describe('isCents / assertCents', () => {
  it('aceita inteiros seguros', () => {
    expect(isCents(0)).toBe(true)
    expect(isCents(-150)).toBe(true)
    expect(isCents(Number.MAX_SAFE_INTEGER)).toBe(true)
  })

  it('rejeita float, NaN, Infinity, inteiros inseguros e não-números', () => {
    for (const value of [
      0.1,
      10.5,
      Number.NaN,
      Infinity,
      Number.MAX_SAFE_INTEGER + 1,
      '10',
      null,
    ]) {
      expect(isCents(value)).toBe(false)
    }
    expect(() => assertCents(10.5, 'preço')).toThrow(/preço precisa ser um inteiro/)
    expect(() => assertCents(10.5)).toThrow(MoneyError)
  })
})

describe('reaisToCents', () => {
  it('converte reais em centavos exatos', () => {
    expect(reaisToCents('1234.56')).toBe(123456)
    expect(reaisToCents(0)).toBe(0)
    expect(reaisToCents('-10.5')).toBe(-1050)
  })

  it('não sofre com imprecisão de float (0.1 + 0.2)', () => {
    expect(reaisToCents(new Decimal('0.1').plus('0.2'))).toBe(30)
    expect(reaisToCents(1.005)).toBe(100) // 100.5 → half-even → 100
  })

  it('arredonda half-even (bancário) na 3ª casa', () => {
    expect(reaisToCents('0.005')).toBe(0) // 0.5 → 0 (par)
    expect(reaisToCents('0.015')).toBe(2) // 1.5 → 2 (par)
    expect(reaisToCents('0.025')).toBe(2) // 2.5 → 2 (par)
    expect(reaisToCents('0.0251')).toBe(3)
    expect(reaisToCents('-0.015')).toBe(-2)
  })

  it('normaliza -0 para 0', () => {
    expect(Object.is(reaisToCents('-0.001'), 0)).toBe(true)
  })

  it('lança erro para valores inválidos ou grandes demais', () => {
    expect(() => reaisToCents('abc')).toThrow()
    expect(() => reaisToCents(Infinity)).toThrow(RangeError)
    expect(() => reaisToCents('1e20')).toThrow(MoneyError)
  })
})

describe('centsToReais', () => {
  it('devolve Decimal exato', () => {
    expect(centsToReais(123456).toFixed(2)).toBe('1234.56')
    expect(centsToReais(-5).toString()).toBe('-0.05')
  })

  it('rejeita centavos não inteiros', () => {
    expect(() => centsToReais(1.5)).toThrow(MoneyError)
  })
})

describe('soma e subtração', () => {
  it('soma listas, incluindo vazia', () => {
    expect(sumCents([100, 250, -50])).toBe(300)
    expect(sumCents([])).toBe(0)
    expect(addCents(10, 20)).toBe(30)
    expect(subtractCents(10, 25)).toBe(-15)
  })

  it('detecta overflow e itens inválidos', () => {
    expect(() => sumCents([Number.MAX_SAFE_INTEGER, 1])).toThrow(/soma/)
    expect(() => sumCents([1, 0.5])).toThrow(MoneyError)
    expect(() => subtractCents(1, 0.5)).toThrow(MoneyError)
  })
})

describe('multiplyCents / percentOfCents', () => {
  it('multiplica com half-even', () => {
    expect(multiplyCents(1000, '1.5')).toBe(1500)
    expect(multiplyCents(5, '0.5')).toBe(2) // 2.5 → 2
    expect(multiplyCents(7, '0.5')).toBe(4) // 3.5 → 4
    expect(multiplyCents(-7, '0.5')).toBe(-4)
  })

  it('calcula percentual em pontos percentuais', () => {
    expect(percentOfCents(600000, 30)).toBe(180000)
    expect(percentOfCents(1001, '33.3333')).toBe(334) // 333.666... → 334
    expect(percentOfCents(100, 0)).toBe(0)
  })

  it('rejeita centavos inválidos', () => {
    expect(() => multiplyCents(10.1, 2)).toThrow(MoneyError)
  })
})

describe('quantityTimesPriceToCents', () => {
  it('arredonda só no final (half-even)', () => {
    expect(quantityTimesPriceToCents('3', '7.005')).toBe(2102) // 2101.5 → 2102
    expect(quantityTimesPriceToCents('1', '0.125')).toBe(12) // 12.5 → 12
    expect(quantityTimesPriceToCents('0.00012345', '350000')).toBe(4321) // 43.2075 → 4321
    expect(quantityTimesPriceToCents('100', '9.87')).toBe(98700)
  })

  it('aceita o Decimal do Prisma/decimal.js como entrada', () => {
    expect(quantityTimesPriceToCents(toDecimal('2'), new Decimal('10.10'))).toBe(2020)
  })
})

describe('splitCents (RF-41: resto na 1ª parcela)', () => {
  it('divide exato', () => {
    expect(splitCents(120000, 12)).toEqual(Array(12).fill(10000))
  })

  it('coloca o resto dos centavos na primeira parte', () => {
    const parts = splitCents(100000, 3)
    expect(parts).toEqual([33334, 33333, 33333])
    expect(sumCents(parts)).toBe(100000)
  })

  it('parcela única devolve o total', () => {
    expect(splitCents(9999, 1)).toEqual([9999])
  })

  it('total menor que o número de partes', () => {
    expect(splitCents(2, 3)).toEqual([2, 0, 0])
    expect(splitCents(0, 2)).toEqual([0, 0])
  })

  it('total negativo mantém o sinal e a soma', () => {
    const parts = splitCents(-1000, 3)
    expect(parts).toEqual([-334, -333, -333])
    expect(sumCents(parts)).toBe(-1000)
  })

  it('rejeita partes inválidas e total não inteiro', () => {
    expect(() => splitCents(100, 0)).toThrow(MoneyError)
    expect(() => splitCents(100, 1.5)).toThrow(MoneyError)
    expect(() => splitCents(100.5, 2)).toThrow(MoneyError)
  })
})
