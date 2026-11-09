/**
 * Balanço e rentabilidade (Fase 7, docs/07 e docs/11 › Balanço).
 */
import { BALANCE_STATUSES } from '@orla/core'
import { z } from 'zod'
import { competenceMonthSchema, idSchema, nonNegativeCentsSchema } from './common.ts'
import { isoDateSchema } from './finances.ts'
import { decimalStringSchema } from './portfolio.ts'
import { contributionSourceSchema, contributionTimingSchema } from './settings.ts'

export const balanceStatusSchema = z.enum(BALANCE_STATUSES)
export const balanceItemKindSchema = z.enum(['asset', 'cash'])

export const balanceItemSchema = z.object({
  id: idSchema,
  kind: balanceItemKindSchema,
  assetId: idSchema.nullable(),
  assetClassId: idSchema.nullable(),
  accountId: idSchema.nullable(),
  label: z.string(),
  ticker: z.string().nullable(),
  quantity: z.string().nullable(),
  price: z.string().nullable(),
  valueCents: z.number().int(),
  dy: z.string().nullable(),
  pvp: z.string().nullable(),
  sortOrder: z.number().int(),
})
export type BalanceItem = z.infer<typeof balanceItemSchema>

export const balanceSchema = z.object({
  id: idSchema,
  competenceMonth: competenceMonthSchema,
  referenceDate: isoDateSchema,
  totalCents: z.number().int(),
  /** Congelados no fechamento (null em rascunho). */
  contributionsCents: z.number().int().nullable(),
  dividendsCents: z.number().int().nullable(),
  notes: z.string().nullable(),
  status: balanceStatusSchema,
  closedAt: z.string().nullable(),
  source: z.string(),
  items: z.array(balanceItemSchema),
  createdAt: z.string(),
  updatedAt: z.string(),
})
export type Balance = z.infer<typeof balanceSchema>

/** Uma linha da série: o balanço com ganho real, taxa e acumulados (core/balance). */
export const balanceRowSchema = z.object({
  id: idSchema,
  competenceMonth: competenceMonthSchema,
  referenceDate: isoDateSchema,
  status: balanceStatusSchema,
  totalCents: z.number().int(),
  previousTotalCents: z.number().int().nullable(),
  contributionsCents: z.number().int(),
  dividendsCents: z.number().int(),
  gainCents: z.number().int().nullable(),
  rate: z.number().nullable(),
  cumulative: z.number().nullable(),
  yearCumulative: z.number().nullable(),
  investedCents: z.number().int(),
  contributionsChanged: z.boolean(),
})
export type BalanceRow = z.infer<typeof balanceRowSchema>

export const yearSummarySchema = z.object({
  year: z.string(),
  months: z.number().int(),
  gainCents: z.number().int(),
  contributionsCents: z.number().int(),
  dividendsCents: z.number().int(),
  twr: z.number().nullable(),
  capitalBaseCents: z.number().int(),
  gainOnCapital: z.number().nullable(),
  averageMonthlyRate: z.number().nullable(),
  projectionCents: z.number().int().nullable(),
  lastTotalCents: z.number().int().nullable(),
})
export type YearSummaryValue = z.infer<typeof yearSummarySchema>

/** GET /balances — série completa + resumo por ano. */
export const balancesResponseSchema = z.object({
  data: z.array(balanceRowSchema),
  years: z.array(yearSummarySchema),
  settings: z.object({
    contributionTiming: contributionTimingSchema,
    returnContributionSource: contributionSourceSchema,
  }),
  /** Mês atual já tem balanço (atalho "Fazer balanço" destacado quando não). */
  currentMonth: competenceMonthSchema,
  currentMonthDone: z.boolean(),
})
export type BalancesResponse = z.infer<typeof balancesResponseSchema>

/** Linha do formulário (RB-02): o que entra no balanço, pré-preenchido. */
export const balanceFormRowSchema = z.object({
  kind: balanceItemKindSchema,
  assetId: idSchema.nullable(),
  assetClassId: idSchema.nullable(),
  accountId: idSchema.nullable(),
  label: z.string(),
  name: z.string(),
  ticker: z.string().nullable(),
  /** Renda fixa e saldo em conta: digita o valor; bolsa: qtd × preço. */
  manualValue: z.boolean(),
  quantity: z.string().nullable(),
  price: z.string().nullable(),
  /** null = a preencher. */
  valueCents: z.number().int().nullable(),
  dy: z.string().nullable(),
  pvp: z.string().nullable(),
  /** Valor no balanço anterior ("mês passado: R$ 5.012,30"). */
  previousValueCents: z.number().int().nullable(),
})
export type BalanceFormRow = z.infer<typeof balanceFormRowSchema>

/** GET /balances/form?month=AAAA-MM[&date=] — tudo que o formulário precisa. */
export const balanceFormResponseSchema = z.object({
  competenceMonth: competenceMonthSchema,
  referenceDate: isoDateSchema,
  balance: balanceSchema.nullable(),
  rows: z.array(balanceFormRowSchema),
  previous: z
    .object({
      id: idSchema,
      competenceMonth: competenceMonthSchema,
      referenceDate: isoDateSchema,
      totalCents: z.number().int(),
    })
    .nullable(),
  /** Calculados ao vivo para o período (anterior, data]. */
  contributionsCents: z.number().int(),
  dividendsCents: z.number().int(),
  contributionTiming: contributionTimingSchema,
  /** Fluxos do período (para o Dietz no navegador). */
  flows: z.array(z.object({ date: isoDateSchema, amountCents: z.number().int() })),
})
export type BalanceFormResponse = z.infer<typeof balanceFormResponseSchema>

const balanceItemInputSchema = z
  .object({
    kind: balanceItemKindSchema,
    assetId: idSchema.nullable().optional(),
    accountId: idSchema.nullable().optional(),
    label: z.string().trim().max(80).optional(),
    quantity: decimalStringSchema.nullable().optional(),
    price: decimalStringSchema.nullable().optional(),
    valueCents: nonNegativeCentsSchema,
    dy: decimalStringSchema.nullable().optional(),
    pvp: decimalStringSchema.nullable().optional(),
  })
  .refine((item) => item.kind === 'cash' || Boolean(item.assetId), {
    message: 'Linha de ativo sem ativo',
    path: ['assetId'],
  })

/** POST /balances e PUT /balances/:id. */
export const saveBalanceRequestSchema = z.object({
  /** Mês do balanço (pode ser feito depois do fim do mês: o de outubro em 2/nov). */
  competenceMonth: competenceMonthSchema,
  referenceDate: isoDateSchema,
  notes: z.string().trim().max(1000).nullable().optional(),
  items: z.array(balanceItemInputSchema).max(500),
})
export type SaveBalanceRequest = z.input<typeof saveBalanceRequestSchema>

/** GET /observed-prices (RB-30). */
export const observedPriceSchema = z.object({
  key: z.string(),
  assetId: idSchema.nullable(),
  ticker: z.string().nullable(),
  name: z.string(),
  assetClassId: idSchema.nullable(),
  count: z.number().int(),
  max: z.object({ price: z.string(), date: isoDateSchema }),
  min: z.object({ price: z.string(), date: isoDateSchema }),
  last: z.object({
    price: z.string(),
    date: isoDateSchema,
    dy: z.string().nullable(),
    pvp: z.string().nullable(),
  }),
  lastDy: z.string().nullable(),
  lastPvp: z.string().nullable(),
  history: z.array(
    z.object({
      date: isoDateSchema,
      price: z.string(),
      dy: z.string().nullable(),
      pvp: z.string().nullable(),
    }),
  ),
  currentPrice: z.string().nullable(),
  avgPrice: z.string().nullable(),
  aboveMin: z.number().nullable(),
  belowMax: z.number().nullable(),
})
export type ObservedPriceValue = z.infer<typeof observedPriceSchema>
export const observedPricesResponseSchema = z.object({ data: z.array(observedPriceSchema) })
