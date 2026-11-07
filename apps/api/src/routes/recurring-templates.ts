import { competenceMonthToDate, dateToCompetenceMonth } from '@orla/core'
import {
  createIncomeTemplateRequestSchema,
  type ListResponse,
  type RecurringTemplate,
} from '@orla/contracts'
import type { PrismaClient } from '@orla/db'
import { Router } from 'express'
import { centsToNumber, toIso } from '../lib/db.ts'
import { validationError } from '../lib/errors.ts'
import { parse } from '../lib/validate.ts'
import { userIdOf } from '../middleware/auth.ts'

type TemplateRow = Awaited<ReturnType<PrismaClient['recurringTemplate']['create']>>

function toTemplate(row: TemplateRow): RecurringTemplate {
  return {
    id: row.id,
    type: row.type === 'income' ? 'income' : 'expense',
    nature: row.nature === 'planned' ? 'planned' : 'fixed',
    description: row.description,
    amountCents: centsToNumber(row.amountCents),
    categoryId: row.categoryId,
    accountId: row.accountId,
    frequency: row.frequency === 'yearly' ? 'yearly' : 'monthly',
    dayOfMonth: row.dayOfMonth,
    startMonth: dateToCompetenceMonth(row.startMonth),
    endMonth: row.endMonth ? dateToCompetenceMonth(row.endMonth) : null,
    isActive: row.isActive,
    createdAt: toIso(row.createdAt),
    updatedAt: toIso(row.updatedAt),
  }
}

/**
 * /recurring-templates — Fase 1: listar e criar a receita fixa mensal (salário base)
 * do onboarding. Editar, excluir e materializar nos meses chega na Fase 2.
 */
export function recurringTemplatesRouter(prisma: PrismaClient): Router {
  const router = Router()

  router.get('/recurring-templates', async (req, res) => {
    const rows = await prisma.recurringTemplate.findMany({
      where: { userId: userIdOf(req), deletedAt: null },
      orderBy: { createdAt: 'asc' },
    })
    const body: ListResponse<RecurringTemplate> = { data: rows.map(toTemplate), nextCursor: null }
    res.json(body)
  })

  router.post('/recurring-templates', async (req, res) => {
    const userId = userIdOf(req)
    const input = parse(createIncomeTemplateRequestSchema, req.body)

    if (input.categoryId) {
      const category = await prisma.category.findFirst({
        where: { id: input.categoryId, userId, kind: 'income', deletedAt: null },
      })
      if (!category) {
        throw validationError('Categoria de receita não encontrada', {
          fields: [{ path: 'categoryId', message: 'Categoria de receita não encontrada' }],
        })
      }
    }
    if (input.accountId) {
      const account = await prisma.account.findFirst({
        where: { id: input.accountId, userId, deletedAt: null },
      })
      if (!account) {
        throw validationError('Conta não encontrada', {
          fields: [{ path: 'accountId', message: 'Conta não encontrada' }],
        })
      }
    }

    const row = await prisma.recurringTemplate.create({
      data: {
        userId,
        type: 'income',
        nature: 'fixed',
        frequency: 'monthly',
        description: input.description,
        amountCents: BigInt(input.amountCents),
        dayOfMonth: input.dayOfMonth,
        startMonth: competenceMonthToDate(input.startMonth),
        categoryId: input.categoryId ?? null,
        accountId: input.accountId ?? null,
      },
    })
    res.status(201).json(toTemplate(row))
  })

  return router
}
