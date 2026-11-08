/**
 * Carteira (docs/05, docs/11 › Carteira): classes, metas de alocação, ativos, operações,
 * proventos, posição e cotações. Quantidades e preços trafegam como **texto decimal**
 * ("10.5", "9.73") para não perder precisão; dinheiro em centavos.
 */
import {
  ASSET_CLASS_KINDS,
  DIVIDEND_KINDS,
  isTicker,
  normalizeTicker,
  TRADE_KINDS,
} from '@orla/core'
import { z } from 'zod'
import {
  hexColorSchema,
  idSchema,
  nameSchema,
  nonNegativeCentsSchema,
  positiveCentsSchema,
  timestampsSchema,
} from './common.ts'
import { isoDateSchema } from './finances.ts'

/** Número decimal como texto ("12.5"); aceita número ou vírgula decimal na entrada. */
export const decimalStringSchema = z
  .union([z.string(), z.number()])
  .transform((value) => String(value).trim().replace(',', '.'))
  .refine((value) => /^\d+(\.\d+)?$/.test(value), 'Número inválido')
  .refine((value) => (value.split('.')[1]?.length ?? 0) <= 8, 'Use no máximo 8 casas decimais')
  .refine((value) => Number(value) < 1e12, 'Número grande demais')

/** Percentual 0–100 com até 4 casas ("30", "12.5"). */
export const percentSchema = decimalStringSchema.refine(
  (value) => Number(value) >= 0 && Number(value) <= 100,
  'Use um percentual entre 0 e 100',
)

// ─── Classes e metas ─────────────────────────────────────────────────────────

export const assetClassKindSchema = z.enum(ASSET_CLASS_KINDS)
export type AssetClassKindValue = z.infer<typeof assetClassKindSchema>

export const assetClassSchema = z.object({
  id: idSchema,
  name: z.string(),
  kind: assetClassKindSchema,
  color: z.string(),
  sortOrder: z.number().int(),
  /** Meta de alocação em % (null = sem meta). */
  targetPct: z.string().nullable(),
  maxPct: z.string().nullable(),
  ...timestampsSchema,
})
export type AssetClass = z.infer<typeof assetClassSchema>

export const createAssetClassRequestSchema = z.object({
  name: nameSchema(40),
  kind: assetClassKindSchema,
  color: hexColorSchema,
})
export type CreateAssetClassRequest = z.infer<typeof createAssetClassRequestSchema>
export const updateAssetClassRequestSchema = createAssetClassRequestSchema
  .extend({ sortOrder: z.number().int().min(0) })
  .partial()
export type UpdateAssetClassRequest = z.infer<typeof updateAssetClassRequestSchema>

/** PUT /target-allocations — todas as metas de uma vez (soma 100 é aviso no front). */
export const putTargetAllocationsRequestSchema = z.object({
  items: z
    .array(
      z.object({
        assetClassId: idSchema,
        targetPct: percentSchema,
        maxPct: percentSchema.nullable().default(null),
      }),
    )
    .max(30),
})
export type PutTargetAllocationsRequest = z.input<typeof putTargetAllocationsRequestSchema>

// ─── Ativos ──────────────────────────────────────────────────────────────────

export const quoteModeSchema = z.enum(['auto', 'manual'])

export const fixedIncomeInfoSchema = z.object({
  indexer: z.enum(['CDI', 'IPCA', 'PRE', 'SELIC', 'OTHER']).nullable().default(null),
  rate: z.string().trim().max(40).nullable().default(null),
  maturity: isoDateSchema.nullable().default(null),
  liquidity: z.enum(['daily', 'at_maturity']).nullable().default(null),
})
export type FixedIncomeInfo = z.infer<typeof fixedIncomeInfoSchema>

export const assetSchema = z.object({
  id: idSchema,
  assetClassId: idSchema,
  ticker: z.string().nullable(),
  name: z.string(),
  accountId: idSchema.nullable(),
  quoteMode: quoteModeSchema,
  fixedIncomeInfo: fixedIncomeInfoSchema.nullable(),
  targetWeightPct: z.string().nullable(),
  maxWeightPct: z.string().nullable(),
  manualPrice: z.string().nullable(),
  manualPriceAt: z.string().nullable(),
  manualValueCents: z.number().int().nullable(),
  manualValueAt: z.string().nullable(),
  isArchived: z.boolean(),
  ...timestampsSchema,
})
export type Asset = z.infer<typeof assetSchema>

const tickerSchema = z
  .string()
  .trim()
  .transform(normalizeTicker)
  .refine(isTicker, 'Ticker inválido (ex.: ITSA4, MXRF11)')

export const createAssetRequestSchema = z
  .object({
    assetClassId: idSchema,
    ticker: tickerSchema.nullable().optional(),
    name: z.string().trim().max(80).optional(),
    accountId: idSchema.nullable().optional(),
    quoteMode: quoteModeSchema.optional(),
    fixedIncomeInfo: fixedIncomeInfoSchema.nullable().optional(),
    targetWeightPct: percentSchema.nullable().optional(),
    maxWeightPct: percentSchema.nullable().optional(),
    /** Preço atual informado no cadastro (RC-33); vale até uma cotação mais nova. */
    manualPrice: decimalStringSchema.nullable().optional(),
    /** Saldo atual informado no cadastro (renda fixa), em centavos. */
    manualValueCents: nonNegativeCentsSchema.nullable().optional(),
  })
  .refine((value) => Boolean(value.ticker) || Boolean(value.name), {
    message: 'Informe o ticker ou o nome',
    path: ['name'],
  })
export type CreateAssetRequest = z.input<typeof createAssetRequestSchema>

export const updateAssetRequestSchema = z.object({
  assetClassId: idSchema.optional(),
  name: z.string().trim().min(1).max(80).optional(),
  accountId: idSchema.nullable().optional(),
  quoteMode: quoteModeSchema.optional(),
  fixedIncomeInfo: fixedIncomeInfoSchema.nullable().optional(),
  targetWeightPct: percentSchema.nullable().optional(),
  maxWeightPct: percentSchema.nullable().optional(),
  /** RC-33: preço informado à mão (null limpa). */
  manualPrice: decimalStringSchema.nullable().optional(),
  /** Saldo atual informado (renda fixa), em centavos (null limpa). */
  manualValueCents: nonNegativeCentsSchema.nullable().optional(),
  isArchived: z.boolean().optional(),
})
export type UpdateAssetRequest = z.input<typeof updateAssetRequestSchema>

// ─── Operações ───────────────────────────────────────────────────────────────

export const tradeKindSchema = z.enum(TRADE_KINDS)
export type TradeKindValue = z.infer<typeof tradeKindSchema>

export const assetTradeSchema = z.object({
  id: idSchema,
  assetId: idSchema,
  kind: tradeKindSchema,
  tradeDate: isoDateSchema,
  quantity: z.string(),
  unitPrice: z.string(),
  feesCents: z.number().int(),
  totalCents: z.number().int(),
  splitRatio: z.string().nullable(),
  notes: z.string().nullable(),
  source: z.string(),
  ...timestampsSchema,
})
export type AssetTrade = z.infer<typeof assetTradeSchema>

export const createAssetTradeRequestSchema = z.object({
  assetId: idSchema,
  kind: tradeKindSchema,
  tradeDate: isoDateSchema,
  quantity: decimalStringSchema.default('0'),
  unitPrice: decimalStringSchema.default('0'),
  feesCents: nonNegativeCentsSchema.default(0),
  /** Valor da nota; sem ele, calcula qtd × preço + taxas (RC-20). */
  totalCents: nonNegativeCentsSchema.optional(),
  splitRatio: decimalStringSchema.nullable().optional(),
  notes: z.string().trim().max(500).nullable().optional(),
})
export type CreateAssetTradeRequest = z.input<typeof createAssetTradeRequestSchema>
/** Sem os `default` do cadastro: campo ausente fica como está (não vira 0). */
export const updateAssetTradeRequestSchema = createAssetTradeRequestSchema
  .omit({ assetId: true })
  .extend({
    quantity: decimalStringSchema,
    unitPrice: decimalStringSchema,
    feesCents: nonNegativeCentsSchema,
  })
  .partial()
export type UpdateAssetTradeRequest = z.input<typeof updateAssetTradeRequestSchema>

// ─── Proventos ───────────────────────────────────────────────────────────────

export const dividendKindSchema = z.enum(DIVIDEND_KINDS)

export const dividendSchema = z.object({
  id: idSchema,
  assetId: idSchema,
  kind: dividendKindSchema,
  payDate: isoDateSchema,
  exDate: isoDateSchema.nullable(),
  amountCents: z.number().int(),
  grossCents: z.number().int().nullable(),
  quantityBase: z.string().nullable(),
  perShare: z.string().nullable(),
  notes: z.string().nullable(),
  source: z.string(),
  ...timestampsSchema,
})
export type Dividend = z.infer<typeof dividendSchema>

export const createDividendRequestSchema = z.object({
  assetId: idSchema,
  kind: dividendKindSchema.default('dividend'),
  payDate: isoDateSchema,
  exDate: isoDateSchema.nullable().optional(),
  amountCents: positiveCentsSchema,
  grossCents: positiveCentsSchema.nullable().optional(),
  quantityBase: decimalStringSchema.nullable().optional(),
  perShare: decimalStringSchema.nullable().optional(),
  notes: z.string().trim().max(500).nullable().optional(),
})
export type CreateDividendRequest = z.input<typeof createDividendRequestSchema>
export const updateDividendRequestSchema = createDividendRequestSchema
  .omit({ assetId: true })
  .extend({ kind: dividendKindSchema })
  .partial()
export type UpdateDividendRequest = z.input<typeof updateDividendRequestSchema>

/** POST /dividends/batch — lançamento do mês (RC-41): salva só os preenchidos. */
export const dividendBatchRequestSchema = z.object({
  payDate: isoDateSchema,
  items: z
    .array(
      z.object({
        assetId: idSchema,
        amountCents: positiveCentsSchema,
        kind: dividendKindSchema.default('dividend'),
      }),
    )
    .min(1, 'Preencha pelo menos um valor')
    .max(300),
})
export type DividendBatchRequest = z.input<typeof dividendBatchRequestSchema>

// ─── Cotações e posição ──────────────────────────────────────────────────────

export const quoteSchema = z.object({
  ticker: z.string(),
  price: z.string().nullable(),
  changePct: z.number().nullable(),
  name: z.string().nullable(),
  /** Momento da cotação no provedor. */
  quotedAt: z.string().nullable(),
  fetchedAt: z.string().nullable(),
  error: z.string().nullable(),
})
export type Quote = z.infer<typeof quoteSchema>

export const quotesStatusSchema = z.object({
  provider: z.string(),
  /** Provedor configurado (há token). */
  enabled: z.boolean(),
  /** Chamadas restantes no mês (orçamento). */
  budgetLeft: z.number().int(),
  /** Tickers que estavam vencidos e ficaram para depois (limite por requisição/orçamento). */
  pending: z.number().int(),
})
export type QuotesStatus = z.infer<typeof quotesStatusSchema>

/** De onde veio o preço exibido. */
export const priceSourceSchema = z.enum(['quote', 'manual_price', 'manual_value', 'cost'])

export const positionSchema = z.object({
  asset: assetSchema,
  quantity: z.string(),
  avgPrice: z.string(),
  costCents: z.number().int(),
  realizedPnlCents: z.number().int(),
  price: z.string().nullable(),
  priceSource: priceSourceSchema,
  priceAt: z.string().nullable(),
  changePct: z.number().nullable(),
  valueCents: z.number().int(),
  resultCents: z.number().int(),
  resultPct: z.number().nullable(),
  weightInClass: z.number(),
  weightInPortfolio: z.number(),
  dividends12mCents: z.number().int(),
  yieldOnCost: z.number().nullable(),
  /** Erro de cálculo (ex.: venda maior que a posição) — o ativo aparece zerado com aviso. */
  error: z.string().nullable(),
})
export type Position = z.infer<typeof positionSchema>

export const classAllocationSchema = z.object({
  assetClass: assetClassSchema,
  valueCents: z.number().int(),
  costCents: z.number().int(),
  resultCents: z.number().int(),
  current: z.number(),
  target: z.number().nullable(),
  deviationPp: z.number().nullable(),
  offTarget: z.boolean(),
  aboveMax: z.boolean(),
  missingCents: z.number().int(),
})
export type ClassAllocation = z.infer<typeof classAllocationSchema>

/** GET /portfolio — posição completa com cotações do cache. */
export const portfolioResponseSchema = z.object({
  totals: z.object({
    valueCents: z.number().int(),
    costCents: z.number().int(),
    resultCents: z.number().int(),
    resultPct: z.number().nullable(),
    dividends12mCents: z.number().int(),
    /** Variação do dia dos ativos cotados (centavos). */
    dayChangeCents: z.number().int(),
  }),
  classes: z.array(classAllocationSchema),
  positions: z.array(positionSchema),
  /** Soma das metas (aviso quando ≠ 100). */
  targetsTotalPct: z.string(),
  quotes: quotesStatusSchema,
  /** Cotação mais antiga entre os ativos cotados (para "atualizado há X"). */
  oldestQuoteAt: z.string().nullable(),
  alerts: z.array(
    z.object({
      kind: z.enum(['off_target', 'above_max', 'asset_above_max', 'position_error']),
      message: z.string(),
    }),
  ),
})
export type PortfolioResponse = z.infer<typeof portfolioResponseSchema>

/** GET /assets/:id — detalhe do ativo. */
export const assetDetailResponseSchema = z.object({
  position: positionSchema,
  assetClass: assetClassSchema,
  quote: quoteSchema.nullable(),
  trades: z.array(assetTradeSchema),
  dividends: z.array(dividendSchema),
  dividendsTotalCents: z.number().int(),
})
export type AssetDetailResponse = z.infer<typeof assetDetailResponseSchema>

/** GET /dividends/summary?months=12 */
export const dividendsSummaryResponseSchema = z.object({
  months: z.array(
    z.object({
      month: z.string(),
      amountCents: z.number().int(),
      byClass: z.record(z.string(), z.number().int()),
    }),
  ),
  yearTotalCents: z.number().int(),
  average12mCents: z.number().int(),
  topPayer: z.object({ assetId: idSchema, amountCents: z.number().int() }).nullable(),
})
export type DividendsSummaryResponse = z.infer<typeof dividendsSummaryResponseSchema>

/** GET /tickers/search?q= */
export const tickerSearchResponseSchema = z.object({
  results: z.array(z.object({ ticker: z.string(), name: z.string().nullable() })),
  /** A lista veio do provedor (senão, só validamos o formato). */
  providerAvailable: z.boolean(),
})
export type TickerSearchResponse = z.infer<typeof tickerSearchResponseSchema>
