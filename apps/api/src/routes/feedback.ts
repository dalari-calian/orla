import { canTransitionFeedback, type FeedbackStatus, FEEDBACK_STATUSES } from '@orla/core'
import {
  createFeedbackRequestSchema,
  feedbackKindSchema,
  feedbackStatusSchema,
  updateFeedbackRequestSchema,
  type AdminFeedback,
  type Feedback,
} from '@orla/contracts'
import type { Prisma, PrismaClient } from '@orla/db'
import { Router, type RequestHandler } from 'express'
import { z } from 'zod'
import { ensureFound, paramId, toIso } from '../lib/db.ts'
import { AppError, conflict, forbidden, validationError } from '../lib/errors.ts'
import { parse } from '../lib/validate.ts'
import { userIdOf } from '../middleware/auth.ts'
import type { AuthService } from '../services/auth.ts'

/** Envios por usuário em 24 h (evita spam enchendo a fila). */
const DAILY_LIMIT = 20

type FeedbackRow = Prisma.FeedbackGetPayload<object>
type AdminRow = Prisma.FeedbackGetPayload<{
  include: { user: { select: { username: true; displayName: true } }; events: true }
}>

function toFeedback(row: FeedbackRow): Feedback {
  return {
    id: row.id,
    kind: row.kind as Feedback['kind'],
    title: row.title,
    description: row.description,
    page: row.page,
    status: row.status as Feedback['status'],
    priority: row.priority as Feedback['priority'],
    ownerNote: row.ownerNote,
    statusChangedAt: toIso(row.statusChangedAt),
    resolvedAt: row.resolvedAt ? toIso(row.resolvedAt) : null,
    createdAt: toIso(row.createdAt),
    updatedAt: toIso(row.updatedAt),
  }
}

function toAdminFeedback(row: AdminRow): AdminFeedback {
  return {
    ...toFeedback(row),
    user: row.user,
    context: (row.context as AdminFeedback['context']) ?? null,
    agentNotes: row.agentNotes,
    branch: row.branch,
    commitSha: row.commitSha,
    events: row.events.map((event) => ({
      id: event.id,
      actor: event.actor as AdminFeedback['events'][number]['actor'],
      fromStatus: event.fromStatus as FeedbackStatus | null,
      toStatus: event.toStatus as FeedbackStatus | null,
      note: event.note,
      createdAt: toIso(event.createdAt),
    })),
  }
}

const adminInclude = {
  user: { select: { username: true, displayName: true } },
  events: { orderBy: { createdAt: 'asc' } },
} as const

const listQuerySchema = z.object({
  status: feedbackStatusSchema.optional(),
  kind: feedbackKindSchema.optional(),
})

const statusLabels: Record<FeedbackStatus, string> = {
  pending: 'pendente',
  approved: 'aprovado',
  in_progress: 'em andamento',
  review: 'em revisão',
  done: 'concluído',
  rejected: 'recusado',
}

/**
 * Relatos de bug e sugestões (docs/15). Qualquer usuário envia e acompanha os seus; só os
 * donos (ADMIN_USERNAMES) veem a fila inteira e mudam status. Agentes usam `pnpm feedback`.
 */
export function feedbackRouter(prisma: PrismaClient, auth: AuthService): Router {
  const router = Router()

  const requireAdmin: RequestHandler = async (req, _res, next) => {
    const user = await prisma.user.findUnique({
      where: { id: userIdOf(req) },
      select: { username: true },
    })
    if (!user || !auth.isAdminUsername(user.username)) {
      throw forbidden('Só o dono do app vê a fila de relatos')
    }
    next()
  }

  router.post('/feedback', async (req, res) => {
    const userId = userIdOf(req)
    const input = parse(createFeedbackRequestSchema, req.body)
    const recent = await prisma.feedback.count({
      where: { userId, createdAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) } },
    })
    if (recent >= DAILY_LIMIT) {
      throw new AppError(
        429,
        'RATE_LIMITED',
        'Você já enviou muitos relatos hoje. Tente de novo amanhã.',
      )
    }
    const row = await prisma.feedback.create({
      data: {
        userId,
        kind: input.kind,
        title: input.title,
        description: input.description,
        page: input.page ?? null,
        context: input.context ?? undefined,
        events: { create: { actor: 'user', toStatus: 'pending' } },
      },
    })
    res.status(201).json(toFeedback(row))
  })

  router.get('/feedback/mine', async (req, res) => {
    const rows = await prisma.feedback.findMany({
      where: { userId: userIdOf(req), deletedAt: null },
      orderBy: { createdAt: 'desc' },
    })
    res.json({ data: rows.map(toFeedback), nextCursor: null })
  })

  /** Quem enviou pode retirar enquanto ninguém mexeu (pendente). */
  router.delete('/feedback/:id', async (req, res) => {
    const current = await ensureFound(
      prisma.feedback.findFirst({
        where: { id: paramId(req), userId: userIdOf(req), deletedAt: null },
      }),
      'Relato não encontrado',
    )
    if (current.status !== 'pending') {
      throw conflict('Esse relato já está sendo tratado e não pode mais ser retirado')
    }
    await prisma.feedback.update({ where: { id: current.id }, data: { deletedAt: new Date() } })
    res.status(204).end()
  })

  router.get('/admin/feedback', requireAdmin, async (req, res) => {
    const query = parse(listQuerySchema, req.query)
    const [rows, grouped] = await Promise.all([
      prisma.feedback.findMany({
        where: {
          deletedAt: null,
          ...(query.status && { status: query.status }),
          ...(query.kind && { kind: query.kind }),
        },
        include: adminInclude,
        orderBy: { createdAt: 'desc' },
        take: 500,
      }),
      prisma.feedback.groupBy({
        by: ['status'],
        where: { deletedAt: null, ...(query.kind && { kind: query.kind }) },
        _count: { _all: true },
      }),
    ])
    const counts = Object.fromEntries(FEEDBACK_STATUSES.map((status) => [status, 0])) as Record<
      FeedbackStatus,
      number
    >
    for (const group of grouped) counts[group.status as FeedbackStatus] = group._count._all
    res.json({ data: rows.map(toAdminFeedback), counts })
  })

  router.patch('/admin/feedback/:id', requireAdmin, async (req, res) => {
    const input = parse(updateFeedbackRequestSchema, req.body)
    const current = await ensureFound(
      prisma.feedback.findFirst({ where: { id: paramId(req), deletedAt: null } }),
      'Relato não encontrado',
    )
    const from = current.status as FeedbackStatus
    const to = input.status
    if (to && to !== from && !canTransitionFeedback(from, to, 'owner')) {
      throw validationError(`Não dá para ir de ${statusLabels[from]} para ${statusLabels[to]}`)
    }
    const changed = Boolean(to && to !== from)
    const noteChanged = input.ownerNote !== undefined && input.ownerNote !== current.ownerNote
    const now = new Date()
    const row = await prisma.feedback.update({
      where: { id: current.id },
      data: {
        ...(changed && {
          status: to,
          statusChangedAt: now,
          resolvedAt: to === 'done' || to === 'rejected' ? now : null,
        }),
        ...(input.priority !== undefined && { priority: input.priority }),
        ...(input.ownerNote !== undefined && { ownerNote: input.ownerNote || null }),
        ...((changed || noteChanged) && {
          events: {
            create: {
              actor: 'owner',
              fromStatus: changed ? from : null,
              toStatus: changed ? (to ?? null) : null,
              note: noteChanged ? input.ownerNote || null : null,
            },
          },
        }),
      },
      include: adminInclude,
    })
    res.json(toAdminFeedback(row))
  })

  return router
}
