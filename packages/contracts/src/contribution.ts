/**
 * Aporte (Fase 6, docs/06 e docs/11 › Aporte): simulações, efetivação e aportes externos.
 * O cálculo roda no navegador (core/contribution); a API valida, salva e efetiva.
 */
import { PLAN_ITEM_MODES, PLAN_STATUSES } from '@orla/core'
import { z } from 'zod'
import {
  centsSchema,
  competenceMonthSchema,
  idSchema,
  nonNegativeCentsSchema,
  positiveCentsSchema,
  timestampsSchema,
} from './common.ts'
import { isoDateSchema } from './finances.ts'
import { decimalStringSchema, tickerSchema } from './portfolio.ts'

export const planStatusSchema = z.enum(PLAN_STATUSES)
export const planItemModeSchema = z.enum(PLAN_ITEM_MODES)
export type PlanItemModeValue = z.infer<typeof planItemModeSchema>

/** Ativo que ainda não existe (RA-11): criado na efetivação. */
export const newPlanAssetSchema = z.object({
  ticker: tickerSchema.nullable(),
  name: z.string().trim().min(1).max(80),
  assetClassId: idSchema,
})
export type NewPlanAsset = z.infer<typeof newPlanAssetSchema>

export const planItemSchema = z.object({
  id: idSchema,
  assetId: idSchema.nullable(),
  newAsset: newPlanAssetSchema.nullable(),
  mode: planItemModeSchema,
  quantity: z.string(),
  unitPrice: z.string(),
  valueCents: z.number().int(),
  sortOrder: z.number().int(),
  executedTradeId: idSchema.nullable(),
  executedAt: z.string().nullable(),
})
export type PlanItem = z.infer<typeof planItemSchema>

export const contributionPlanSchema = z.object({
  id: idSchema,
  competenceMonth: competenceMonthSchema,
  name: z.string(),
  totalCents: z.number().int(),
  status: planStatusSchema,
  /** { assetClassId: pct } — pct em texto decimal. */
  classSplit: z.record(z.string(), z.string()),
  isPrimary: z.boolean(),
  executedAt: z.string().nullable(),
  items: z.array(planItemSchema),
  ...timestampsSchema,
})
export type ContributionPlan = z.infer<typeof contributionPlanSchema>

const planItemInputSchema = z
  .object({
    assetId: idSchema.nullable().optional(),
    newAsset: newPlanAssetSchema.nullable().optional(),
    mode: planItemModeSchema,
    quantity: decimalStringSchema.default('0'),
    unitPrice: decimalStringSchema.default('0'),
    valueCents: nonNegativeCentsSchema.default(0),
  })
  .refine((item) => Boolean(item.assetId) !== Boolean(item.newAsset), {
    message: 'Cada item precisa de um ativo (existente ou novo)',
    path: ['assetId'],
  })

/** POST /contribution-plans e PUT /contribution-plans/:id (rascunho salvo sozinho). */
export const saveContributionPlanRequestSchema = z.object({
  competenceMonth: competenceMonthSchema,
  name: z.string().trim().min(1).max(60),
  totalCents: nonNegativeCentsSchema,
  classSplit: z.record(idSchema, decimalStringSchema),
  isPrimary: z.boolean().optional(),
  items: z.array(planItemInputSchema).max(100, 'No máximo 100 itens por simulação'),
})
export type SaveContributionPlanRequest = z.input<typeof saveContributionPlanRequestSchema>

/** POST /contribution-plans/:id/execute — "Comprei" (RA-31/32). */
export const executeContributionPlanRequestSchema = z.object({
  date: isoDateSchema,
  items: z
    .array(
      z.object({
        itemId: idSchema,
        /** Quantidade e preço reais pagos (podem diferir do simulado). */
        quantity: decimalStringSchema,
        unitPrice: decimalStringSchema,
        feesCents: nonNegativeCentsSchema.default(0),
        /** Total da nota; sem ele, qtd × preço + taxas. Renda fixa: o valor aplicado. */
        totalCents: positiveCentsSchema.optional(),
      }),
    )
    .min(1, 'Marque pelo menos um item comprado'),
  /** Soma o total ao "investido" da meta do mês (a meta funciona como uma conta). */
  registerInvested: z.boolean().default(true),
  accountId: idSchema.nullable().optional(),
})
export type ExecuteContributionPlanRequest = z.input<typeof executeContributionPlanRequestSchema>

export const contributionSchema = z.object({
  id: idSchema,
  date: isoDateSchema,
  competenceMonth: competenceMonthSchema,
  amountCents: z.number().int(),
  accountId: idSchema.nullable(),
  notes: z.string().nullable(),
  contributionPlanId: idSchema.nullable(),
  ...timestampsSchema,
})
export type Contribution = z.infer<typeof contributionSchema>

export const executeContributionPlanResponseSchema = z.object({
  plan: contributionPlanSchema,
  contribution: contributionSchema,
  tradesCreated: z.number().int(),
  assetsCreated: z.array(z.string()),
})
export type ExecuteContributionPlanResponse = z.infer<typeof executeContributionPlanResponseSchema>

/** Aporte lançado à mão (dinheiro que entrou ou saiu da carteira). */
export const createContributionRequestSchema = z.object({
  date: isoDateSchema,
  amountCents: centsSchema.refine((value) => value !== 0, 'Informe um valor'),
  accountId: idSchema.nullable().optional(),
  notes: z.string().trim().max(500).nullable().optional(),
})
export type CreateContributionRequest = z.input<typeof createContributionRequestSchema>
export const updateContributionRequestSchema = createContributionRequestSchema.partial()
export type UpdateContributionRequest = z.input<typeof updateContributionRequestSchema>
