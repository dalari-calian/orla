import type { AssetClassKindValue, TradeKindValue } from '@orla/contracts'

export const assetClassKindLabels: Record<AssetClassKindValue, string> = {
  fixed_income: 'Renda fixa',
  reit: 'FIIs',
  stock: 'Ações',
  etf: 'ETFs',
  international: 'Exterior',
  crypto: 'Cripto',
  other: 'Outros',
}

export const tradeKindLabels: Record<TradeKindValue, string> = {
  buy: 'Compra',
  sell: 'Venda',
  bonus: 'Bonificação',
  split: 'Desdobramento',
  reverse_split: 'Grupamento',
  subscription: 'Subscrição',
  fixed_income_deposit: 'Aplicação',
  fixed_income_withdrawal: 'Resgate',
  position_set: 'Ajuste de posição',
}

export const dividendKindLabels = {
  dividend: 'Dividendo',
  jcp: 'JCP',
  income: 'Rendimento',
  interest: 'Juros',
  other: 'Outro',
} as const

const quantityFormat = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 8 })
const priceFormat = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
  minimumFractionDigits: 2,
  maximumFractionDigits: 4,
})
const percentFormat = new Intl.NumberFormat('pt-BR', {
  style: 'percent',
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
})

/** "1.234,5" — quantidades sem zeros à toa. */
export function formatQuantity(value: string | number): string {
  return quantityFormat.format(Number(value))
}

/** Preço unitário em reais ("R$ 9,73", até 4 casas). */
export function formatPrice(value: string | number | null): string {
  return value === null ? '—' : priceFormat.format(Number(value))
}

/** Fração → "12,5%"; null → "—". */
export function formatPercent(value: number | null, signed = false): string {
  if (value === null || !Number.isFinite(value)) return '—'
  const text = percentFormat.format(value)
  return signed && value > 0 ? `+${text}` : text
}

const timeFormat = new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit' })
const dayFormat = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'short' })

/** "agora", "há 25 min", "há 3 h", "ontem às 18:30", "12 de nov." (RC-33). */
export function relativeTime(iso: string | null, now = new Date()): string {
  if (!iso) return 'sem cotação'
  const date = new Date(iso)
  const minutes = Math.round((now.getTime() - date.getTime()) / 60_000)
  if (minutes < 1) return 'agora'
  if (minutes < 60) return `há ${minutes} min`
  if (minutes < 12 * 60) return `há ${Math.round(minutes / 60)} h`
  const yesterday = new Date(now)
  yesterday.setDate(now.getDate() - 1)
  if (date.toDateString() === yesterday.toDateString()) return `ontem às ${timeFormat.format(date)}`
  if (date.toDateString() === now.toDateString()) return `hoje às ${timeFormat.format(date)}`
  return dayFormat.format(date)
}

/** Ticker ou nome, o que identificar melhor. */
export function assetLabel(asset: { ticker: string | null; name: string }): string {
  return asset.ticker ?? asset.name
}
