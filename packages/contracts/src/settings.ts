import { z } from 'zod'
import { nonNegativeCentsSchema } from './common.ts'

/**
 * Meta padrão de investimento (RF-50): valor fixo OU % das receitas do mês.
 * `percent` em pontos percentuais com até 4 casas, como string decimal (docs/11).
 */
export const savingsGoalSchema = z.discriminatedUnion('mode', [
  z.object({ mode: z.literal('none') }),
  z.object({ mode: z.literal('fixed'), amountCents: nonNegativeCentsSchema }),
  z.object({
    mode: z.literal('percent'),
    percent: z
      .string()
      .regex(/^\d{1,3}(\.\d{1,4})?$/, 'Percentual inválido')
      .refine((value) => Number(value) >= 0 && Number(value) <= 100, 'Entre 0% e 100%'),
  }),
])
export type SavingsGoal = z.infer<typeof savingsGoalSchema>

export const themeSchema = z.enum(['light', 'dark', 'system'])
export const cardCompetenceSchema = z.enum(['due_month', 'closing_month'])

/** GET /me/settings */
export const settingsResponseSchema = z.object({
  savingsGoal: savingsGoalSchema,
  cardCompetence: cardCompetenceSchema,
  theme: themeSchema,
  hideValues: z.boolean(),
  onboardingCompleted: z.boolean(),
})
export type SettingsResponse = z.infer<typeof settingsResponseSchema>

/** PATCH /me/settings — todos os campos opcionais. */
export const updateSettingsRequestSchema = z
  .object({
    savingsGoal: savingsGoalSchema,
    cardCompetence: cardCompetenceSchema,
    theme: themeSchema,
    hideValues: z.boolean(),
    onboardingCompleted: z.boolean(),
  })
  .partial()
export type UpdateSettingsRequest = z.infer<typeof updateSettingsRequestSchema>
