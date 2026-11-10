/**
 * Leitor da planilha mensal do dono do projeto (docs/08 › "histórico da planilha atual"):
 * uma aba por ano com um bloco por mês —
 *
 *   JANEIRO
 *   DESCRIÇÃO ENTRADA | … | VALOR ENTRADA
 *   SALÁRIO           | … | 4379
 *   DESCRIÇÃO DESPESA | VALOR | TIPO | DATA | DATA PAGO | BANCO/QUEM | QTD. PARCELAS | PARCELA | VALOR PAGO | VALOR TOTAL
 *   ICLOUD            | 5,90  | FIXO | …
 *   TOTAL GASTOS / VALOR ECONOMIZAR / SOBROU
 *
 * Colunas fora da tabela (anotações à direita) são ignoradas. As linhas parceladas de vários
 * meses viram um único parcelamento; "VALOR ECONOMIZAR" vira a meta investida do mês.
 */
import { compareMonths, type IsoDate, isoDateToCompetenceMonth } from '../dates/calendar.ts'
import {
  addMonths,
  type CompetenceMonth,
  formatCompetenceMonth,
} from '../dates/competence-month.ts'
import type { Cents } from '../money/cents.ts'
import type {
  ImportPaymentMethod,
  InstallmentPlanDraft,
  MonthGoalDraft,
  ParsedImportRow,
  TransactionDraft,
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

/** Uma linha útil da planilha, já lida, antes de virar rascunho. */
export interface SheetLine {
  row: number
  month: CompetenceMonth
  section: 'income' | 'expense' | 'goal'
  description: string
  amountCents: Cents | null
  typeLabel: string
  date: IsoDate | null
  /** "DATA PAGO" preenchida (data, banco ou "QUITADO"). */
  paid: boolean
  /** "QUITADO" ou "(QUITEI)" na descrição. */
  paidOff: boolean
  bankOrWho: string
  installmentsCount: number | null
  installmentNumber: number | null
  totalCents: Cents | null
  raw: Record<string, string>
}

export interface SheetReadResult {
  lines: SheetLine[]
  /** Linhas ignoradas de propósito (totais, cabeçalhos, sem valor), para a pré-visualização. */
  ignored: ParsedImportRow[]
  months: CompetenceMonth[]
}

const EXPENSE_COLUMNS = {
  description: ['descricao despesa', 'descricao'],
  amount: ['valor'],
  type: ['tipo'],
  date: ['data'],
  paid: ['data pago', 'pago'],
  bank: ['banco/quem', 'banco', 'quem'],
  count: ['qtd. parcelas', 'qtd parcelas', 'parcelas'],
  number: ['parcela'],
  total: ['valor total'],
} as const

type ColumnKey = keyof typeof EXPENSE_COLUMNS

/** Lê o cabeçalho "DESCRIÇÃO DESPESA | VALOR | TIPO…" e devolve o índice de cada coluna. */
function expenseColumns(row: readonly Cell[]): Partial<Record<ColumnKey, number>> {
  const out: Partial<Record<ColumnKey, number>> = {}
  row.forEach((cell, index) => {
    const text = normalizeText(cellText(cell))
    if (!text) return
    for (const key of Object.keys(EXPENSE_COLUMNS) as ColumnKey[]) {
      if (out[key] !== undefined) continue
      if ((EXPENSE_COLUMNS[key] as readonly string[]).includes(text)) {
        out[key] = index
        return
      }
    }
  })
  return out
}

const isNumberCell = (cell: Cell) =>
  typeof cell === 'number' || /^\s*-?[\d.,]+\s*$/.test(cellText(cell))

/**
 * Passo 1: encontra os blocos de mês e lê as linhas de entrada, despesa e "valor economizar".
 * `year` é o ano dos blocos (vem do nome da aba, ex.: "FINANÇAS - 2026").
 */
/**
 * RF-57: "VALOR MÊS ANTERIOR", "SALDO DO MÊS ANTERIOR", "SOBRA MÊS ANTERIOR" — o saldo
 * levado à mão na planilha vira o lançamento de saldo anterior do app (não é renda).
 */
export function isCarryoverLine(normalizedDescription: string): boolean {
  return /^(valor|saldo|sobra)( d[oe])? mes anterior\b/.test(normalizedDescription)
}

export function readMonthlySheet(
  grid: readonly (readonly Cell[])[],
  year: number,
): SheetReadResult {
  const lines: SheetLine[] = []
  const ignored: ParsedImportRow[] = []
  const months: CompetenceMonth[] = []
  let month: CompetenceMonth | null = null
  let section: 'income' | 'expense' | null = null
  let incomeValueColumn = 6
  let columns: Partial<Record<ColumnKey, number>> = {}
  let lastMonthNumber = 0
  let currentYear = year

  const ignore = (row: number, rowCells: readonly Cell[], reason: string) => {
    const raw: Record<string, string> = {}
    rowCells.slice(0, 10).forEach((cell, i) => {
      const text = cellText(cell)
      if (text) raw[String.fromCharCode(65 + i)] = text
    })
    ignored.push({
      rowNumber: row,
      sourceRows: [row],
      raw,
      draft: null,
      errors: [],
      warnings: [],
      skipped: reason,
    })
  }

  grid.forEach((cells, index) => {
    const row = index + 1
    const first = cellText(cells[0])
    const firstKey = normalizeText(first)
    const rest = cells.slice(1, 10).filter((cell) => cellText(cell) !== '')

    // Título do mês: só o nome na coluna A (as anotações à direita não contam).
    const monthNumber =
      first && cells.slice(1, 10).every((cell) => cellText(cell) === '')
        ? monthNumberFromName(first)
        : null
    if (monthNumber && firstKey.split(' ').length <= 2) {
      if (monthNumber < lastMonthNumber) currentYear += 1
      lastMonthNumber = monthNumber
      month = formatCompetenceMonth({ year: currentYear, month: monthNumber })
      months.push(month)
      section = null
      return
    }
    if (!month) return

    if (firstKey.startsWith('descricao entrada')) {
      section = 'income'
      const valueIndex = cells.findIndex((cell) =>
        normalizeText(cellText(cell)).startsWith('valor entrada'),
      )
      incomeValueColumn = valueIndex === -1 ? 6 : valueIndex
      return
    }
    if (firstKey.startsWith('descricao despesa')) {
      section = 'expense'
      columns = expenseColumns(cells.slice(0, 12))
      return
    }

    if (section === 'income') {
      if (!first) return
      const amount = parseImportAmount(cells[incomeValueColumn])
      if (!amount.ok || !amount.value) {
        if (rest.length > 0 || first) ignore(row, cells, 'Entrada sem valor')
        return
      }
      lines.push({
        row,
        month,
        section: 'income',
        description: first,
        amountCents: amount.value,
        typeLabel: '',
        date: null,
        paid: true,
        paidOff: false,
        bankOrWho: '',
        installmentsCount: null,
        installmentNumber: null,
        totalCents: null,
        raw: { descricao: first, valor: cellText(cells[incomeValueColumn]) },
      })
      return
    }

    if (section !== 'expense') return
    const at = (key: ColumnKey) =>
      columns[key] === undefined ? undefined : cells[columns[key] as number]
    const description = cellText(at('description') ?? cells[0])
    const key = normalizeText(description)
    if (key.startsWith('total gastos') || key === 'sobrou' || key.startsWith('total')) {
      ignore(row, cells, 'Total da planilha')
      return
    }
    const amount = parseImportAmount(isNumberCell(at('amount')) ? at('amount') : null)
    if (key.startsWith('valor economizar')) {
      if (amount.ok && amount.value && amount.value > 0) {
        lines.push({
          row,
          month,
          section: 'goal',
          description,
          amountCents: amount.value,
          typeLabel: '',
          date: null,
          paid: true,
          paidOff: false,
          bankOrWho: '',
          installmentsCount: null,
          installmentNumber: null,
          totalCents: null,
          raw: { descricao: description, valor: cellText(at('amount')) },
        })
      } else ignore(row, cells, 'Nada economizado no mês')
      return
    }
    if (!description) {
      if (rest.length > 0) ignore(row, cells, 'Linha sem descrição')
      return
    }

    const paidCell = at('paid')
    const paidText = normalizeText(cellText(paidCell))
    const date = parseImportDate(at('date'))
    const count = Number(cellText(at('count'))) || null
    const number = Number(cellText(at('number'))) || null
    const total = parseImportAmount(at('total'))
    const raw: Record<string, string> = {}
    for (const column of Object.keys(columns) as ColumnKey[]) {
      const text = cellText(at(column))
      if (text) raw[column] = text
    }
    lines.push({
      row,
      month,
      section: 'expense',
      description: description.replace(/\s+/g, ' ').trim(),
      amountCents: amount.ok ? amount.value : null,
      typeLabel: normalizeText(cellText(at('type'))),
      date: date.ok ? date.value : null,
      paid: paidText !== '',
      paidOff: paidText === 'quitado' || /\(quitei\)|quitad/.test(key),
      bankOrWho: cellText(at('bank')).replace(/\s+/g, ' ').trim(),
      installmentsCount: count && Number.isInteger(count) && count > 1 ? count : null,
      installmentNumber: number && Number.isInteger(number) && number >= 1 ? number : null,
      totalCents: total.ok && total.value ? total.value : null,
      raw,
    })
  })

  return { lines, ignored, months }
}

/** Para onde vai cada valor de "BANCO/QUEM": cartão, conta, pessoa/estabelecimento ou nada. */
export interface BankMapping {
  kind: 'card' | 'account' | 'payee' | 'ignore'
  /** Nome do cartão/conta/estabelecimento no Orla. */
  name: string
}

/** Valores distintos de "BANCO/QUEM" (para o passo de associação), com quantas linhas usam. */
export function distinctBanks(lines: readonly SheetLine[]): { value: string; count: number }[] {
  const counts = new Map<string, { value: string; count: number }>()
  for (const line of lines) {
    if (!line.bankOrWho || normalizeText(line.bankOrWho) === 'banco/quem') continue
    const key = normalizeText(line.bankOrWho)
    const entry = counts.get(key) ?? { value: line.bankOrWho, count: 0 }
    entry.count += 1
    counts.set(key, entry)
  }
  return [...counts.values()].sort((a, b) => b.count - a.count)
}

export interface MonthlySheetOptions {
  /** Associação de cada valor de "BANCO/QUEM" (chave = texto normalizado). */
  banks: Record<string, BankMapping>
  /** Mês atual: entradas até ele entram como recebidas; depois, previstas. */
  currentMonth: CompetenceMonth
}

/** Data da linha dentro do bloco: a data informada se estiver perto do mês; senão, o mesmo dia no mês. */
function lineDate(line: SheetLine): IsoDate {
  if (line.date) {
    const month = isoDateToCompetenceMonth(line.date)
    // Compras no crédito costumam ser do mês (ou dois) anterior ao da fatura.
    if (
      compareMonths(month, line.month) <= 0 &&
      compareMonths(month, addMonths(line.month, -2)) >= 0
    ) {
      return line.date
    }
  }
  return sameDayInMonth(line.month, line.date)
}

const TYPE_NATURE: Record<
  string,
  { nature: TransactionDraft['nature']; method: ImportPaymentMethod | null }
> = {
  fixo: { nature: 'fixed', method: null },
  fixa: { nature: 'fixed', method: null },
  credito: { nature: 'variable', method: 'credit' },
  debito: { nature: 'variable', method: 'debit' },
  pix: { nature: 'variable', method: 'pix' },
  dinheiro: { nature: 'variable', method: 'cash' },
  boleto: { nature: 'variable', method: 'boleto' },
  planejamento: { nature: 'planned', method: null },
  parcela: { nature: 'variable', method: null },
}

function refsFor(
  bank: string,
  options: MonthlySheetOptions,
  wantsCard: boolean,
): { refs: Pick<TransactionDraft, 'accountName' | 'cardName' | 'payeeName'>; card: boolean } {
  const mapping = bank ? options.banks[normalizeText(bank)] : undefined
  const none = { accountName: null, cardName: null, payeeName: null }
  if (!mapping || mapping.kind === 'ignore' || !mapping.name) return { refs: none, card: false }
  if (mapping.kind === 'card') {
    return wantsCard
      ? { refs: { ...none, cardName: mapping.name }, card: true }
      : { refs: none, card: false }
  }
  if (mapping.kind === 'account')
    return { refs: { ...none, accountName: mapping.name }, card: false }
  return { refs: { ...none, payeeName: mapping.name }, card: false }
}

const stripPaidOff = (description: string) =>
  description
    .replace(/\(\s*quitei\s*\)/gi, '')
    .replace(/\s+/g, ' ')
    .trim()

/**
 * Passo 2: transforma as linhas lidas em rascunhos, já com a associação de bancos/pessoas.
 * Linhas parceladas (QTD. PARCELAS > 1) de todos os meses são agrupadas por descrição e nº de
 * parcelas e viram um parcelamento: 1ª parcela deduzida de "PARCELA k" no mês, parcelas pagas
 * até a última marcada como paga, e quitação antecipada quando aparece "QUITADO".
 */
export function buildMonthlyDrafts(
  lines: readonly SheetLine[],
  options: MonthlySheetOptions,
): ParsedImportRow[] {
  const out: ParsedImportRow[] = []
  const groups = new Map<string, SheetLine[]>()

  for (const line of lines) {
    const base = { rowNumber: line.row, sourceRows: [line.row], raw: line.raw, skipped: null }
    if (line.section === 'goal') {
      const draft: MonthGoalDraft = {
        kind: 'monthGoal',
        month: line.month,
        goalCents: line.amountCents ?? 0,
        investedCents: line.amountCents ?? 0,
      }
      out.push({ ...base, draft, errors: [], warnings: [] })
      continue
    }
    if (line.section === 'income') {
      const text = normalizeText(line.description)
      const salary = text.startsWith('salario')
      const draft: TransactionDraft = {
        kind: 'transaction',
        type: 'income',
        nature: salary ? 'fixed' : isCarryoverLine(text) ? 'carryover' : 'extra',
        status: compareMonths(line.month, options.currentMonth) <= 0 ? 'settled' : 'forecast',
        description: line.description.slice(0, 80),
        amountCents: Math.abs(line.amountCents ?? 0),
        date: sameDayInMonth(line.month, null),
        competenceMonth: line.month,
        paymentMethod: null,
        categoryName: null,
        accountName: null,
        cardName: null,
        payeeName: null,
        notes: null,
      }
      out.push({ ...base, draft, errors: [], warnings: [] })
      continue
    }
    if (line.installmentsCount && line.installmentNumber) {
      const key = `${normalizeText(stripPaidOff(line.description))}|${line.installmentsCount}`
      groups.set(key, [...(groups.get(key) ?? []), line])
      continue
    }

    const warnings: string[] = []
    if (line.amountCents === null || line.amountCents === 0) {
      out.push({ ...base, draft: null, errors: [], warnings, skipped: 'Despesa sem valor' })
      continue
    }
    const known = TYPE_NATURE[line.typeLabel]
    if (!known)
      warnings.push(
        line.typeLabel
          ? `Tipo "${line.typeLabel}" desconhecido: importado como variável`
          : 'Sem tipo: importado como variável',
      )
    const nature = known?.nature ?? 'variable'
    const wantsCard = known?.method === 'credit' || nature === 'fixed' || nature === 'planned'
    const { refs, card } = refsFor(line.bankOrWho, options, wantsCard)
    let paymentMethod: ImportPaymentMethod | null = known?.method ?? null
    if (card) paymentMethod = 'credit'
    if (paymentMethod === 'credit' && !card) {
      paymentMethod = 'other'
      warnings.push(
        `Crédito sem cartão associado${line.bankOrWho ? ` (${line.bankOrWho})` : ''}: importado como "outro"`,
      )
    }
    const draft: TransactionDraft = {
      kind: 'transaction',
      type: 'expense',
      nature,
      status: line.paid ? 'settled' : 'forecast',
      description: line.description.slice(0, 80),
      amountCents: Math.abs(line.amountCents),
      date: lineDate(line),
      competenceMonth: line.month,
      paymentMethod,
      categoryName: null,
      ...refs,
      notes: null,
    }
    out.push({ ...base, draft, errors: [], warnings })
  }

  for (const group of groups.values()) {
    const sorted = [...group].sort((a, b) => compareMonths(a.month, b.month) || a.row - b.row)
    const first = sorted[0] as SheetLine
    const count = first.installmentsCount as number
    const rows = sorted.map((line) => line.row)
    const raw = { ...first.raw, meses: sorted.map((line) => line.month).join(', ') }
    const base = { rowNumber: first.row, sourceRows: rows, raw, skipped: null }
    const warnings: string[] = []
    const errors: string[] = []

    const valued = sorted.find((line) => line.amountCents && line.amountCents > 0)
    const totalCents =
      sorted.find((line) => line.totalCents && line.totalCents > 0)?.totalCents ??
      (valued?.amountCents ? valued.amountCents * count : null)
    if (!totalCents) {
      out.push({
        ...base,
        draft: null,
        errors,
        warnings,
        skipped: 'Parcelamento sem valor na planilha',
      })
      continue
    }
    const anchor = valued ?? first
    const firstCompetenceMonth = addMonths(
      anchor.month,
      -((anchor.installmentNumber as number) - 1),
    )
    // Quitação: com valor no mês, a parcela daquele mês foi paga e o resto quitado ali; sem
    // valor ("(QUITEI)" com VALOR vazio), a quitação foi antes — no mês anterior.
    const paidOffLine = sorted.find((line) => line.paidOff)
    const paidOffEarlier = Boolean(
      paidOffLine && !(paidOffLine.amountCents && paidOffLine.amountCents > 0),
    )
    const paidNumbers = sorted
      .filter((line) => line.paid || line.paidOff)
      .map((line) =>
        line === paidOffLine && paidOffEarlier
          ? (line.installmentNumber as number) - 1
          : (line.installmentNumber as number),
      )
    const settledCount = Math.min(count, Math.max(0, ...paidNumbers))
    const payoffMonth =
      paidOffLine && settledCount < count
        ? paidOffEarlier
          ? addMonths(paidOffLine.month, -1)
          : paidOffLine.month
        : null
    const wantsCard = true
    const { refs, card } = refsFor(first.bankOrWho, options, wantsCard)
    if (sorted.length > 1)
      warnings.push(`Junta ${sorted.length} linhas (${sorted.length} meses) em um parcelamento`)
    if (payoffMonth)
      warnings.push(`Quitado em ${payoffMonth}: as parcelas restantes viram um pagamento único`)

    const draft: InstallmentPlanDraft = {
      kind: 'installmentPlan',
      description: stripPaidOff(first.description).slice(0, 80),
      purchaseDate:
        first.date && compareMonths(isoDateToCompetenceMonth(first.date), firstCompetenceMonth) <= 0
          ? first.date
          : sameDayInMonth(firstCompetenceMonth, first.date),
      installmentsCount: count,
      totalCents,
      firstCompetenceMonth,
      currentInstallment: null,
      settledCount,
      payoffMonth,
      paymentMethod: card ? 'credit' : 'boleto',
      categoryName: null,
      ...refs,
      notes: null,
    }
    out.push({ ...base, draft, errors, warnings })
  }

  return out.sort((a, b) => a.rowNumber - b.rowNumber)
}
