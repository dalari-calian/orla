import { Decimal, toDecimal, type DecimalInput } from './decimal.ts'

/**
 * Valor monetário em CENTAVOS inteiros (R$ 1.234,56 → 123456).
 * Regra inegociável do projeto: dinheiro nunca é float.
 */
export type Cents = number

export class MoneyError extends RangeError {
  override name = 'MoneyError'
}

export function isCents(value: unknown): value is Cents {
  return typeof value === 'number' && Number.isSafeInteger(value)
}

/** Garante que o valor é um inteiro seguro de centavos; lança MoneyError caso contrário. */
export function assertCents(value: unknown, label = 'valor'): asserts value is Cents {
  if (!isCents(value)) {
    throw new MoneyError(`${label} precisa ser um inteiro de centavos, recebido: ${String(value)}`)
  }
}

/** Converte um Decimal (já em centavos) em Cents, arredondando half-even. */
function decimalToCents(value: Decimal): Cents {
  const rounded = value.toDecimalPlaces(0, Decimal.ROUND_HALF_EVEN).toNumber()
  // `rounded + 0` normaliza -0 para 0.
  const cents = rounded + 0
  assertCents(cents, 'resultado')
  return cents
}

/** Reais (ex.: "1234.56", 10.5, Decimal) → centavos, com arredondamento half-even. */
export function reaisToCents(reais: DecimalInput): Cents {
  return decimalToCents(toDecimal(reais).times(100))
}

/** Centavos → reais como Decimal exato (para cálculos com quantidades/preços). */
export function centsToReais(cents: Cents): Decimal {
  assertCents(cents)
  return new Decimal(cents).dividedBy(100)
}

/** Soma de centavos com verificação de overflow (Number.MAX_SAFE_INTEGER). */
export function sumCents(values: readonly Cents[]): Cents {
  let total = 0
  for (const value of values) {
    assertCents(value)
    total += value
  }
  assertCents(total, 'soma')
  return total
}

export function addCents(a: Cents, b: Cents): Cents {
  return sumCents([a, b])
}

export function subtractCents(a: Cents, b: Cents): Cents {
  assertCents(b)
  return sumCents([a, -b])
}

/** Multiplica centavos por um fator decimal (ex.: 1.5, "0.3333") com arredondamento half-even. */
export function multiplyCents(cents: Cents, factor: DecimalInput): Cents {
  assertCents(cents)
  return decimalToCents(new Decimal(cents).times(toDecimal(factor)))
}

/**
 * Percentual de um valor. `percent` em pontos percentuais (30 = 30%), como no banco
 * (`numeric(7,4)`). Arredondamento half-even.
 */
export function percentOfCents(cents: Cents, percent: DecimalInput): Cents {
  return multiplyCents(cents, toDecimal(percent).dividedBy(100))
}

/**
 * Quantidade × preço unitário (em reais) → centavos, arredondando só no final
 * (half-even). Ex.: 3 cotas × R$ 7,005 = R$ 21,015 → 2102 centavos.
 */
export function quantityTimesPriceToCents(quantity: DecimalInput, unitPrice: DecimalInput): Cents {
  return decimalToCents(toDecimal(quantity).times(toDecimal(unitPrice)).times(100))
}

/**
 * Divide um total em `parts` partes inteiras de centavos que somam exatamente o total.
 * Cada parte recebe floor(total / parts) e o resto vai para a PRIMEIRA parte
 * (RF-41: padrão de mercado em parcelamentos). Totais negativos são divididos pelo
 * valor absoluto e o sinal é reaplicado.
 */
export function splitCents(total: Cents, parts: number): Cents[] {
  assertCents(total, 'total')
  if (!Number.isSafeInteger(parts) || parts < 1) {
    throw new MoneyError(`Número de partes precisa ser um inteiro ≥ 1, recebido: ${parts}`)
  }
  const sign = total < 0 ? -1 : 1
  const absolute = Math.abs(total)
  const base = Math.floor(absolute / parts)
  const remainder = absolute - base * parts
  return Array.from({ length: parts }, (_, index) => {
    const value = index === 0 ? base + remainder : base
    return sign * value + 0
  })
}
