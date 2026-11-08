/**
 * Relatos de bug e sugestões de melhoria (docs/15, docs/11 › Relatos).
 */
import { FEEDBACK_KINDS, FEEDBACK_PRIORITIES, FEEDBACK_STATUSES } from '@orla/core'
import { z } from 'zod'
import { idSchema } from './common.ts'

export const feedbackKindSchema = z.enum(FEEDBACK_KINDS)
export const feedbackStatusSchema = z.enum(FEEDBACK_STATUSES)
export const feedbackPrioritySchema = z.enum(FEEDBACK_PRIORITIES)
export type FeedbackKindValue = z.infer<typeof feedbackKindSchema>
export type FeedbackStatusValue = z.infer<typeof feedbackStatusSchema>
export type FeedbackPriorityValue = z.infer<typeof feedbackPrioritySchema>

/** Diagnóstico enviado junto (preenchido pelo app, não pelo usuário). */
export const feedbackContextSchema = z.object({
  appVersion: z.string().max(40).optional(),
  userAgent: z.string().max(400).optional(),
  viewport: z.string().max(20).optional(),
  theme: z.string().max(10).optional(),
})
export type FeedbackContext = z.infer<typeof feedbackContextSchema>

export const createFeedbackRequestSchema = z.object({
  kind: feedbackKindSchema,
  title: z
    .string()
    .trim()
    .min(3, 'Dê um título curto (pelo menos 3 letras)')
    .max(120, 'Use no máximo 120 caracteres'),
  description: z
    .string()
    .trim()
    .min(10, 'Conte um pouco mais (pelo menos 10 letras)')
    .max(4000, 'Use no máximo 4.000 caracteres'),
  page: z.string().trim().max(200).nullable().optional(),
  context: feedbackContextSchema.optional(),
})
export type CreateFeedbackRequest = z.input<typeof createFeedbackRequestSchema>

const feedbackEventSchema = z.object({
  id: idSchema,
  actor: z.enum(['owner', 'agent', 'user']),
  fromStatus: feedbackStatusSchema.nullable(),
  toStatus: feedbackStatusSchema.nullable(),
  note: z.string().nullable(),
  createdAt: z.string(),
})
export type FeedbackEvent = z.infer<typeof feedbackEventSchema>

/** O que quem enviou vê (sem notas internas do agente). */
export const feedbackSchema = z.object({
  id: idSchema,
  kind: feedbackKindSchema,
  title: z.string(),
  description: z.string(),
  page: z.string().nullable(),
  status: feedbackStatusSchema,
  priority: feedbackPrioritySchema.nullable(),
  ownerNote: z.string().nullable(),
  statusChangedAt: z.string(),
  resolvedAt: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
})
export type Feedback = z.infer<typeof feedbackSchema>

/** Visão do dono (fila): tudo, com quem enviou, diagnóstico, notas do agente e histórico. */
export const adminFeedbackSchema = feedbackSchema.extend({
  user: z.object({ username: z.string(), displayName: z.string().nullable() }),
  context: feedbackContextSchema.nullable(),
  agentNotes: z.string().nullable(),
  branch: z.string().nullable(),
  commitSha: z.string().nullable(),
  events: z.array(feedbackEventSchema),
})
export type AdminFeedback = z.infer<typeof adminFeedbackSchema>

export const adminFeedbackListResponseSchema = z.object({
  data: z.array(adminFeedbackSchema),
  /** Quantos em cada status (para os filtros). */
  counts: z.record(feedbackStatusSchema, z.number().int()),
})
export type AdminFeedbackListResponse = z.infer<typeof adminFeedbackListResponseSchema>

/** PATCH /admin/feedback/:id — triagem do dono. */
export const updateFeedbackRequestSchema = z.object({
  status: feedbackStatusSchema.optional(),
  priority: feedbackPrioritySchema.nullable().optional(),
  ownerNote: z.string().trim().max(2000).nullable().optional(),
})
export type UpdateFeedbackRequest = z.input<typeof updateFeedbackRequestSchema>
