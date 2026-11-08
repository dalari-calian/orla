/**
 * Linhas dos templates oficiais (docs/08) → rascunhos. Cada função recebe os valores já
 * mapeados por campo (chave do campo → célula) e devolve o rascunho ou os erros da linha.
 */
import { addMonths, type CompetenceMonth } from '../dates/competence-month.ts'
import { installmentTotal } from '../finance/installments.ts'
import type { InstallmentPlanDraft, ParsedImportRow, TransactionDraft } from './drafts.ts'
import {
  type ColumnMapping,
  parseNatureValue,
  parsePaymentMethodValue,
  parseStatusValue,
  parseTypeValue,
} from './mapping.ts'
import {
  type Cell,
  cellText,
  parseImportAmount,
  parseImportDate,
  parseImportMonth,
} from './text.ts'

/** Valores de uma linha por campo, a partir do mapeamento de colunas. */
export function pickFields(row: readonly Cell[], mapping: ColumnMapping): Record<string, Cell> {
  const out: Record<string, Cell> = {}
  for (const [key, index] of Object.entries(mapping)) {
    out[key] = index === null || index === undefined ? null : row[index]
  }
  return out
}

function rawOf(values: Record<string, Cell>): Record<string, string> {
  const out: Record<string, string> = {}
  for (const [key, cell] of Object.entries(values)) {
    const text = cellText(cell)
    if (text) out[key] = text
  }
  return out
}

const nameOrNull = (cell: Cell) => cellText(cell).slice(0, 80) || null

/** Linha do template "Lançamentos". */
export function transactionRowToDraft(
  rowNumber: number,
  values: Record<string, Cell>,
): ParsedImportRow {
  const errors: string[] = []
  const warnings: string[] = []
  const raw = rawOf(values)
  const base = { rowNumber, sourceRows: [rowNumber], raw, warnings, skipped: null }

  if (Object.keys(raw).length === 0) {
    return { ...base, draft: null, errors, skipped: 'Linha vazia' }
  }

  const description = cellText(values.descricao).slice(0, 80)
  if (!description) errors.push('Descrição vazia')

  const amount = parseImportAmount(values.valor)
  if (!amount.ok) errors.push(amount.error)
  else if (amount.value === null || amount.value === 0) errors.push('Valor vazio')

  const date = parseImportDate(values.data)
  if (!date.ok) errors.push(date.error)
  else if (date.value === null) errors.push('Data vazia')

  const competence = parseImportMonth(values.competencia)
  if (!competence.ok) errors.push(competence.error)

  // Tipo: coluna "tipo"; sem ela, valor negativo = despesa e positivo = despesa (o comum em
  // planilhas de gastos). Avisamos quando foi deduzido.
  let type = parseTypeValue(cellText(values.tipo))
  if (cellText(values.tipo) && type === null)
    errors.push(`Tipo desconhecido: "${cellText(values.tipo)}" (use receita ou despesa)`)
  if (!cellText(values.tipo)) {
    type = 'expense'
    warnings.push('Sem tipo: importado como despesa')
  }

  const natureRaw = parseNatureValue(cellText(values.natureza))
  let nature: TransactionDraft['nature'] = type === 'income' ? 'extra' : 'variable'
  if (natureRaw === undefined) errors.push(`Natureza desconhecida: "${cellText(values.natureza)}"`)
  else if (natureRaw === 'installment')
    errors.push('Parcelas entram pelo template de Parcelamentos')
  else if (natureRaw !== null) nature = natureRaw
  if (type === 'income' && (nature === 'variable' || nature === 'planned')) nature = 'extra'
  if (type === 'expense' && nature === 'extra') nature = 'variable'

  const method = parsePaymentMethodValue(cellText(values.forma_pagamento))
  if (method === undefined)
    errors.push(`Forma de pagamento desconhecida: "${cellText(values.forma_pagamento)}"`)
  const cardName = nameOrNull(values.cartao)
  const paymentMethod = method ?? (cardName && type === 'expense' ? 'credit' : null)
  if (paymentMethod === 'credit' && !cardName) errors.push('Compra no crédito sem cartão')

  const statusRaw = parseStatusValue(cellText(values.status))
  if (statusRaw === undefined)
    errors.push(`Status desconhecido: "${cellText(values.status)}" (use previsto ou pago)`)
  const status =
    statusRaw ??
    (paymentMethod === 'credit'
      ? 'forecast'
      : nature === 'variable' || nature === 'extra'
        ? 'settled'
        : 'forecast')

  if (
    errors.length > 0 ||
    !amount.ok ||
    amount.value === null ||
    !date.ok ||
    !date.value ||
    !type
  ) {
    return { ...base, draft: null, errors }
  }
  return {
    ...base,
    errors,
    draft: {
      kind: 'transaction',
      type,
      nature,
      status,
      description,
      amountCents: Math.abs(amount.value),
      date: date.value,
      competenceMonth: competence.ok ? competence.value : null,
      paymentMethod: type === 'income' && paymentMethod === 'credit' ? null : paymentMethod,
      categoryName: nameOrNull(values.categoria),
      accountName: nameOrNull(values.conta),
      cardName: paymentMethod === 'credit' ? cardName : null,
      payeeName: nameOrNull(values.estabelecimento),
      notes: cellText(values.observacao).slice(0, 500) || null,
    },
  }
}

/** Linha do template "Parcelamentos" (RI-04: aceita a parcela atual). */
export function installmentRowToDraft(
  rowNumber: number,
  values: Record<string, Cell>,
  currentMonth: CompetenceMonth,
): ParsedImportRow {
  const errors: string[] = []
  const warnings: string[] = []
  const raw = rawOf(values)
  const base = { rowNumber, sourceRows: [rowNumber], raw, warnings, skipped: null }
  if (Object.keys(raw).length === 0) return { ...base, draft: null, errors, skipped: 'Linha vazia' }

  const description = cellText(values.descricao).slice(0, 80)
  if (!description) errors.push('Descrição vazia')
  const date = parseImportDate(values.data_compra)
  if (!date.ok) errors.push(date.error)
  else if (!date.value) errors.push('Data da compra vazia')

  const countText = cellText(values.qtd_parcelas).replace(/x$/i, '')
  const count = Number(countText)
  if (!Number.isInteger(count) || count < 1 || count > 120)
    errors.push('Nº de parcelas inválido (1 a 120)')

  const total = parseImportAmount(values.valor_total)
  const installment = parseImportAmount(values.valor_parcela)
  if (!total.ok) errors.push(total.error)
  if (!installment.ok) errors.push(installment.error)
  let totalCents: number | null = total.ok && total.value ? Math.abs(total.value) : null
  if (
    totalCents === null &&
    installment.ok &&
    installment.value &&
    Number.isInteger(count) &&
    count > 0
  ) {
    totalCents = installmentTotal(Math.abs(installment.value), count)
  }
  if (totalCents === null && total.ok && installment.ok)
    errors.push('Informe o valor total ou o valor da parcela')

  let currentInstallment: number | null = null
  const currentText = cellText(values.parcela_atual)
  if (currentText) {
    const current = Number(currentText.split('/')[0])
    if (!Number.isInteger(current) || current < 1 || current > count)
      errors.push('Parcela atual inválida')
    else currentInstallment = current
  }

  const cardName = nameOrNull(values.cartao)
  if (errors.length > 0 || !date.ok || !date.value || totalCents === null) {
    return { ...base, draft: null, errors }
  }
  const draft: InstallmentPlanDraft = {
    kind: 'installmentPlan',
    description,
    purchaseDate: date.value,
    installmentsCount: count,
    totalCents,
    firstCompetenceMonth: currentInstallment
      ? addMonths(currentMonth, -(currentInstallment - 1))
      : null,
    currentInstallment,
    settledCount: currentInstallment ? currentInstallment - 1 : null,
    payoffMonth: null,
    paymentMethod: cardName ? 'credit' : 'boleto',
    categoryName: nameOrNull(values.categoria),
    accountName: null,
    cardName,
    payeeName: nameOrNull(values.estabelecimento),
    notes: cellText(values.observacao).slice(0, 500) || null,
  }
  if (!cardName) warnings.push('Sem cartão: importado como boleto/carnê')
  return { ...base, errors, draft }
}
