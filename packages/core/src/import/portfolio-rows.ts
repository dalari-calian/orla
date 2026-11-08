/**
 * Templates da carteira (docs/08 › Templates oficiais): Ativos, Operações e Proventos.
 * Cada linha vira um rascunho; ativos são referenciados pelo ticker (ou nome, na renda fixa).
 */
import { isTicker, normalizeTicker } from '../portfolio/catalog.ts'
import { tradeTotalCents } from '../portfolio/position.ts'
import type {
  AssetClassKindRef,
  AssetDraft,
  AssetRef,
  AssetTradeDraft,
  AssetTradeKindRef,
  DividendDraft,
  ParsedImportRow,
} from './drafts.ts'
import type { ImportField } from './mapping.ts'
import { type Cell, cellText, normalizeText, parseImportAmount, parseImportDate } from './text.ts'

export const ASSET_FIELDS: readonly ImportField[] = [
  {
    key: 'classe',
    label: 'Classe',
    required: true,
    synonyms: ['classe', 'tipo de ativo', 'categoria', 'classe do ativo'],
  },
  {
    key: 'ticker',
    label: 'Ticker',
    required: false,
    synonyms: ['ticker', 'codigo', 'ativo', 'papel'],
  },
  { key: 'nome', label: 'Nome', required: false, synonyms: ['nome', 'descricao', 'titulo'] },
  {
    key: 'corretora',
    label: 'Corretora',
    required: false,
    synonyms: ['corretora', 'banco', 'instituicao', 'conta'],
  },
  { key: 'indexador', label: 'Indexador', required: false, synonyms: ['indexador', 'indice'] },
  { key: 'taxa', label: 'Taxa', required: false, synonyms: ['taxa', 'rentabilidade'] },
  {
    key: 'vencimento',
    label: 'Vencimento',
    required: false,
    synonyms: ['vencimento', 'data de vencimento'],
  },
  {
    key: 'peso_meta_classe',
    label: 'Peso na classe (%)',
    required: false,
    synonyms: ['peso meta classe', 'peso na classe', 'peso'],
  },
  {
    key: 'teto_carteira',
    label: 'Teto na carteira (%)',
    required: false,
    synonyms: ['teto carteira', 'teto', 'teto na carteira'],
  },
]

export const TRADE_FIELDS: readonly ImportField[] = [
  {
    key: 'data',
    label: 'Data',
    required: true,
    synonyms: ['data', 'data da operacao', 'data pregao', 'pregao'],
  },
  {
    key: 'ticker_ou_nome',
    label: 'Ticker ou nome',
    required: true,
    synonyms: ['ticker ou nome', 'ticker', 'ativo', 'codigo', 'papel', 'nome'],
  },
  {
    key: 'corretora',
    label: 'Corretora',
    required: false,
    synonyms: ['corretora', 'banco', 'instituicao'],
  },
  {
    key: 'tipo',
    label: 'Tipo',
    required: false,
    synonyms: ['tipo', 'operacao', 'c/v', 'compra/venda'],
  },
  {
    key: 'quantidade',
    label: 'Quantidade',
    required: false,
    synonyms: ['quantidade', 'qtde', 'qtd', 'cotas'],
  },
  {
    key: 'preco',
    label: 'Preço',
    required: false,
    synonyms: ['preco', 'preco unitario', 'valor unitario', 'pu', 'cotacao'],
  },
  {
    key: 'taxas',
    label: 'Taxas',
    required: false,
    synonyms: ['taxas', 'corretagem', 'custos', 'emolumentos'],
  },
  {
    key: 'valor_total',
    label: 'Valor total',
    required: false,
    synonyms: ['valor total', 'total', 'valor'],
  },
]

export const DIVIDEND_FIELDS: readonly ImportField[] = [
  {
    key: 'data_pagamento',
    label: 'Data do pagamento',
    required: true,
    synonyms: ['data pagamento', 'data de pagamento', 'pagamento', 'data'],
  },
  {
    key: 'ticker',
    label: 'Ticker',
    required: true,
    synonyms: ['ticker', 'ativo', 'codigo', 'papel'],
  },
  { key: 'tipo', label: 'Tipo', required: false, synonyms: ['tipo', 'evento', 'provento'] },
  {
    key: 'valor',
    label: 'Valor',
    required: true,
    synonyms: ['valor', 'valor liquido', 'liquido', 'valor recebido'],
  },
]

/** "FIIs", "Ações", "Renda Fixa" → tipo da classe (o nome também é guardado). */
export function classKindFromName(value: string): AssetClassKindRef | null {
  const text = normalizeText(value)
  if (!text) return null
  if (/^fii|fundos? imobiliario/.test(text)) return 'reit'
  if (/^aco|^acao/.test(text)) return 'stock'
  if (/^etf/.test(text)) return 'etf'
  if (/renda fixa|reserva|tesouro|cdb|lci|lca/.test(text)) return 'fixed_income'
  if (/exterior|internacional|bdr|stocks/.test(text)) return 'international'
  if (/cripto|bitcoin|btc/.test(text)) return 'crypto'
  return null
}

function tradeKindFromText(value: string, fixed: boolean): AssetTradeKindRef | null | undefined {
  const text = normalizeText(value)
  if (!text) return null
  if (/^(c|compra|buy)$/.test(text)) return fixed ? 'fixed_income_deposit' : 'buy'
  if (/^(v|venda|sell)$/.test(text)) return fixed ? 'fixed_income_withdrawal' : 'sell'
  if (/^bonifica/.test(text)) return 'bonus'
  if (/^desdobr/.test(text)) return 'split'
  if (/^grupament/.test(text)) return 'reverse_split'
  if (/^subscri/.test(text)) return 'subscription'
  if (/^(aplicacao|deposito|aporte)$/.test(text)) return 'fixed_income_deposit'
  if (/^(resgate|retirada)$/.test(text)) return 'fixed_income_withdrawal'
  if (/^(ajuste|posicao|saldo inicial)/.test(text)) return 'position_set'
  return undefined
}

const decimal = (cell: Cell): string | null => {
  if (typeof cell === 'number') return Number.isFinite(cell) && cell >= 0 ? String(cell) : null
  const text = cellText(cell).replace(/^R\$\s*/i, '')
  if (!text) return null
  const normalized = text.includes(',') ? text.replace(/\./g, '').replace(',', '.') : text
  return /^\d+(\.\d+)?$/.test(normalized) ? normalized : null
}

function rawOf(values: Record<string, Cell>): Record<string, string> {
  const out: Record<string, string> = {}
  for (const [key, cell] of Object.entries(values)) {
    const text = cellText(cell)
    if (text) out[key] = text.slice(0, 200)
  }
  return out
}

function refFrom(label: string, accountName: string | null): AssetRef {
  const ticker = isTicker(label) ? normalizeTicker(label) : null
  return { ticker, name: ticker ?? label.trim(), classKind: null, className: null, accountName }
}

/** Linha do template "Ativos". */
export function assetRowToDraft(rowNumber: number, values: Record<string, Cell>): ParsedImportRow {
  const raw = rawOf(values)
  const base = { rowNumber, sourceRows: [rowNumber], raw, warnings: [] as string[], skipped: null }
  if (Object.keys(raw).length === 0)
    return { ...base, draft: null, errors: [], skipped: 'Linha vazia' }
  const errors: string[] = []
  const className = cellText(values.classe)
  if (!className) errors.push('Informe a classe')
  const tickerText = cellText(values.ticker)
  const name = cellText(values.nome).slice(0, 80)
  if (tickerText && !isTicker(tickerText)) errors.push(`Ticker inválido: "${tickerText}"`)
  if (!tickerText && !name) errors.push('Informe o ticker ou o nome')
  const maturity = parseImportDate(values.vencimento)
  if (!maturity.ok) errors.push(maturity.error)
  const pct = (cell: Cell) => decimal(cell)
  if (errors.length > 0) return { ...base, draft: null, errors }
  const kind = classKindFromName(className)
  const fixed = kind === 'fixed_income' || (!tickerText && Boolean(name))
  const draft: AssetDraft = {
    kind: 'asset',
    ticker: tickerText ? normalizeTicker(tickerText) : null,
    name: name || normalizeTicker(tickerText),
    classKind: kind,
    className,
    accountName: cellText(values.corretora).slice(0, 80) || null,
    fixedIncome: fixed
      ? {
          indexer: cellText(values.indexador).toUpperCase() || null,
          rate: cellText(values.taxa) || null,
          maturity: maturity.ok ? maturity.value : null,
        }
      : null,
    targetWeightPct: pct(values.peso_meta_classe),
    maxWeightPct: pct(values.teto_carteira),
    manualPrice: null,
    manualPriceAt: null,
    manualValueCents: null,
    manualValueAt: null,
  }
  return { ...base, draft, errors }
}

/** Linha do template "Operações" (RC-20: total = qtd × preço + taxas, se não vier). */
export function tradeRowToDraft(rowNumber: number, values: Record<string, Cell>): ParsedImportRow {
  const raw = rawOf(values)
  const warnings: string[] = []
  const base = { rowNumber, sourceRows: [rowNumber], raw, warnings, skipped: null }
  if (Object.keys(raw).length === 0)
    return { ...base, draft: null, errors: [], skipped: 'Linha vazia' }
  const errors: string[] = []
  const label = cellText(values.ticker_ou_nome)
  if (!label) errors.push('Informe o ticker ou o nome do ativo')
  const fixed = Boolean(label) && !isTicker(label)
  const date = parseImportDate(values.data)
  if (!date.ok) errors.push(date.error)
  else if (!date.value) errors.push('Data vazia')
  let kind = tradeKindFromText(cellText(values.tipo), fixed)
  if (kind === undefined)
    errors.push(`Tipo desconhecido: "${cellText(values.tipo)}" (use compra ou venda)`)
  if (kind === null) {
    kind = fixed ? 'fixed_income_deposit' : 'buy'
    warnings.push('Sem tipo: importado como compra')
  }
  const fees = parseImportAmount(values.taxas)
  if (!fees.ok) errors.push(fees.error)
  const total = parseImportAmount(values.valor_total)
  if (!total.ok) errors.push(total.error)
  let quantity = decimal(values.quantidade)
  let price = decimal(values.preco)
  const split = kind === 'split' || kind === 'reverse_split'
  if (fixed && !quantity) {
    quantity = '1'
    if (!price && total.ok && total.value) price = (Math.abs(total.value) / 100).toFixed(2)
  }
  if (!split && (!quantity || Number(quantity) <= 0)) errors.push('Quantidade inválida')
  if (!split && price === null) errors.push('Preço inválido')
  if (errors.length > 0 || !date.ok || !date.value || !kind) return { ...base, draft: null, errors }
  const feesCents = fees.ok ? Math.abs(fees.value ?? 0) : 0
  const draft: AssetTradeDraft = {
    kind: 'assetTrade',
    asset: refFrom(label, cellText(values.corretora).slice(0, 80) || null),
    tradeKind: kind,
    date: date.value,
    quantity: split ? '0' : (quantity as string),
    unitPrice: split ? '0' : (price as string),
    feesCents,
    totalCents:
      total.ok && total.value
        ? Math.abs(total.value)
        : split
          ? 0
          : kind === 'sell'
            ? Math.max(0, tradeTotalCents(quantity as string, price as string, 0) - feesCents)
            : tradeTotalCents(quantity as string, price as string, feesCents),
    splitRatio: split ? quantity : null,
    notes: null,
  }
  return { ...base, draft, errors }
}

/** Linha do template "Proventos". */
export function dividendRowToDraft(
  rowNumber: number,
  values: Record<string, Cell>,
): ParsedImportRow {
  const raw = rawOf(values)
  const base = { rowNumber, sourceRows: [rowNumber], raw, warnings: [] as string[], skipped: null }
  if (Object.keys(raw).length === 0)
    return { ...base, draft: null, errors: [], skipped: 'Linha vazia' }
  const errors: string[] = []
  const ticker = cellText(values.ticker)
  if (!ticker) errors.push('Informe o ticker')
  const date = parseImportDate(values.data_pagamento)
  if (!date.ok) errors.push(date.error)
  else if (!date.value) errors.push('Data vazia')
  const amount = parseImportAmount(values.valor)
  if (!amount.ok) errors.push(amount.error)
  else if (!amount.value) errors.push('Valor vazio')
  const type = normalizeText(cellText(values.tipo))
  const dividendKind: DividendDraft['dividendKind'] = !type
    ? 'dividend'
    : /^jcp|juros sobre/.test(type)
      ? 'jcp'
      : /^rendimento/.test(type)
        ? 'income'
        : /^juros/.test(type)
          ? 'interest'
          : /^dividendo/.test(type)
            ? 'dividend'
            : 'other'
  if (errors.length > 0 || !date.ok || !date.value || !amount.ok || !amount.value) {
    return { ...base, draft: null, errors }
  }
  const draft: DividendDraft = {
    kind: 'dividend',
    asset: refFrom(ticker, null),
    dividendKind,
    payDate: date.value,
    amountCents: Math.abs(amount.value),
  }
  return { ...base, draft, errors }
}
