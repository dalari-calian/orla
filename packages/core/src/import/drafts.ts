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

/** Classe de ativo pelo tipo (do formato da planilha) ou pelo nome (dos templates). */
export type AssetClassKindRef =
  'fixed_income' | 'reit' | 'stock' | 'etf' | 'international' | 'crypto' | 'other'

/** Referência a um ativo: pelo ticker (bolsa) ou pelo nome (renda fixa). */
export interface AssetRef {
  ticker: string | null
  name: string
  classKind: AssetClassKindRef | null
  className: string | null
  accountName: string | null
}

/** Meta de alocação de uma classe (ex.: cabeçalho "FIIS - 30%"). */
export interface ClassTargetDraft {
  kind: 'classTarget'
  classKind: AssetClassKindRef | null
  className: string | null
  targetPct: string
}

/** Cadastro de ativo (template Ativos, ou o último balanço da planilha com preço/saldo). */
export interface AssetDraft extends AssetRef {
  kind: 'asset'
  fixedIncome: { indexer: string | null; rate: string | null; maturity: IsoDate | null } | null
  targetWeightPct: string | null
  maxWeightPct: string | null
  /** Preço visto no último balanço (vale até a próxima cotação). */
  manualPrice: string | null
  manualPriceAt: IsoDate | null
  /** Saldo da renda fixa no último balanço. */
  manualValueCents: Cents | null
  manualValueAt: IsoDate | null
}

export type AssetTradeKindRef =
  | 'buy'
  | 'sell'
  | 'bonus'
  | 'split'
  | 'reverse_split'
  | 'subscription'
  | 'fixed_income_deposit'
  | 'fixed_income_withdrawal'
  | 'position_set'

export interface AssetTradeDraft {
  kind: 'assetTrade'
  asset: AssetRef
  tradeKind: AssetTradeKindRef
  date: IsoDate
  quantity: string
  unitPrice: string
  feesCents: Cents
  totalCents: Cents | null
  splitRatio: string | null
  notes: string | null
}

export interface DividendDraft {
  kind: 'dividend'
  asset: AssetRef
  dividendKind: 'dividend' | 'jcp' | 'income' | 'interest' | 'other'
  payDate: IsoDate
  amountCents: Cents
}

/** Balanço histórico (Fase 7): entra fechado, um por mês. */
export interface BalanceDraft {
  kind: 'balance'
  competenceMonth: string
  referenceDate: IsoDate
  items: { asset: AssetRef; quantity: string | null; price: string | null; valueCents: Cents }[]
}

/** Aporte externo (dinheiro novo na carteira), base da rentabilidade real. */
export interface ContributionDraft {
  kind: 'contribution'
  date: IsoDate
  amountCents: Cents
  notes: string | null
}

export type ImportDraft =
  | TransactionDraft
  | InstallmentPlanDraft
  | MonthGoalDraft
  | ClassTargetDraft
  | AssetDraft
  | AssetTradeDraft
  | DividendDraft
  | BalanceDraft
  | ContributionDraft

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
