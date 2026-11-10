import { isIsoDate, isNatureAllowed, MAX_INSTALLMENTS } from '@orla/core'
import { z } from 'zod'
import {
  competenceMonthSchema,
  dayOfMonthSchema,
  idSchema,
  nameSchema,
  nonNegativeCentsSchema,
  positiveCentsSchema,
  timestampsSchema,
} from './common.ts'
import { paymentMethodSchema } from './registrations.ts'
import { savingsGoalSchema } from './settings.ts'

/** Data `YYYY-MM-DD` (docs/11). */
export const isoDateSchema = z
  .string()
  .refine((value): boolean => isIsoDate(value), 'Data inválida (use AAAA-MM-DD)')

export const transactionTypeSchema = z.enum(['income', 'expense'])
export type TransactionType = z.infer<typeof transactionTypeSchema>
export const transactionNatureSchema = z.enum([
  'fixed',
  'variable',
  'planned',
  'installment',
  'extra',
  /** Saldo do mês anterior (RF-54) — só a API cria (POST /months/:month/carryover). */
  'carryover',
])
export type TransactionNature = z.infer<typeof transactionNatureSchema>
export const transactionStatusSchema = z.enum(['forecast', 'settled'])
export type TransactionStatus = z.infer<typeof transactionStatusSchema>
export type PaymentMethod = z.infer<typeof paymentMethodSchema>

const descriptionSchema = nameSchema(80)
const notesSchema = z.string().trim().max(500, 'Use no máximo 500 caracteres')
const tagsSchema = z.array(z.string().trim().min(1).max(30)).max(10, 'No máximo 10 tags')

// ─── Lançamentos ─────────────────────────────────────────────────────────────

export const transactionSchema = z.object({
  id: idSchema,
  type: transactionTypeSchema,
  nature: transactionNatureSchema,
  status: transactionStatusSchema,
  description: z.string(),
  amountCents: z.number().int(),
  competenceMonth: competenceMonthSchema,
  date: isoDateSchema,
  categoryId: idSchema.nullable(),
  accountId: idSchema.nullable(),
  payeeId: idSchema.nullable(),
  paymentMethod: paymentMethodSchema.nullable(),
  creditCardId: idSchema.nullable(),
  recurringTemplateId: idSchema.nullable(),
  installmentPlanId: idSchema.nullable(),
  installmentNumber: z.number().int().nullable(),
  /** Total de parcelas do parcelamento de origem (para exibir "3/12"). */
  installmentsCount: z.number().int().nullable(),
  parentPlannedId: idSchema.nullable(),
  isOverride: z.boolean(),
  tags: z.array(z.string()),
  notes: z.string().nullable(),
  source: z.enum(['manual', 'import', 'template', 'plan', 'bot']),
  ...timestampsSchema,
})
export type Transaction = z.infer<typeof transactionSchema>

const transactionFields = {
  type: transactionTypeSchema,
  /** Parcelas são criadas pelo parcelamento, nunca à mão. */
  nature: transactionNatureSchema.exclude(['installment']),
  status: transactionStatusSchema,
  description: descriptionSchema,
  amountCents: positiveCentsSchema,
  date: isoDateSchema,
  /** Omitido → mês da data, ou da fatura no crédito (RF-02/03). */
  competenceMonth: competenceMonthSchema,
  categoryId: idSchema.nullable(),
  accountId: idSchema.nullable(),
  payeeId: idSchema.nullable(),
  paymentMethod: paymentMethodSchema.nullable(),
  creditCardId: idSchema.nullable(),
  parentPlannedId: idSchema.nullable(),
  tags: tagsSchema,
  notes: notesSchema.nullable(),
}

export const createTransactionRequestSchema = z
  .object({
    ...transactionFields,
    status: transactionFields.status.optional(),
    competenceMonth: transactionFields.competenceMonth.optional(),
    categoryId: transactionFields.categoryId.optional(),
    accountId: transactionFields.accountId.optional(),
    payeeId: transactionFields.payeeId.optional(),
    paymentMethod: transactionFields.paymentMethod.optional(),
    creditCardId: transactionFields.creditCardId.optional(),
    parentPlannedId: transactionFields.parentPlannedId.optional(),
    tags: transactionFields.tags.optional(),
    notes: transactionFields.notes.optional(),
  })
  .superRefine((value, ctx) => {
    if (!isNatureAllowed(value.type, value.nature)) {
      ctx.addIssue({
        code: 'custom',
        path: ['nature'],
        message:
          value.type === 'income' ? 'Receita é fixa ou extra' : 'Natureza inválida para despesa',
      })
    }
    if (value.paymentMethod === 'credit' && !value.creditCardId) {
      ctx.addIssue({ code: 'custom', path: ['creditCardId'], message: 'Escolha o cartão' })
    }
  })
export type CreateTransactionRequest = z.infer<typeof createTransactionRequestSchema>

/** Campos opcionais; a API valida a combinação final (natureza × tipo, crédito × cartão). */
export const updateTransactionRequestSchema = z.object(transactionFields).partial()
export type UpdateTransactionRequest = z.infer<typeof updateTransactionRequestSchema>

/** POST /transactions/:id/settle — "Paguei/Recebi", com valor e data opcionais (RF-15/22). */
export const settleTransactionRequestSchema = z.object({
  amountCents: positiveCentsSchema.optional(),
  date: isoDateSchema.optional(),
})
export type SettleTransactionRequest = z.infer<typeof settleTransactionRequestSchema>

const optionalId = idSchema.optional()
/** GET /transactions — filtros (docs/11). */
export const transactionListQuerySchema = z.object({
  month: competenceMonthSchema.optional(),
  type: transactionTypeSchema.optional(),
  nature: transactionNatureSchema.optional(),
  status: transactionStatusSchema.optional(),
  categoryId: optionalId,
  cardId: optionalId,
  accountId: optionalId,
  payeeId: optionalId,
  q: z.string().trim().max(80).optional(),
  cursor: optionalId,
  limit: z.coerce.number().int().min(1).max(200).default(50),
})
export type TransactionListQuery = z.input<typeof transactionListQuerySchema>

// ─── Mês ─────────────────────────────────────────────────────────────────────

export const monthSummarySchema = z.object({
  incomeForecastCents: z.number().int(),
  incomeSettledCents: z.number().int(),
  expenseForecastCents: z.number().int(),
  expenseSettledCents: z.number().int(),
  savingsGoalCents: z.number().int(),
  /** Quanto da meta já foi investido (a meta funciona como uma conta do mês). */
  goalInvestedCents: z.number().int(),
  /** Quanto falta investir para cumprir a meta. */
  goalRemainingCents: z.number().int(),
  /** Saldo trazido do mês anterior, com sinal (RF-54); fora de entradas/saídas. */
  carryoverCents: z.number().int(),
  projectedSurplusCents: z.number().int(),
  currentBalanceCents: z.number().int(),
  freeToSpendCents: z.number().int(),
  goalShortfallCents: z.number().int(),
})
export type MonthSummaryResponse = z.infer<typeof monthSummarySchema>

/**
 * Saldo do mês anterior (RF-55) visto a partir deste mês:
 * `offer` = perguntar · `applied` = já levado e em dia · `stale` = o mês anterior mudou
 * desde que foi levado · `none` = nada a mostrar.
 */
export const monthCarryoverSchema = z.object({
  state: z.enum(['none', 'offer', 'applied', 'stale']),
  previousMonth: competenceMonthSchema,
  /** Saldo atual do mês anterior, com sinal — o que seria levado. */
  previousBalanceCents: z.number().int(),
  /** O que já foi levado para este mês, com sinal (null = nada). */
  appliedCents: z.number().int().nullable(),
  /** O mês anterior ainda não terminou: o valor pode mudar. */
  previousMonthOpen: z.boolean(),
  /** Lançamentos ainda previstos no mês anterior (o saldo ainda pode mudar). */
  previousPendingCount: z.number().int(),
})
export type MonthCarryover = z.infer<typeof monthCarryoverSchema>

/** GET /months/:month — materializa os modelos e devolve o mês inteiro. */
export const monthResponseSchema = z.object({
  month: competenceMonthSchema,
  summary: monthSummarySchema,
  settings: z.object({
    /** Meta deste mês (null = usa a padrão). */
    savingsGoalCents: z.number().int().nullable(),
    /** Quanto já investiu neste mês (null = nada registrado). */
    goalInvestedCents: z.number().int().nullable(),
    defaultSavingsGoal: savingsGoalSchema,
    notes: z.string().nullable(),
  }),
  carryover: monthCarryoverSchema,
  transactions: z.array(transactionSchema),
})
export type MonthResponse = z.infer<typeof monthResponseSchema>

export const updateMonthSettingsRequestSchema = z
  .object({
    savingsGoalCents: nonNegativeCentsSchema.nullable(),
    goalInvestedCents: nonNegativeCentsSchema.nullable(),
    notes: notesSchema.nullable(),
  })
  .partial()
export type UpdateMonthSettingsRequest = z.infer<typeof updateMonthSettingsRequestSchema>

export const monthSettingsResponseSchema = z.object({
  savingsGoalCents: z.number().int().nullable(),
  goalInvestedCents: z.number().int().nullable(),
  notes: z.string().nullable(),
})
export type MonthSettingsResponse = z.infer<typeof monthSettingsResponseSchema>

// ─── Modelos recorrentes ─────────────────────────────────────────────────────

export const recurringTemplateSchema = z.object({
  id: idSchema,
  type: transactionTypeSchema,
  nature: z.enum(['fixed', 'planned']),
  description: z.string(),
  amountCents: z.number().int(),
  categoryId: idSchema.nullable(),
  accountId: idSchema.nullable(),
  payeeId: idSchema.nullable(),
  paymentMethod: paymentMethodSchema.nullable(),
  creditCardId: idSchema.nullable(),
  frequency: z.enum(['monthly', 'yearly']),
  monthOfYear: z.number().int().nullable(),
  dayOfMonth: z.number().int(),
  startMonth: competenceMonthSchema,
  endMonth: competenceMonthSchema.nullable(),
  isActive: z.boolean(),
  ...timestampsSchema,
})
export type RecurringTemplate = z.infer<typeof recurringTemplateSchema>

const templateFields = {
  type: transactionTypeSchema,
  nature: z.enum(['fixed', 'planned']),
  description: nameSchema(60),
  amountCents: positiveCentsSchema,
  categoryId: idSchema.nullable(),
  accountId: idSchema.nullable(),
  payeeId: idSchema.nullable(),
  paymentMethod: paymentMethodSchema.nullable(),
  creditCardId: idSchema.nullable(),
  frequency: z.enum(['monthly', 'yearly']),
  monthOfYear: z.number().int().min(1, 'Mês entre 1 e 12').max(12, 'Mês entre 1 e 12').nullable(),
  dayOfMonth: dayOfMonthSchema,
  startMonth: competenceMonthSchema,
  endMonth: competenceMonthSchema.nullable(),
  isActive: z.boolean(),
}

type TemplateShape = {
  type?: TransactionType | undefined
  nature?: 'fixed' | 'planned' | undefined
  frequency?: 'monthly' | 'yearly' | undefined
  monthOfYear?: number | null | undefined
  paymentMethod?: PaymentMethod | null | undefined
  creditCardId?: string | null | undefined
  startMonth?: string | undefined
  endMonth?: string | null | undefined
}

function checkTemplate(value: TemplateShape, ctx: z.RefinementCtx): void {
  if (value.type === 'income' && value.nature === 'planned') {
    ctx.addIssue({ code: 'custom', path: ['nature'], message: 'Planejamento é só para despesas' })
  }
  if (value.frequency === 'yearly' && value.monthOfYear == null) {
    ctx.addIssue({ code: 'custom', path: ['monthOfYear'], message: 'Escolha o mês do ano' })
  }
  if (value.paymentMethod === 'credit' && !value.creditCardId) {
    ctx.addIssue({ code: 'custom', path: ['creditCardId'], message: 'Escolha o cartão' })
  }
  if (value.startMonth && value.endMonth && value.endMonth < value.startMonth) {
    ctx.addIssue({ code: 'custom', path: ['endMonth'], message: 'O fim vem antes do início' })
  }
}

export const createRecurringTemplateRequestSchema = z
  .object({
    ...templateFields,
    nature: templateFields.nature.default('fixed'),
    frequency: templateFields.frequency.default('monthly'),
    categoryId: templateFields.categoryId.optional(),
    accountId: templateFields.accountId.optional(),
    payeeId: templateFields.payeeId.optional(),
    paymentMethod: templateFields.paymentMethod.optional(),
    creditCardId: templateFields.creditCardId.optional(),
    monthOfYear: templateFields.monthOfYear.optional(),
    endMonth: templateFields.endMonth.optional(),
    isActive: templateFields.isActive.optional(),
  })
  .superRefine(checkTemplate)
export type CreateRecurringTemplateRequest = z.input<typeof createRecurringTemplateRequestSchema>

/**
 * PATCH /recurring-templates/:id — `applyFromMonth` (RF-13): os lançamentos previstos
 * gerados a partir desse mês, e não editados à mão, recebem a mudança. Padrão: mês atual.
 */
export const updateRecurringTemplateRequestSchema = z
  .object(templateFields)
  .omit({ type: true })
  .partial()
  .extend({ applyFromMonth: competenceMonthSchema.optional() })
  .superRefine(checkTemplate)
export type UpdateRecurringTemplateRequest = z.infer<typeof updateRecurringTemplateRequestSchema>

/** DELETE /recurring-templates/:id?removeFromMonth=YYYY-MM (RF-14). */
export const deleteRecurringTemplateQuerySchema = z.object({
  removeFromMonth: competenceMonthSchema.optional(),
})

// ─── Parcelamentos ───────────────────────────────────────────────────────────

export const installmentPlanStatusSchema = z.enum(['active', 'paid_off', 'canceled'])

export const installmentIndicatorsSchema = z.object({
  currentNumber: z.number().int().nullable(),
  phase: z.enum(['not_started', 'running', 'finished']),
  paidCents: z.number().int(),
  remainingCents: z.number().int(),
  paidCount: z.number().int(),
  remainingCount: z.number().int(),
  progress: z.number(),
  lastCompetenceMonth: competenceMonthSchema,
})

export const installmentPlanSchema = z.object({
  id: idSchema,
  /** `expense` = parcelado a pagar (compra); `income` = parcelado a receber. */
  type: transactionTypeSchema,
  description: z.string(),
  payeeId: idSchema.nullable(),
  categoryId: idSchema.nullable(),
  creditCardId: idSchema.nullable(),
  accountId: idSchema.nullable(),
  paymentMethod: paymentMethodSchema,
  purchaseDate: isoDateSchema,
  totalCents: z.number().int(),
  installmentsCount: z.number().int(),
  firstCompetenceMonth: competenceMonthSchema,
  status: installmentPlanStatusSchema,
  paidOffAt: isoDateSchema.nullable(),
  payoffDiscountCents: z.number().int().nullable(),
  notes: z.string().nullable(),
  /** Indicadores no mês atual (RF-44). */
  indicators: installmentIndicatorsSchema,
  ...timestampsSchema,
})
export type InstallmentPlan = z.infer<typeof installmentPlanSchema>

export const installmentPlanDetailSchema = z.object({
  plan: installmentPlanSchema,
  /** Parcelas (e a quitação antecipada, se houver), em ordem. */
  installments: z.array(transactionSchema),
})
export type InstallmentPlanDetail = z.infer<typeof installmentPlanDetailSchema>

const installmentsCountSchema = z
  .number({ message: 'Informe o nº de parcelas' })
  .int('Nº de parcelas inválido')
  .min(1, 'Pelo menos 1 parcela')
  .max(MAX_INSTALLMENTS, `No máximo ${MAX_INSTALLMENTS} parcelas`)

/**
 * POST /installment-plans (RF-40): informe o **total** ou o **valor da parcela**.
 * `currentInstallment` = "já estou na parcela k" (RF-43).
 * `type: 'income'` = parcelado a receber (RF-49): sem cartão, `purchaseDate` é a data do
 * 1º recebimento e as parcelas viram receitas.
 */
export const createInstallmentPlanRequestSchema = z
  .object({
    type: transactionTypeSchema.default('expense'),
    description: descriptionSchema,
    payeeId: idSchema.nullable().optional(),
    categoryId: idSchema.nullable().optional(),
    paymentMethod: paymentMethodSchema.default('credit'),
    creditCardId: idSchema.nullable().optional(),
    accountId: idSchema.nullable().optional(),
    purchaseDate: isoDateSchema,
    totalCents: positiveCentsSchema.optional(),
    installmentCents: positiveCentsSchema.optional(),
    installmentsCount: installmentsCountSchema,
    firstCompetenceMonth: competenceMonthSchema.optional(),
    currentInstallment: z.number().int().min(1).optional(),
    notes: notesSchema.nullable().optional(),
  })
  .superRefine((value, ctx) => {
    if ((value.totalCents === undefined) === (value.installmentCents === undefined)) {
      ctx.addIssue({
        code: 'custom',
        path: ['totalCents'],
        message: 'Informe o valor total ou o valor da parcela',
      })
    }
    if (value.type === 'expense' && value.paymentMethod === 'credit' && !value.creditCardId) {
      ctx.addIssue({ code: 'custom', path: ['creditCardId'], message: 'Escolha o cartão' })
    }
    if (
      value.currentInstallment !== undefined &&
      value.currentInstallment > value.installmentsCount
    ) {
      ctx.addIssue({
        code: 'custom',
        path: ['currentInstallment'],
        message: 'A parcela atual passa do nº de parcelas',
      })
    }
  })
export type CreateInstallmentPlanRequest = z.input<typeof createInstallmentPlanRequestSchema>

/** PATCH /installment-plans/:id — mudar valores regera só parcelas previstas (RF-47). */
export const updateInstallmentPlanRequestSchema = z
  .object({
    description: descriptionSchema,
    payeeId: idSchema.nullable(),
    categoryId: idSchema.nullable(),
    creditCardId: idSchema.nullable(),
    accountId: idSchema.nullable(),
    totalCents: positiveCentsSchema,
    installmentsCount: installmentsCountSchema,
    firstCompetenceMonth: competenceMonthSchema,
    notes: notesSchema.nullable(),
  })
  .partial()
export type UpdateInstallmentPlanRequest = z.infer<typeof updateInstallmentPlanRequestSchema>

/** POST /installment-plans/:id/payoff (RF-46). */
export const payoffInstallmentPlanRequestSchema = z.object({
  amountCents: positiveCentsSchema,
  date: isoDateSchema,
  /** Competência da quitação; padrão: mês da data. */
  competenceMonth: competenceMonthSchema.optional(),
})
export type PayoffInstallmentPlanRequest = z.infer<typeof payoffInstallmentPlanRequestSchema>

/** Filtro `?type=` da lista e do resumo: a pagar (padrão) ou a receber. */
export const installmentPlanTypeQuerySchema = z.object({
  type: transactionTypeSchema.default('expense'),
})

/**
 * GET /installment-plans/summary?type= (RF-45). Em `income` os valores são "a receber":
 * `payoffTotalCents` = falta receber, `monthly` = quanto entra por mês, `freeFromMonth` =
 * mês seguinte ao último recebimento.
 */
export const installmentSummarySchema = z.object({
  payoffTotalCents: z.number().int(),
  activeCount: z.number().int(),
  byCard: z.array(
    z.object({ creditCardId: idSchema.nullable(), remainingCents: z.number().int() }),
  ),
  monthly: z.array(z.object({ month: competenceMonthSchema, amountCents: z.number().int() })),
  freeFromMonth: competenceMonthSchema,
})
export type InstallmentSummary = z.infer<typeof installmentSummarySchema>

// ─── Fatura do cartão ────────────────────────────────────────────────────────

/** GET /credit-cards/:id/statements/:month (RF-31/32). */
export const cardStatementSchema = z.object({
  creditCardId: idSchema,
  month: competenceMonthSchema,
  closingDate: isoDateSchema,
  dueDate: isoDateSchema,
  status: z.enum(['open', 'closed', 'paid']),
  totalCents: z.number().int(),
  settledCents: z.number().int(),
  /** Σ lançamentos previstos deste cartão em faturas depois desta (RF-32). */
  futureTotalCents: z.number().int(),
  transactions: z.array(transactionSchema),
})
export type CardStatement = z.infer<typeof cardStatementSchema>

// ─── Estabelecimento: memória do último lançamento (RM-03) ───────────────────

export const payeeSuggestionSchema = z.object({
  categoryId: idSchema.nullable(),
  paymentMethod: paymentMethodSchema.nullable(),
  creditCardId: idSchema.nullable(),
  accountId: idSchema.nullable(),
})
export type PayeeSuggestion = z.infer<typeof payeeSuggestionSchema>
