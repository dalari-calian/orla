/**
 * Rascunhos de importação (docs/08): o que o navegador extrai de cada linha e manda para a
 * API validar e gravar. Contas, cartões, categorias e estabelecimentos vão pelo **nome** — a
 * API resolve para os cadastros existentes (ou cria, se o usuário pedir).
 */
import type { IsoDate } from '../dates/calendar.ts'
import type { CompetenceMonth } from '../dates/competence-month.ts'
import type { Cents } from '../money/cents.ts'
import { normalizeText } from './text.ts'

export type ImportPaymentMethod =
  'pix' | 'debit' | 'credit' | 'cash' | 'boleto' | 'transfer' | 'other'

export interface RefNames {
  categoryName: string | null
  accountName: string | null
  cardName: string | null
  payeeName: string | null
}

export interface TransactionDraft extends RefNames {
  kind: 'transaction'
  type: 'income' | 'expense'
  nature: 'fixed' | 'variable' | 'planned' | 'extra'
  status: 'forecast' | 'settled'
  description: string
  amountCents: Cents
  date: IsoDate
  /** Mês em que entra no resumo; `null` = calculado pela data (e pela fatura, no crédito). */
  competenceMonth: CompetenceMonth | null
  paymentMethod: ImportPaymentMethod | null
  notes: string | null
}

export interface InstallmentPlanDraft extends RefNames {
  kind: 'installmentPlan'
  description: string
  purchaseDate: IsoDate
  installmentsCount: number
  totalCents: Cents
  /** 1ª parcela; `null` = pela compra (ou pela parcela atual, RI-04). */
  firstCompetenceMonth: CompetenceMonth | null
  /** RI-04 / RF-43: "estou na parcela k" no mês atual. */
  currentInstallment: number | null
  /** Parcelas já pagas (1..n), quando a 1ª competência é conhecida. */
  settledCount: number | null
  /** Quitado antecipadamente neste mês (as parcelas restantes viram um pagamento único). */
  payoffMonth: CompetenceMonth | null
  paymentMethod: ImportPaymentMethod
  notes: string | null
}

/** Meta do mês e quanto dela já foi investido (ex.: "VALOR ECONOMIZAR" da planilha). */
export interface MonthGoalDraft {
  kind: 'monthGoal'
  month: CompetenceMonth
  goalCents: Cents
  investedCents: Cents
}

export type ImportDraft = TransactionDraft | InstallmentPlanDraft | MonthGoalDraft

/** Uma linha (ou grupo de linhas) do arquivo já interpretada, pronta para a pré-visualização. */
export interface ParsedImportRow {
  /** Número da linha no arquivo (1 = primeira); grupos usam a primeira linha. */
  rowNumber: number
  /** Linhas do arquivo que formam este item (parcelamentos da planilha mensal juntam várias). */
  sourceRows: number[]
  /** Valores originais, para mostrar e guardar no histórico. */
  raw: Record<string, string>
  draft: ImportDraft | null
  errors: string[]
  warnings: string[]
  /** Linha que não vira nada (total, cabeçalho, valor vazio) — aparece só como informação. */
  skipped: string | null
}

/**
 * RI-02: chave de "provável duplicado" — mesmo mês, mesmo valor e mesma descrição
 * normalizada (sem acentos/maiúsculas/espaços extras).
 */
export function duplicateKey(month: string, amountCents: Cents, description: string): string {
  return `${month}|${amountCents}|${normalizeText(description)}`
}

/** Nome "limpo" para comparar cadastros: sem acento, minúsculo, sem espaços duplos. */
export function refKey(name: string): string {
  return normalizeText(name)
}
