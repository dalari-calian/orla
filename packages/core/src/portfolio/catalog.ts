/**
 * Classes de ativo padrão (RC-01): criadas no cadastro, editáveis. Renda Fixa e Reserva de
 * Emergência são a mesma classe (decisão explícita, docs/05).
 */
import { PALETTE } from '../finance/catalog.ts'

export const ASSET_CLASS_KINDS = [
  'fixed_income',
  'reit',
  'stock',
  'etf',
  'international',
  'crypto',
  'other',
] as const
export type AssetClassKind = (typeof ASSET_CLASS_KINDS)[number]

export interface DefaultAssetClass {
  name: string
  kind: AssetClassKind
  color: string
}

const [blue, green, orange, purple, , teal] = PALETTE

export const DEFAULT_ASSET_CLASSES: readonly DefaultAssetClass[] = [
  { name: 'Renda Fixa / Reserva', kind: 'fixed_income', color: blue },
  { name: 'FIIs', kind: 'reit', color: green },
  { name: 'Ações', kind: 'stock', color: orange },
  { name: 'Exterior', kind: 'international', color: purple },
  { name: 'Cripto', kind: 'crypto', color: teal },
]

/** Classes cujo valor vem do saldo informado (sem cotação automática). */
export function isManualQuoteKind(kind: AssetClassKind): boolean {
  return kind === 'fixed_income'
}

export const DIVIDEND_KINDS = ['dividend', 'jcp', 'income', 'interest', 'other'] as const
export type DividendKind = (typeof DIVIDEND_KINDS)[number]

/** Ticker da B3 (PETR4, MXRF11, BOVA11, BPAC11) ou do exterior simples (AAPL). */
export function normalizeTicker(value: string): string {
  return value.trim().toUpperCase().replace(/\s+/g, '')
}

export function isTicker(value: string): boolean {
  return /^[A-Z0-9]{3,8}(\.[A-Z]{1,3})?$/.test(normalizeTicker(value))
}
