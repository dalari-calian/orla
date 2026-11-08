import { z } from 'zod'
import { competenceMonthSchema, idSchema } from './common.ts'
import { isoDateSchema, monthSummarySchema, transactionSchema } from './finances.ts'
import { paymentMethodSchema } from './registrations.ts'

const cents = z.number().int()

// ─── Dashboard (doc 04 §8) ───────────────────────────────────────────────────

export const dashboardPeriodSchema = z.enum(['month', 'quarter', 'year'])
export type DashboardPeriod = z.infer<typeof dashboardPeriodSchema>

export const dashboardQuerySchema = z.object({
  period: dashboardPeriodSchema.default('month'),
})

/** Item de "próximos vencimentos": uma conta prevista ou uma fatura a pagar. */
export const upcomingItemSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('transaction'),
    date: isoDateSchema,
    amountCents: cents,
    transaction: transactionSchema,
  }),
  z.object({
    kind: z.literal('statement'),
    date: isoDateSchema,
    amountCents: cents,
    creditCardId: idSchema,
    competenceMonth: competenceMonthSchema,
  }),
])
export type UpcomingItem = z.infer<typeof upcomingItemSchema>

/** GET /upcoming?days=7 — contas e faturas que vencem nos próximos dias (+ atrasadas). */
export const upcomingQuerySchema = z.object({
  days: z.coerce.number().int().min(1).max(31).default(7),
})
export const upcomingResponseSchema = z.object({
  today: isoDateSchema,
  items: z.array(upcomingItemSchema),
})
export type UpcomingResponse = z.infer<typeof upcomingResponseSchema>

const share = z.number().min(0).max(1)

/** GET /months/:month/dashboard?period=month|quarter|year */
export const dashboardResponseSchema = z.object({
  month: competenceMonthSchema,
  period: dashboardPeriodSchema,
  months: z.array(competenceMonthSchema),
  summary: monthSummarySchema,
  previousSummary: monthSummarySchema,
  byCategory: z.array(
    z.object({
      categoryId: idSchema.nullable(),
      amountCents: cents,
      previousCents: cents,
      deltaCents: cents,
      share,
    }),
  ),
  byPaymentMethod: z.array(
    z.object({ paymentMethod: paymentMethodSchema.nullable(), amountCents: cents, share }),
  ),
  byAccount: z.array(z.object({ accountId: idSchema.nullable(), amountCents: cents, share })),
  byCard: z.array(z.object({ creditCardId: idSchema, amountCents: cents, share })),
  topPayees: z.array(z.object({ payeeId: idSchema, amountCents: cents, count: z.number().int() })),
  budgets: z.array(
    z.object({
      categoryId: idSchema,
      budgetCents: cents,
      spentCents: cents,
      ratio: z.number().min(0),
      level: z.enum(['ok', 'warning', 'exceeded']),
    }),
  ),
  /** Últimos 12 meses até o fim do período: entradas × saídas × sobra. */
  evolution: z.array(
    z.object({
      month: competenceMonthSchema,
      incomeCents: cents,
      expenseCents: cents,
      surplusCents: cents,
    }),
  ),
})
export type DashboardResponse = z.infer<typeof dashboardResponseSchema>

// ─── Projeção (RF-52) ────────────────────────────────────────────────────────

export const projectionQuerySchema = z.object({
  from: competenceMonthSchema.optional(),
  months: z.coerce.number().int().min(1).max(24).default(12),
})

export const projectionRowSchema = z.object({
  month: competenceMonthSchema,
  incomeCents: cents,
  fixedCents: cents,
  installmentCents: cents,
  plannedCents: cents,
  variableCents: cents,
  goalCents: cents,
  surplusCents: cents,
})
export type ProjectionRow = z.infer<typeof projectionRowSchema>

/** GET /projection?from=&months=12 */
export const projectionResponseSchema = z.object({
  from: competenceMonthSchema,
  rows: z.array(projectionRowSchema),
  firstNegativeMonth: competenceMonthSchema.nullable(),
})
export type ProjectionResponse = z.infer<typeof projectionResponseSchema>
