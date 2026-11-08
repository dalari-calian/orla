/**
 * Importação, exportação e backup (docs/08, docs/11 › Importação / exportação).
 * O navegador lê o arquivo e manda **rascunhos** (com nomes de conta/cartão/categoria); a API
 * valida, resolve os nomes, aponta duplicados e grava tudo de uma vez (RI-03: desfazível).
 */
import { z } from 'zod'
import {
  competenceMonthSchema,
  idSchema,
  nonNegativeCentsSchema,
  positiveCentsSchema,
} from './common.ts'
import { isoDateSchema } from './finances.ts'
import {
  assetClassKindSchema,
  decimalStringSchema,
  dividendKindSchema,
  percentSchema,
  tradeKindSchema,
} from './portfolio.ts'
import { paymentMethodSchema } from './registrations.ts'

export const importKindSchema = z.enum([
  'transactions',
  'installments',
  'monthly_sheet',
  'assets',
  'trades',
  'dividends',
  'portfolio_sheet',
])
export type ImportKind = z.infer<typeof importKindSchema>

const refName = z.string().trim().min(1).max(80).nullable()
const description = z.string().trim().min(1, 'Descrição vazia').max(80, 'Descrição longa demais')
const notes = z.string().trim().max(500).nullable()

const refNames = {
  categoryName: refName,
  accountName: refName,
  cardName: refName,
  payeeName: refName,
}

export const importTransactionDraftSchema = z.object({
  kind: z.literal('transaction'),
  type: z.enum(['income', 'expense']),
  nature: z.enum(['fixed', 'variable', 'planned', 'extra']),
  status: z.enum(['forecast', 'settled']),
  description,
  amountCents: positiveCentsSchema,
  date: isoDateSchema,
  competenceMonth: competenceMonthSchema.nullable(),
  paymentMethod: paymentMethodSchema.nullable(),
  notes,
  ...refNames,
})

export const importInstallmentDraftSchema = z.object({
  kind: z.literal('installmentPlan'),
  description,
  purchaseDate: isoDateSchema,
  installmentsCount: z.number().int().min(1).max(120),
  totalCents: positiveCentsSchema,
  firstCompetenceMonth: competenceMonthSchema.nullable(),
  currentInstallment: z.number().int().min(1).nullable(),
  settledCount: z.number().int().min(0).nullable(),
  payoffMonth: competenceMonthSchema.nullable(),
  paymentMethod: paymentMethodSchema,
  notes,
  ...refNames,
})

export const importMonthGoalDraftSchema = z.object({
  kind: z.literal('monthGoal'),
  month: competenceMonthSchema,
  goalCents: nonNegativeCentsSchema,
  investedCents: nonNegativeCentsSchema,
})

// ─── Carteira (Fase 5) ───────────────────────────────────────────────────────

/** Ativo pelo ticker (bolsa) ou pelo nome (renda fixa); a API resolve ou cria. */
export const importAssetRefSchema = z.object({
  ticker: z.string().trim().min(3).max(12).nullable(),
  name: z.string().trim().min(1).max(80),
  classKind: assetClassKindSchema.nullable(),
  className: z.string().trim().max(40).nullable(),
  accountName: refName,
})
export type ImportAssetRef = z.infer<typeof importAssetRefSchema>

export const importClassTargetDraftSchema = z.object({
  kind: z.literal('classTarget'),
  classKind: assetClassKindSchema.nullable(),
  className: z.string().trim().max(40).nullable(),
  targetPct: percentSchema,
})

export const importAssetDraftSchema = importAssetRefSchema.extend({
  kind: z.literal('asset'),
  fixedIncome: z
    .object({
      indexer: z.string().trim().max(10).nullable(),
      rate: z.string().trim().max(40).nullable(),
      maturity: isoDateSchema.nullable(),
    })
    .nullable(),
  targetWeightPct: percentSchema.nullable(),
  maxWeightPct: percentSchema.nullable(),
  manualPrice: decimalStringSchema.nullable(),
  manualPriceAt: isoDateSchema.nullable(),
  manualValueCents: nonNegativeCentsSchema.nullable(),
  manualValueAt: isoDateSchema.nullable(),
})

export const importAssetTradeDraftSchema = z.object({
  kind: z.literal('assetTrade'),
  asset: importAssetRefSchema,
  tradeKind: tradeKindSchema,
  date: isoDateSchema,
  quantity: decimalStringSchema,
  unitPrice: decimalStringSchema,
  feesCents: nonNegativeCentsSchema,
  totalCents: nonNegativeCentsSchema.nullable(),
  splitRatio: decimalStringSchema.nullable(),
  notes: notes,
})

export const importDividendDraftSchema = z.object({
  kind: z.literal('dividend'),
  asset: importAssetRefSchema,
  dividendKind: dividendKindSchema,
  payDate: isoDateSchema,
  amountCents: positiveCentsSchema,
})

export const importDraftSchema = z.discriminatedUnion('kind', [
  importTransactionDraftSchema,
  importInstallmentDraftSchema,
  importMonthGoalDraftSchema,
  importClassTargetDraftSchema,
  importAssetDraftSchema,
  importAssetTradeDraftSchema,
  importDividendDraftSchema,
])
export type ImportDraftInput = z.infer<typeof importDraftSchema>

/** POST /imports */
export const createImportRequestSchema = z.object({
  kind: importKindSchema,
  fileName: z.string().trim().min(1).max(200),
  /** Mapeamento de colunas usado (reaproveitado na próxima importação do mesmo tipo). */
  mapping: z.record(z.string(), z.unknown()).nullable().default(null),
})
export type CreateImportRequest = z.input<typeof createImportRequestSchema>

/** POST /imports/:id/rows — até 500 linhas já interpretadas no navegador (RI-07). */
export const importRowsRequestSchema = z.object({
  rows: z
    .array(
      z.object({
        rowNumber: z.number().int().min(0),
        sourceRows: z.array(z.number().int()).max(200).default([]),
        raw: z.record(z.string(), z.string().max(500)).default({}),
        draft: importDraftSchema,
      }),
    )
    .min(1)
    .max(500, 'Envie no máximo 500 linhas por vez'),
})
export type ImportRowsRequest = z.input<typeof importRowsRequestSchema>

export const importRowCheckSchema = z.object({
  rowNumber: z.number().int(),
  /** ok · warning (grava, mas confira) · duplicate (desmarcado por padrão, RI-02) · error */
  status: z.enum(['ok', 'warning', 'duplicate', 'error']),
  messages: z.array(z.string()),
  /** Cadastros que serão criados ao confirmar (ex.: "Conta: Ailos"). */
  creates: z.array(z.string()),
})
export type ImportRowCheck = z.infer<typeof importRowCheckSchema>

export const importRowsResponseSchema = z.object({ rows: z.array(importRowCheckSchema) })

/** POST /imports/:id/commit */
export const commitImportRequestSchema = z.object({
  /** Linhas desmarcadas na pré-visualização. */
  skipRows: z.array(z.number().int()).default([]),
  /** Criar categorias, contas e estabelecimentos que não existem (padrão: sim). */
  createMissing: z.boolean().default(true),
})
export type CommitImportRequest = z.input<typeof commitImportRequestSchema>

export const importStatusSchema = z.enum(['pending', 'committed', 'undone'])

export const importJobSchema = z.object({
  id: idSchema,
  kind: importKindSchema,
  fileName: z.string(),
  status: importStatusSchema,
  mapping: z.record(z.string(), z.unknown()).nullable(),
  stats: z.object({
    rows: z.number().int(),
    transactions: z.number().int(),
    installmentPlans: z.number().int(),
    monthGoals: z.number().int(),
    assets: z.number().int().default(0),
    trades: z.number().int().default(0),
    dividends: z.number().int().default(0),
    created: z.array(z.string()),
    skipped: z.number().int(),
  }),
  createdAt: z.string(),
  committedAt: z.string().nullable(),
  undoneAt: z.string().nullable(),
})
export type ImportJob = z.infer<typeof importJobSchema>

// ─── Exportação e backup ─────────────────────────────────────────────────────

export const exportEntitySchema = z.enum(['transactions', 'installment-plans'])
export type ExportEntity = z.infer<typeof exportEntitySchema>

/** GET /exports/:entity?format=csv|json&from=&to= (xlsx é montado no navegador a partir do json). */
export const exportQuerySchema = z.object({
  format: z.enum(['csv', 'json']).default('csv'),
  from: competenceMonthSchema.optional(),
  to: competenceMonthSchema.optional(),
})

/** Tabela pronta para planilha: cabeçalho + linhas (valores em texto/número pt-BR). */
export const exportTableSchema = z.object({
  columns: z.array(z.string()),
  rows: z.array(z.array(z.union([z.string(), z.number(), z.null()]))),
})
export type ExportTable = z.infer<typeof exportTableSchema>

export const BACKUP_FORMAT_VERSION = 1

/** GET /backup — tudo do usuário (RE-02). Linhas no formato do banco (centavos como número). */
export const backupSchema = z.object({
  app: z.literal('orla'),
  formatVersion: z.number().int(),
  exportedAt: z.string(),
  data: z.object({
    settings: z.record(z.string(), z.unknown()).nullable(),
    accounts: z.array(z.record(z.string(), z.unknown())),
    creditCards: z.array(z.record(z.string(), z.unknown())),
    categories: z.array(z.record(z.string(), z.unknown())),
    payees: z.array(z.record(z.string(), z.unknown())),
    recurringTemplates: z.array(z.record(z.string(), z.unknown())),
    installmentPlans: z.array(z.record(z.string(), z.unknown())),
    transactions: z.array(z.record(z.string(), z.unknown())),
    monthSettings: z.array(z.record(z.string(), z.unknown())),
    // Carteira (Fase 5). Backups antigos não têm: vazio.
    assetClasses: z.array(z.record(z.string(), z.unknown())).default([]),
    targetAllocations: z.array(z.record(z.string(), z.unknown())).default([]),
    assets: z.array(z.record(z.string(), z.unknown())).default([]),
    assetTrades: z.array(z.record(z.string(), z.unknown())).default([]),
    dividends: z.array(z.record(z.string(), z.unknown())).default([]),
  }),
})
export type Backup = z.input<typeof backupSchema>

/** POST /restore — `merge` só acrescenta o que não existe; `replace` deixa igual ao backup. */
export const restoreRequestSchema = z.object({
  mode: z.enum(['merge', 'replace']),
  backup: backupSchema,
})
export type RestoreRequest = z.input<typeof restoreRequestSchema>

export const restoreResponseSchema = z.object({
  created: z.number().int(),
  updated: z.number().int(),
  removed: z.number().int(),
})
export type RestoreResponse = z.infer<typeof restoreResponseSchema>
