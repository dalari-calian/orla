import { assertCents, type Cents } from './cents.ts'

const BRL = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

/** Máscara usada quando o usuário liga "ocultar valores". */
export const HIDDEN_MONEY = 'R$ ••••'

export type SignDisplay = 'auto' | 'always' | 'exceptZero' | 'never'

export interface FormatBRLOptions {
  /** `always`/`exceptZero` mostram "+" em positivos (ex.: receitas). Padrão: `auto`. */
  signDisplay?: SignDisplay
  /** Quando true, devolve a máscara "R$ ••••" no lugar do valor. */
  hidden?: boolean
}

export interface BRLParts {
  /** "", "-" ou "+". */
  sign: '' | '-' | '+'
  symbol: 'R$'
  /** Parte inteira com separador de milhar: "12.480". */
  integer: string
  /** Centavos com 2 dígitos: "32". */
  fraction: string
}

/**
 * Quebra um valor em partes para o "número herói" (centavos menores):
 * 1248032 → { sign: '', symbol: 'R$', integer: '12.480', fraction: '32' }.
 */
export function formatBRLParts(
  cents: Cents,
  options: Pick<FormatBRLOptions, 'signDisplay'> = {},
): BRLParts {
  assertCents(cents)
  const signDisplay = options.signDisplay ?? 'auto'
  const absolute = Math.abs(cents)
  const integer = Math.trunc(absolute / 100)
  const fraction = absolute % 100

  let sign: BRLParts['sign'] = ''
  if (cents < 0 && signDisplay !== 'never') sign = '-'
  else if (cents > 0 && (signDisplay === 'always' || signDisplay === 'exceptZero')) sign = '+'
  else if (cents === 0 && signDisplay === 'always') sign = '+'

  return {
    sign,
    symbol: 'R$',
    integer: new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 0 }).format(integer),
    fraction: String(fraction).padStart(2, '0'),
  }
}

/**
 * Formata centavos em BRL pt-BR: 123456 → "R$ 1.234,56".
 * Usa espaço comum entre "R$" e o número (o Intl usa NBSP; normalizamos para
 * evitar surpresa em comparações e testes).
 */
export function formatBRL(cents: Cents, options: FormatBRLOptions = {}): string {
  assertCents(cents)
  if (options.hidden) return HIDDEN_MONEY
  const { sign, integer, fraction } = formatBRLParts(cents, options)
  return `${sign}R$ ${integer},${fraction}`
}

/** Formata direto com o Intl (útil para conferência); mantém o NBSP original. */
export function formatBRLIntl(cents: Cents): string {
  assertCents(cents)
  return BRL.format(cents / 100)
}
