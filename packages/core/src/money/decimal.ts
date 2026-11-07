import DecimalJs from 'decimal.js'

/**
 * Decimal do Orla: mesma lib que o Prisma usa (decimal.js), com precisão alta e
 * arredondamento bancário (half-even) como padrão — ver docs/03 e docs/05.
 *
 * Aceita instâncias do Decimal do Prisma como entrada (decimal.js reconhece
 * instâncias de outros "clones" pela tag interna).
 */
export const Decimal = DecimalJs.clone({
  precision: 40,
  rounding: DecimalJs.ROUND_HALF_EVEN,
  toExpNeg: -20,
  toExpPos: 30,
})

export type Decimal = InstanceType<typeof Decimal>

/** Valores aceitos para criar um Decimal: string, number ou outro Decimal. */
export type DecimalInput = DecimalJs.Value

export function toDecimal(value: DecimalInput): Decimal {
  const decimal = new Decimal(value)
  if (!decimal.isFinite()) {
    throw new RangeError(`Valor decimal inválido: ${String(value)}`)
  }
  return decimal
}
