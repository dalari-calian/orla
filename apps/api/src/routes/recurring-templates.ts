import {
  competenceMonthToDate,
  dateToCompetenceMonth,
  isAffectedByTemplateChange,
  isRemovedWithTemplate,
  isoDateToDate,
  templateDateIn,
  templateOccursIn,
} from '@orla/core'
import {
  createRecurringTemplateRequestSchema,
  deleteRecurringTemplateQuerySchema,
  updateRecurringTemplateRequestSchema,
  type ListResponse,
  type PaymentMethod,
  type RecurringTemplate,
} from '@orla/contracts'
import type { PrismaClient } from '@orla/db'
import { Router } from 'express'
import type { Clock } from '../lib/clock.ts'
import { centsToNumber, ensureFound, paramId, toIso } from '../lib/db.ts'
import { validationError } from '../lib/errors.ts'
import { assertRefs } from '../lib/finance.ts'
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
    payeeId: row.payeeId,
    paymentMethod: row.paymentMethod as PaymentMethod | null,
    creditCardId: row.creditCardId,
    frequency: row.frequency === 'yearly' ? 'yearly' : 'monthly',
    monthOfYear: row.monthOfYear,
    dayOfMonth: row.dayOfMonth,
    startMonth: dateToCompetenceMonth(row.startMonth),
    endMonth: row.endMonth ? dateToCompetenceMonth(row.endMonth) : null,
    isActive: row.isActive,
    createdAt: toIso(row.createdAt),
    updatedAt: toIso(row.updatedAt),
  }
}

function fieldError(path: string, message: string): never {
  throw validationError(message, { fields: [{ path, message }] })
}

/**
 * /recurring-templates — salário base, contas fixas e planejamentos anuais (RF-10..14, RF-23).
 * Os lançamentos são criados quando o mês é aberto (GET /months/:month).
 */
export function recurringTemplatesRouter(prisma: PrismaClient, clock: Clock): Router {
  const router = Router()
  const findOwned = (userId: string, id: string, deleted = false) =>
    ensureFound(
      prisma.recurringTemplate.findFirst({
        where: { id, userId, deletedAt: deleted ? { not: null } : null },
      }),
      'Modelo não encontrado',
    )

  router.get('/recurring-templates', async (req, res) => {
    const rows = await prisma.recurringTemplate.findMany({
      where: { userId: userIdOf(req), deletedAt: null },
      orderBy: [{ type: 'desc' }, { createdAt: 'asc' }],
    })
    const body: ListResponse<RecurringTemplate> = { data: rows.map(toTemplate), nextCursor: null }
    res.json(body)
  })

  router.get('/recurring-templates/:id', async (req, res) => {
    res.json(toTemplate(await findOwned(userIdOf(req), paramId(req))))
  })

  router.post('/recurring-templates', async (req, res) => {
    const userId = userIdOf(req)
    const input = parse(createRecurringTemplateRequestSchema, req.body)
    const isCredit = input.paymentMethod === 'credit'
    await assertRefs(prisma, userId, {
      categoryId: input.categoryId,
      categoryKind: input.type,
      accountId: input.accountId,
      payeeId: input.payeeId,
      creditCardId: isCredit ? input.creditCardId : null,
    })
    const row = await prisma.recurringTemplate.create({
      data: {
        userId,
        type: input.type,
        nature: input.nature,
        frequency: input.frequency,
        monthOfYear: input.frequency === 'yearly' ? (input.monthOfYear ?? null) : null,
        description: input.description,
        amountCents: BigInt(input.amountCents),
        dayOfMonth: input.dayOfMonth,
        startMonth: competenceMonthToDate(input.startMonth),
        endMonth: input.endMonth ? competenceMonthToDate(input.endMonth) : null,
        isActive: input.isActive ?? true,
        categoryId: input.categoryId ?? null,
        accountId: input.accountId ?? null,
        payeeId: input.payeeId ?? null,
        paymentMethod: input.paymentMethod ?? null,
        creditCardId: isCredit ? (input.creditCardId ?? null) : null,
      },
    })
    res.status(201).json(toTemplate(row))
  })

  router.patch('/recurring-templates/:id', async (req, res) => {
    const userId = userIdOf(req)
    const current = toTemplate(await findOwned(userId, paramId(req)))
    const { applyFromMonth = clock.currentMonth(), ...input } = parse(
      updateRecurringTemplateRequestSchema,
      req.body,
    )

    // Valida a combinação final (o schema só enxerga os campos enviados).
    const next = { ...current, ...input }
    if (next.type === 'income' && next.nature === 'planned') {
      fieldError('nature', 'Planejamento é só para despesas')
    }
    if (next.frequency === 'yearly' && next.monthOfYear === null) {
      fieldError('monthOfYear', 'Escolha o mês do ano')
    }
    if (next.frequency === 'monthly') next.monthOfYear = null
    if (next.paymentMethod !== 'credit') next.creditCardId = null
    else if (!next.creditCardId) fieldError('creditCardId', 'Escolha o cartão')
    if (next.endMonth !== null && next.endMonth < next.startMonth) {
      fieldError('endMonth', 'O fim vem antes do início')
    }
    await assertRefs(prisma, userId, {
      categoryId: input.categoryId,
      categoryKind: next.type,
      accountId: input.accountId,
      payeeId: input.payeeId,
      creditCardId: input.creditCardId !== undefined ? next.creditCardId : undefined,
    })

    const generated = await prisma.transaction.findMany({
      where: {
        userId,
        recurringTemplateId: current.id,
        deletedAt: null,
        competenceMonth: { gte: competenceMonthToDate(applyFromMonth) },
      },
    })
    const now = new Date()

    const row = await prisma.$transaction(async (tx) => {
      const updated = await tx.recurringTemplate.update({
        where: { id: current.id },
        data: {
          nature: next.nature,
          description: next.description,
          amountCents: BigInt(next.amountCents),
          categoryId: next.categoryId,
          accountId: next.accountId,
          payeeId: next.payeeId,
          paymentMethod: next.paymentMethod,
          creditCardId: next.creditCardId,
          frequency: next.frequency,
          monthOfYear: next.monthOfYear,
          dayOfMonth: next.dayOfMonth,
          startMonth: competenceMonthToDate(next.startMonth),
          endMonth: next.endMonth ? competenceMonthToDate(next.endMonth) : null,
          isActive: next.isActive,
        },
      })

      // RF-13: só os previstos, não editados à mão, a partir do mês escolhido.
      for (const item of generated) {
        const month = dateToCompetenceMonth(item.competenceMonth)
        const view = {
          competenceMonth: month,
          status: item.status as 'forecast' | 'settled',
          isOverride: item.isOverride,
        }
        if (!isAffectedByTemplateChange(view, applyFromMonth)) continue
        if (!templateOccursIn(next, month)) {
          // O modelo deixou de ocorrer neste mês (fim antecipado, pausado, outro mês do ano).
          await tx.transaction.update({ where: { id: item.id }, data: { deletedAt: now } })
          continue
        }
        await tx.transaction.update({
          where: { id: item.id },
          data: {
            nature: next.nature,
            description: next.description,
            amountCents: BigInt(next.amountCents),
            date: isoDateToDate(templateDateIn(next, month)),
            categoryId: next.categoryId,
            accountId: next.accountId,
            payeeId: next.payeeId,
            paymentMethod: next.paymentMethod,
            creditCardId: next.creditCardId,
          },
        })
      }
      return updated
    })
    res.json(toTemplate(row))
  })

  router.delete('/recurring-templates/:id', async (req, res) => {
    const userId = userIdOf(req)
    const template = await findOwned(userId, paramId(req))
    const { removeFromMonth } = parse(deleteRecurringTemplateQuerySchema, req.query)
    const now = new Date()
    await prisma.$transaction(async (tx) => {
      await tx.recurringTemplate.update({ where: { id: template.id }, data: { deletedAt: now } })
      if (!removeFromMonth) return
      // RF-14: remove os previstos a partir do mês escolhido; realizados nunca.
      const generated = await tx.transaction.findMany({
        where: { userId, recurringTemplateId: template.id, deletedAt: null },
        select: { id: true, competenceMonth: true, status: true },
      })
      const ids = generated
        .filter((item) =>
          isRemovedWithTemplate(
            {
              competenceMonth: dateToCompetenceMonth(item.competenceMonth),
              status: item.status as 'forecast' | 'settled',
            },
            removeFromMonth,
          ),
        )
        .map((item) => item.id)
      if (ids.length > 0) {
        await tx.transaction.updateMany({ where: { id: { in: ids } }, data: { deletedAt: now } })
      }
    })
    res.status(204).end()
  })

  router.post('/recurring-templates/:id/restore', async (req, res) => {
    const template = await findOwned(userIdOf(req), paramId(req), true)
    const row = await prisma.$transaction(async (tx) => {
      // Desfazer a exclusão traz de volta os lançamentos removidos junto (mesmo instante).
      if (template.deletedAt) {
        await tx.transaction.updateMany({
          where: { recurringTemplateId: template.id, deletedAt: template.deletedAt },
          data: { deletedAt: null },
        })
      }
      return tx.recurringTemplate.update({ where: { id: template.id }, data: { deletedAt: null } })
    })
    res.json(toTemplate(row))
  })

  return router
}
