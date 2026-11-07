import { CATEGORY_ICONS } from '@orla/core'
import { z } from 'zod'
import {
  competenceMonthSchema,
  dayOfMonthSchema,
  hexColorSchema,
  idSchema,
  nameSchema,
  nonNegativeCentsSchema,
  positiveCentsSchema,
  timestampsSchema,
} from './common.ts'

// ─── Contas ──────────────────────────────────────────────────────────────────

export const accountKindSchema = z.enum(['checking', 'savings', 'brokerage', 'wallet', 'other'])
export type AccountKind = z.infer<typeof accountKindSchema>

export const accountSchema = z.object({
  id: idSchema,
  name: z.string(),
  kind: accountKindSchema,
  color: z.string(),
  isArchived: z.boolean(),
  ...timestampsSchema,
})
export type Account = z.infer<typeof accountSchema>

export const createAccountRequestSchema = z.object({
  name: nameSchema(),
  kind: accountKindSchema,
  color: hexColorSchema,
})
export type CreateAccountRequest = z.infer<typeof createAccountRequestSchema>

export const updateAccountRequestSchema = createAccountRequestSchema
  .extend({ isArchived: z.boolean() })
  .partial()
export type UpdateAccountRequest = z.infer<typeof updateAccountRequestSchema>

// ─── Cartões ─────────────────────────────────────────────────────────────────

export const creditCardSchema = z.object({
  id: idSchema,
  accountId: idSchema,
  name: z.string(),
  closingDay: z.number().int(),
  dueDay: z.number().int(),
  limitCents: z.number().int().nullable(),
  ...timestampsSchema,
})
export type CreditCard = z.infer<typeof creditCardSchema>

export const createCreditCardRequestSchema = z.object({
  accountId: idSchema,
  name: nameSchema(),
  closingDay: dayOfMonthSchema,
  dueDay: dayOfMonthSchema,
  limitCents: nonNegativeCentsSchema.nullable().optional(),
})
export type CreateCreditCardRequest = z.infer<typeof createCreditCardRequestSchema>

export const updateCreditCardRequestSchema = createCreditCardRequestSchema.partial()
export type UpdateCreditCardRequest = z.infer<typeof updateCreditCardRequestSchema>

// ─── Categorias ──────────────────────────────────────────────────────────────

export const categoryKindSchema = z.enum(['income', 'expense'])
export const categoryIconSchema = z.enum(CATEGORY_ICONS)

export const categorySchema = z.object({
  id: idSchema,
  kind: categoryKindSchema,
  name: z.string(),
  parentId: idSchema.nullable(),
  icon: categoryIconSchema,
  color: z.string(),
  monthlyBudgetCents: z.number().int().nullable(),
  sortOrder: z.number().int(),
  ...timestampsSchema,
})
export type Category = z.infer<typeof categorySchema>

export const createCategoryRequestSchema = z.object({
  kind: categoryKindSchema,
  name: nameSchema(40),
  parentId: idSchema.nullable().optional(),
  icon: categoryIconSchema,
  color: hexColorSchema,
  monthlyBudgetCents: nonNegativeCentsSchema.nullable().optional(),
})
export type CreateCategoryRequest = z.infer<typeof createCategoryRequestSchema>

/** O tipo (receita/despesa) não muda depois de criada. */
export const updateCategoryRequestSchema = createCategoryRequestSchema
  .omit({ kind: true })
  .extend({ sortOrder: z.number().int().min(0) })
  .partial()
export type UpdateCategoryRequest = z.infer<typeof updateCategoryRequestSchema>

// ─── Estabelecimentos ────────────────────────────────────────────────────────

export const payeeSchema = z.object({
  id: idSchema,
  name: z.string(),
  defaultCategoryId: idSchema.nullable(),
  ...timestampsSchema,
})
export type Payee = z.infer<typeof payeeSchema>

export const createPayeeRequestSchema = z.object({
  name: nameSchema(80),
  defaultCategoryId: idSchema.nullable().optional(),
})
export type CreatePayeeRequest = z.infer<typeof createPayeeRequestSchema>

export const updatePayeeRequestSchema = createPayeeRequestSchema.partial()
export type UpdatePayeeRequest = z.infer<typeof updatePayeeRequestSchema>

// ─── Modelos recorrentes (Fase 1: só o salário base do onboarding) ───────────

export const paymentMethodSchema = z.enum([
  'pix',
  'debit',
  'credit',
  'cash',
  'boleto',
  'transfer',
  'other',
])

export const recurringTemplateSchema = z.object({
  id: idSchema,
  type: categoryKindSchema,
  nature: z.enum(['fixed', 'planned']),
  description: z.string(),
  amountCents: z.number().int(),
  categoryId: idSchema.nullable(),
  accountId: idSchema.nullable(),
  frequency: z.enum(['monthly', 'yearly']),
  dayOfMonth: z.number().int(),
  startMonth: competenceMonthSchema,
  endMonth: competenceMonthSchema.nullable(),
  isActive: z.boolean(),
  ...timestampsSchema,
})
export type RecurringTemplate = z.infer<typeof recurringTemplateSchema>

/** Fase 1: cria receitas fixas mensais (salário base). O CRUD completo vem na Fase 2. */
export const createIncomeTemplateRequestSchema = z.object({
  description: nameSchema(60),
  amountCents: positiveCentsSchema,
  dayOfMonth: dayOfMonthSchema,
  startMonth: competenceMonthSchema,
  categoryId: idSchema.nullable().optional(),
  accountId: idSchema.nullable().optional(),
})
export type CreateIncomeTemplateRequest = z.infer<typeof createIncomeTemplateRequestSchema>
