/**
 * Leitor da planilha da carteira do dono do projeto (aba "AÇÕES - 2026", docs/08):
 *
 *   linha de título: "FIIS - 30%" | "AÇÕES - 25%" | "RENDA FIXA - 45%"  → metas por classe
 *   blocos de aporte por mês (mês na coluna B):
 *     FIIs (C–F): "MXRF11 - 18/03/2026" | QTDE | VALOR | TOTAL
 *     Ações (G–J): idem
 *     Renda fixa (K–L): "TESOURO 2031 - 18/03/2026" | VALOR
 *   "BALANÇO MENSAL": por mês (B), ativo (C), data (D), preço (E), total (F), quantidade (G)
 *   "PROVENTOS" (I–L, ao lado do balanço): mês, ativo, data, valor
 *   "CONTROLE ..." em diante: ignorado.
 *
 * Como a planilha só tem as compras de 2026, a posição anterior vem do 1º balanço:
 * quantidade do balanço − compras até ele = "posição inicial", com PM editável (decisão do dono).
 */
import { compareMonths, type IsoDate, isoDateToCompetenceMonth } from '../dates/calendar.ts'
import { type CompetenceMonth, formatCompetenceMonth } from '../dates/competence-month.ts'
import { type Cents } from '../money/cents.ts'
import { Decimal, toDecimal } from '../money/decimal.ts'
import { tradeTotalCents } from '../portfolio/position.ts'
import { isTicker, normalizeTicker } from '../portfolio/catalog.ts'
import type {
  AssetDraft,
  BalanceDraft,
  ContributionDraft,
  AssetRef,
  ClassTargetDraft,
  DividendDraft,
  AssetTradeDraft,
  ParsedImportRow,
} from './drafts.ts'
import {
  type Cell,
  cellText,
  monthNumberFromName,
  normalizeText,
  parseImportAmount,
  parseImportDate,
  sameDayInMonth,
} from './text.ts'

type SheetClass = 'reit' | 'stock' | 'fixed_income'

export interface SheetTrade {
  row: number
  month: CompetenceMonth
  classKind: SheetClass
  /** Ticker (bolsa) ou nome (renda fixa), como está na planilha. */
  label: string
  date: IsoDate
  quantity: string | null
  unitPrice: string | null
  totalCents: Cents
  note: string | null
  warnings: string[]
}

export interface SheetBalance {
  row: number
  month: CompetenceMonth
  date: IsoDate
  label: string
  price: string | null
  totalCents: Cents
  quantity: string
}

export interface SheetDividend {
  row: number
  date: IsoDate
  label: string
  amountCents: Cents
}

export interface PortfolioSheetRead {
  trades: SheetTrade[]
  balances: SheetBalance[]
  dividends: SheetDividend[]
  targets: { classKind: SheetClass; targetPct: string }[]
  months: CompetenceMonth[]
}

const GROUPS: { classKind: SheetClass; match: RegExp }[] = [
  { classKind: 'reit', match: /^fii/ },
  { classKind: 'stock', match: /^acoes|^acao/ },
  { classKind: 'fixed_income', match: /^renda fixa/ },
]

/** "MXRF11 - 18/03/2025" → rótulo + data (se houver). */
function splitLabel(text: string): { label: string; date: IsoDate | null } {
  const match = /^(.*?)\s*-\s*(\d{1,2}\/\d{1,2}\/\d{2,4})\s*$/.exec(text)
  if (!match) return { label: text.trim(), date: null }
  const parsed = parseImportDate(match[2] ?? '')
  return { label: (match[1] ?? '').trim(), date: parsed.ok ? parsed.value : null }
}

const decimalOf = (cell: Cell): string | null => {
  if (typeof cell === 'number') return Number.isFinite(cell) && cell > 0 ? String(cell) : null
  const text = cellText(cell).replace(/\./g, '').replace(',', '.')
  return /^\d+(\.\d+)?$/.test(text) && Number(text) > 0 ? text : null
}

/** Passo 1: lê aportes, balanços, proventos e metas da aba. `year` vem do nome da aba. */
export function readPortfolioSheet(
  grid: readonly (readonly Cell[])[],
  year: number,
): PortfolioSheetRead {
  const trades: SheetTrade[] = []
  const balances: SheetBalance[] = []
  const dividends: SheetDividend[] = []
  const targets: PortfolioSheetRead['targets'] = []
  const months: CompetenceMonth[] = []
  let groupColumns: { classKind: SheetClass; col: number }[] = []
  let region: 'trades' | 'balances' | 'done' = 'trades'
  let month: CompetenceMonth | null = null
  let balanceMonth: CompetenceMonth | null = null
  let lastMonthNumber = 0
  let currentYear = year

  const monthFrom = (text: string): CompetenceMonth | null => {
    const number = monthNumberFromName(text)
    if (!number || normalizeText(text).split(' ').length > 2) return null
    return formatCompetenceMonth({ year: currentYear, month: number })
  }

  grid.forEach((cells, index) => {
    const row = index + 1
    const texts = cells.map((cell) => normalizeText(cellText(cell)))
    if (region === 'done') return

    // Título com as classes e metas ("FIIS - 30%").
    if (groupColumns.length === 0) {
      const found: typeof groupColumns = []
      texts.forEach((text, col) => {
        const group = GROUPS.find((item) => item.match.test(text))
        if (!group) return
        found.push({ classKind: group.classKind, col })
        const pct = /(\d+(?:[.,]\d+)?)\s*%/.exec(text)
        if (pct)
          targets.push({ classKind: group.classKind, targetPct: (pct[1] ?? '0').replace(',', '.') })
      })
      if (found.length >= 2) {
        groupColumns = found
        return
      }
    }

    const b = texts[1] ?? ''
    if (b.startsWith('controle')) {
      region = 'done'
      return
    }
    if (b.startsWith('balanco')) {
      region = 'balances'
      return
    }

    if (region === 'trades') {
      const next = b ? monthFrom(cellText(cells[1])) : null
      if (next) {
        const number = monthNumberFromName(cellText(cells[1])) ?? 0
        if (number < lastMonthNumber) {
          currentYear += 1
        }
        lastMonthNumber = number
        month = formatCompetenceMonth({ year: currentYear, month: number })
        months.push(month)
      }
      if (!month) return
      for (const group of groupColumns) {
        const text = cellText(cells[group.col])
        if (!text || /^desc/i.test(normalizeText(text))) continue
        const { label, date } = splitLabel(text)
        if (!label) continue
        const warnings: string[] = []
        let tradeDate = date ?? sameDayInMonth(month, null)
        if (!date) warnings.push('Sem data na planilha: usei o dia 1 do mês')
        // Ano trocado (ex.: "18/03/2025" no bloco de março de 2026): vale o mês/ano do bloco.
        if (
          date &&
          isoDateToCompetenceMonth(date) !== month &&
          date.slice(5, 7) === month.slice(5, 7)
        ) {
          tradeDate = `${month}-${date.slice(8, 10)}` as IsoDate
          warnings.push(`Data ${date.split('-').reverse().join('/')} ajustada para o ano do bloco`)
        }
        // Só a renda fixa (último grupo) tem coluna de anotação à direita (M).
        const note =
          group.classKind === 'fixed_income' &&
          !groupColumns.some((item) => item.col === group.col + 2)
            ? cellText(cells[group.col + 2]) || null
            : null
        if (note) warnings.push(`Anotação na planilha: "${note}" — confira`)
        if (group.classKind === 'fixed_income') {
          const value = parseImportAmount(cells[group.col + 1])
          if (!value.ok || !value.value) continue
          trades.push({
            row,
            month,
            classKind: 'fixed_income',
            label,
            date: tradeDate,
            quantity: null,
            unitPrice: null,
            totalCents: Math.abs(value.value),
            note,
            warnings,
          })
        } else {
          const quantity = decimalOf(cells[group.col + 1])
          const price = decimalOf(cells[group.col + 2])
          const total = parseImportAmount(cells[group.col + 3])
          if (!quantity || !price) continue
          trades.push({
            row,
            month,
            classKind: group.classKind,
            label: normalizeTicker(label),
            date: tradeDate,
            quantity,
            unitPrice: price,
            totalCents:
              total.ok && total.value ? Math.abs(total.value) : tradeTotalCents(quantity, price, 0),
            note,
            warnings,
          })
        }
      }
      return
    }

    // Balanço (B–G) e proventos (I–L) dividem as mesmas linhas.
    if (b === 'mes') return
    const nextBalance = b ? monthFrom(cellText(cells[1])) : null
    if (nextBalance) balanceMonth = nextBalance
    const label = cellText(cells[2])
    const date = parseImportDate(cells[3])
    if (balanceMonth && label && date.ok && date.value) {
      const total = parseImportAmount(cells[5])
      const quantity = decimalOf(cells[6]) ?? '0'
      if (total.ok && total.value) {
        balances.push({
          row,
          month: balanceMonth,
          date: date.value,
          label: isTicker(label) ? normalizeTicker(label) : label.trim(),
          price: decimalOf(cells[4]),
          totalCents: Math.abs(total.value),
          quantity,
        })
      }
    }
    const dividendLabel = cellText(cells[9])
    const dividendDate = parseImportDate(cells[10])
    const dividendValue = parseImportAmount(cells[11])
    if (
      dividendLabel &&
      dividendDate.ok &&
      dividendDate.value &&
      dividendValue.ok &&
      dividendValue.value
    ) {
      dividends.push({
        row,
        date: dividendDate.value,
        label: normalizeTicker(dividendLabel),
        amountCents: Math.abs(dividendValue.value),
      })
    }
  })

  return { trades, balances, dividends, targets, months }
}

/** Nomes de renda fixa que aparecem (aportes e balanços), para o usuário juntar os iguais. */
export function fixedIncomeLabels(read: PortfolioSheetRead): { label: string; count: number }[] {
  const counts = new Map<string, { label: string; count: number }>()
  const add = (label: string) => {
    const key = normalizeText(label)
    const entry = counts.get(key) ?? { label, count: 0 }
    entry.count += 1
    counts.set(key, entry)
  }
  read.trades.filter((item) => item.classKind === 'fixed_income').forEach((item) => add(item.label))
  read.balances
    .filter((item) => !isTicker(item.label) || item.quantity === '0')
    .forEach((item) => add(item.label))
  return [...counts.values()].sort((a, b) => a.label.localeCompare(b.label))
}

export interface InitialPosition {
  /** Ticker ou nome do ativo de renda fixa (já com a associação aplicada). */
  key: string
  classKind: SheetClass
  /** Data da "posição inicial" (1º dia do 1º mês de aportes). */
  date: IsoDate
  /** Bolsa: quantidade que já existia; renda fixa: null. */
  quantity: string | null
  /** Bolsa: preço sugerido (o do 1º balanço). */
  suggestedPrice: string | null
  /** Renda fixa: valor que já existia (centavos). */
  valueCents: Cents | null
  balanceDate: IsoDate
}

export interface PortfolioSheetOptions {
  /** Associação de cada nome de renda fixa (normalizado) → nome do ativo no Orla. */
  fixedIncomeNames: Record<string, string>
  /** Corretora de todos os ativos (opcional). */
  accountName: string | null
  /** PM informado para cada posição inicial (ticker → preço). */
  initialPrices: Record<string, string>
  /** Valor informado para cada posição inicial de renda fixa (nome → centavos). */
  initialValues: Record<string, Cents>
}

const fixedName = (label: string, options: Pick<PortfolioSheetOptions, 'fixedIncomeNames'>) =>
  options.fixedIncomeNames[normalizeText(label)] ?? label

/** Classe de um ticker: pelos aportes; sem aporte, "11" no fim = FII (com aviso). */
function classOfTicker(
  read: PortfolioSheetRead,
  ticker: string,
): { classKind: SheetClass; guessed: boolean } {
  const trade = read.trades.find(
    (item) => item.label === ticker && item.classKind !== 'fixed_income',
  )
  if (trade) return { classKind: trade.classKind, guessed: false }
  return { classKind: /11$/.test(ticker) ? 'reit' : 'stock', guessed: true }
}

/**
 * Posições anteriores aos aportes, pelo 1º balanço: quantidade do balanço − compras até a data
 * dele (bolsa) e saldo − aportes até a data (renda fixa).
 */
export function initialPositions(
  read: PortfolioSheetRead,
  options: Pick<PortfolioSheetOptions, 'fixedIncomeNames'>,
): InitialPosition[] {
  const firstMonth = [...new Set(read.balances.map((item) => item.month))].sort(compareMonths)[0]
  const startMonth = read.months[0] ?? firstMonth
  if (!firstMonth || !startMonth) return []
  const date = sameDayInMonth(startMonth, null)
  const out = new Map<string, InitialPosition>()
  for (const balance of read.balances.filter((item) => item.month === firstMonth)) {
    const stock = isTicker(balance.label) && balance.quantity !== '0'
    if (stock) {
      const bought = read.trades
        .filter(
          (item) => item.label === balance.label && item.date <= balance.date && item.quantity,
        )
        .reduce((sum, item) => sum.plus(toDecimal(item.quantity ?? '0')), new Decimal(0))
      const quantity = toDecimal(balance.quantity).minus(bought)
      if (quantity.lessThanOrEqualTo(0)) continue
      out.set(balance.label, {
        key: balance.label,
        classKind: classOfTicker(read, balance.label).classKind,
        date,
        quantity: quantity.toString(),
        suggestedPrice: balance.price,
        valueCents: null,
        balanceDate: balance.date,
      })
    } else {
      const name = fixedName(balance.label, options)
      const deposited = read.trades
        .filter(
          (item) =>
            item.classKind === 'fixed_income' &&
            fixedName(item.label, options) === name &&
            item.date <= balance.date,
        )
        .reduce((sum, item) => sum + item.totalCents, 0)
      const existing = out.get(name)
      const value = balance.totalCents - deposited + (existing?.valueCents ?? 0)
      if (value <= 0) continue
      out.set(name, {
        key: name,
        classKind: 'fixed_income',
        date,
        quantity: null,
        suggestedPrice: null,
        valueCents: value,
        balanceDate: balance.date,
      })
    }
  }
  return [...out.values()].sort((a, b) => a.key.localeCompare(b.key))
}

export interface BalanceAdjustment {
  ticker: string
  classKind: SheetClass
  kind: 'buy' | 'sell'
  date: IsoDate
  quantity: string
  price: string
  row: number
}

/**
 * Conciliação com os balanços: se um balanço mostra mais (ou menos) cotas do que a posição
 * inicial + aportes explicam, falta uma compra (ou venda) na planilha — vira um ajuste na data
 * do balanço, pelo preço dele (com aviso).
 */
export function balanceAdjustments(
  read: PortfolioSheetRead,
  options: Pick<PortfolioSheetOptions, 'fixedIncomeNames'>,
): BalanceAdjustment[] {
  const initial = new Map(
    initialPositions(read, options)
      .filter((item) => item.quantity)
      .map((item) => [item.key, toDecimal(item.quantity as string)]),
  )
  const adjustments: BalanceAdjustment[] = []
  const stockBalances = read.balances
    .filter((item) => isTicker(item.label) && item.quantity !== '0')
    .sort((a, b) => a.date.localeCompare(b.date) || a.row - b.row)
  for (const balance of stockBalances) {
    const held = read.trades
      .filter((item) => item.label === balance.label && item.date <= balance.date && item.quantity)
      .reduce(
        (sum, item) => sum.plus(toDecimal(item.quantity ?? '0')),
        initial.get(balance.label) ?? new Decimal(0),
      )
    const adjusted = adjustments
      .filter((item) => item.ticker === balance.label)
      .reduce(
        (sum, item) => (item.kind === 'buy' ? sum.plus(item.quantity) : sum.minus(item.quantity)),
        held,
      )
    const diff = toDecimal(balance.quantity).minus(adjusted)
    if (diff.isZero() || !balance.price) continue
    adjustments.push({
      ticker: balance.label,
      classKind: classOfTicker(read, balance.label).classKind,
      kind: diff.greaterThan(0) ? 'buy' : 'sell',
      date: balance.date,
      quantity: diff.abs().toString(),
      price: balance.price,
      row: balance.row,
    })
  }
  return adjustments
}

/** Passo 2: rascunhos (metas, ativos com o último preço/saldo, posição inicial, aportes, proventos). */
export function buildPortfolioDrafts(
  read: PortfolioSheetRead,
  options: PortfolioSheetOptions,
): ParsedImportRow[] {
  const out: ParsedImportRow[] = []
  const refOf = (key: string, classKind: SheetClass): AssetRef => ({
    ticker: classKind === 'fixed_income' ? null : key,
    name: key,
    classKind,
    className: null,
    accountName: options.accountName,
  })

  read.targets.forEach((target, index) => {
    const draft: ClassTargetDraft = {
      kind: 'classTarget',
      classKind: target.classKind,
      className: null,
      targetPct: target.targetPct,
    }
    out.push({
      rowNumber: index + 1,
      sourceRows: [1],
      raw: { classe: target.classKind, meta: `${target.targetPct}%` },
      draft,
      errors: [],
      warnings: [],
      skipped: null,
    })
  })

  // Ativos: um por ticker / nome de renda fixa, com o preço/saldo do último balanço.
  const lastMonth = [...new Set(read.balances.map((item) => item.month))].sort(compareMonths).at(-1)
  const assets = new Map<string, { classKind: SheetClass; row: number; guessed: boolean }>()
  for (const trade of read.trades) {
    const key = trade.classKind === 'fixed_income' ? fixedName(trade.label, options) : trade.label
    if (!assets.has(key))
      assets.set(key, { classKind: trade.classKind, row: trade.row, guessed: false })
  }
  for (const balance of read.balances) {
    const stock = isTicker(balance.label) && balance.quantity !== '0'
    const key = stock ? balance.label : fixedName(balance.label, options)
    if (assets.has(key)) continue
    const cls = stock
      ? classOfTicker(read, key)
      : { classKind: 'fixed_income' as const, guessed: false }
    assets.set(key, { classKind: cls.classKind, row: balance.row, guessed: cls.guessed })
  }
  for (const [key, info] of assets) {
    const latest = read.balances.filter((item) => {
      const stock = isTicker(item.label) && item.quantity !== '0'
      return (
        item.month === lastMonth &&
        (stock ? item.label === key : fixedName(item.label, options) === key)
      )
    })
    const fixed = info.classKind === 'fixed_income'
    const draft: AssetDraft = {
      kind: 'asset',
      ...refOf(key, info.classKind),
      fixedIncome: fixed ? { indexer: null, rate: null, maturity: null } : null,
      targetWeightPct: null,
      maxWeightPct: null,
      manualPrice: !fixed && latest[0]?.price ? latest[0].price : null,
      manualPriceAt: !fixed && latest[0] ? latest[0].date : null,
      manualValueCents:
        fixed && latest.length > 0 ? latest.reduce((sum, item) => sum + item.totalCents, 0) : null,
      manualValueAt: fixed && latest[0] ? latest[0].date : null,
    }
    const warnings = info.guessed
      ? [`Classe deduzida pelo ticker (${info.classKind === 'reit' ? 'FII' : 'ação'}): confira`]
      : []
    out.push({
      rowNumber: 10_000 + out.length,
      sourceRows: [info.row],
      raw: { ativo: key },
      draft,
      errors: [],
      warnings,
      skipped: null,
    })
  }

  // Posição inicial (antes dos aportes), com o PM/valor informado na associação.
  for (const position of initialPositions(read, options)) {
    const fixed = position.classKind === 'fixed_income'
    const value = fixed ? (options.initialValues[position.key] ?? position.valueCents ?? 0) : 0
    const price = fixed ? null : (options.initialPrices[position.key] ?? position.suggestedPrice)
    const errors: string[] = []
    if (!fixed && (!price || !/^\d+(\.\d+)?$/.test(price)))
      errors.push('Informe o preço médio da posição inicial')
    if (fixed && value <= 0) errors.push('Informe o valor da posição inicial')
    const draft: AssetTradeDraft | null =
      errors.length > 0
        ? null
        : {
            kind: 'assetTrade',
            asset: refOf(position.key, position.classKind),
            tradeKind: fixed ? 'fixed_income_deposit' : 'buy',
            date: position.date,
            quantity: fixed ? '1' : (position.quantity as string),
            unitPrice: fixed ? (value / 100).toFixed(2) : (price as string),
            feesCents: 0,
            totalCents: fixed ? value : null,
            splitRatio: null,
            notes: 'Posição inicial (antes dos aportes da planilha)',
          }
    out.push({
      rowNumber: 20_000 + out.length,
      sourceRows: [],
      raw: { ativo: position.key, posicao_inicial: position.quantity ?? String(value / 100) },
      draft,
      errors,
      warnings: [
        `Posição inicial pelo balanço de ${position.balanceDate.split('-').reverse().join('/')}`,
      ],
      skipped: null,
    })
  }

  for (const trade of read.trades) {
    const fixed = trade.classKind === 'fixed_income'
    const key = fixed ? fixedName(trade.label, options) : trade.label
    const draft: AssetTradeDraft = {
      kind: 'assetTrade',
      asset: refOf(key, trade.classKind),
      tradeKind: fixed ? 'fixed_income_deposit' : 'buy',
      date: trade.date,
      quantity: fixed ? '1' : (trade.quantity as string),
      unitPrice: fixed ? (trade.totalCents / 100).toFixed(2) : (trade.unitPrice as string),
      feesCents: 0,
      totalCents: trade.totalCents,
      splitRatio: null,
      notes: trade.note,
    }
    out.push({
      rowNumber: trade.row,
      sourceRows: [trade.row],
      raw: { ativo: trade.label, data: trade.date },
      draft,
      errors: [],
      warnings: trade.warnings,
      skipped: null,
    })
  }

  for (const adjustment of balanceAdjustments(read, options)) {
    const date = adjustment.date.split('-').reverse().join('/')
    const draft: AssetTradeDraft = {
      kind: 'assetTrade',
      asset: refOf(adjustment.ticker, adjustment.classKind),
      tradeKind: adjustment.kind,
      date: adjustment.date,
      quantity: adjustment.quantity,
      unitPrice: adjustment.price,
      feesCents: 0,
      totalCents: null,
      splitRatio: null,
      notes: `Ajuste pelo balanço de ${date}`,
    }
    out.push({
      rowNumber: 25_000 + adjustment.row,
      sourceRows: [adjustment.row],
      raw: { ativo: adjustment.ticker, data: adjustment.date },
      draft,
      errors: [],
      warnings: [
        `${adjustment.kind === 'buy' ? 'Compra' : 'Venda'} de ${adjustment.quantity} que não está nos aportes: o balanço de ${date} mostra outra quantidade. Confira o preço.`,
      ],
      skipped: null,
    })
  }

  // Aportes: cada linha de aporte é dinheiro novo na carteira (base da rentabilidade real).
  for (const trade of read.trades) {
    const draft: ContributionDraft = {
      kind: 'contribution',
      date: trade.date,
      amountCents: trade.totalCents,
      notes: `Aporte ${trade.label}`,
    }
    out.push({
      rowNumber: 35_000 + trade.row,
      sourceRows: [trade.row],
      raw: { aporte: trade.label, data: trade.date },
      draft,
      errors: [],
      warnings: [],
      skipped: null,
    })
  }

  // Balanços históricos: um por mês, fechado; renda fixa com o mesmo nome é somada.
  const months = [...new Set(read.balances.map((item) => item.month))].sort(compareMonths)
  const balanceDrafts: BalanceDraft[] = []
  months.forEach((month, index) => {
    const rows = read.balances.filter((item) => item.month === month)
    const items = new Map<string, BalanceDraft['items'][number]>()
    for (const row of rows) {
      const stock = isTicker(row.label) && row.quantity !== '0'
      const key = stock ? row.label : fixedName(row.label, options)
      const classKind = stock ? (assets.get(key)?.classKind ?? 'stock') : 'fixed_income'
      const current = items.get(key)
      if (current && !stock) current.valueCents += row.totalCents
      else if (!current) {
        items.set(key, {
          asset: refOf(key, classKind),
          quantity: stock ? row.quantity : null,
          price: stock ? row.price : null,
          valueCents: row.totalCents,
        })
      }
    }
    const date = rows
      .map((item) => item.date)
      .sort()
      .at(-1) as IsoDate
    const draft: BalanceDraft = {
      kind: 'balance',
      competenceMonth: month,
      referenceDate: date,
      items: [...items.values()],
    }
    // Renda fixa que cresceu muito além dos aportes da planilha: dinheiro novo sem aporte
    // registrado conta como ganho e infla a rentabilidade.
    const warnings: string[] = []
    const previous = index > 0 ? balanceDrafts[index - 1] : undefined
    if (previous) {
      for (const [key, item] of items) {
        if (item.quantity !== null) continue
        const before =
          previous.items.find((entry) => entry.quantity === null && entry.asset.name === key)
            ?.valueCents ?? 0
        const added = read.trades
          .filter(
            (trade) =>
              trade.classKind === 'fixed_income' &&
              fixedName(trade.label, options) === key &&
              trade.date > previous.referenceDate &&
              trade.date <= date,
          )
          .reduce((sum, trade) => sum + trade.totalCents, 0)
        const extra = item.valueCents - before - added
        if (extra > Math.max(5_000, Math.round((before + added) * 0.1))) {
          warnings.push(
            `${key} subiu ${(extra / 100).toFixed(2).replace('.', ',')} além dos aportes da planilha: se foi dinheiro novo, lance o aporte (senão conta como rendimento)`,
          )
        }
      }
    }
    balanceDrafts.push(draft)
    out.push({
      rowNumber: 40_000 + index,
      sourceRows: rows.map((item) => item.row),
      raw: { balanco: month, data: date },
      draft,
      errors: [],
      warnings,
      skipped: null,
    })
  })

  read.dividends.forEach((item) => {
    const known = [...assets.keys()].find((key) => key === item.label || key.startsWith(item.label))
    const ticker = known ?? item.label
    const classKind = assets.get(ticker)?.classKind ?? classOfTicker(read, ticker).classKind
    const draft: DividendDraft = {
      kind: 'dividend',
      asset: refOf(ticker, classKind === 'fixed_income' ? 'stock' : classKind),
      dividendKind: classKind === 'reit' ? 'income' : 'dividend',
      payDate: item.date,
      amountCents: item.amountCents,
    }
    const warnings =
      known && known !== item.label ? [`"${item.label}" na planilha: usei ${known}`] : []
    out.push({
      rowNumber: 30_000 + item.row,
      sourceRows: [item.row],
      raw: { ativo: item.label, data: item.date },
      draft,
      errors: [],
      warnings,
      skipped: null,
    })
  })

  return out
}
