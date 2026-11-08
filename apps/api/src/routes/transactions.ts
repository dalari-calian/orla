import {
  competenceMonthToDate,
  dateToCompetenceMonth,
  dateToIsoDate,
  defaultStatusFor,
  isNatureAllowed,
  isoDateToCompetenceMonth,
  isoDateToDate,
  statementCompetenceMonth,
} from '@orla/core'
import {
  createTransactionRequestSchema,
  settleTransactionRequestSchema,
  transactionListQuerySchema,
  updateTransactionRequestSchema,
  type ListResponse,
  type Transaction,
  type TransactionNature,
  type TransactionType,
} from '@orla/contracts'
import type { Prisma, PrismaClient } from '@orla/db'
import { Router } from 'express'
import { ensureFound, paramId } from '../lib/db.ts'
import { conflict, validationError } from '../lib/errors.ts'
import {
  assertRefs,
  financeSettings,
  toTransaction,
  transactionInclude,
  type CardRef,
  type Db,
} from '../lib/finance.ts'
import { parse } from '../lib/validate.ts'
import { userIdOf } from '../middleware/auth.ts'

function fieldError(path: string, message: string): never {
  throw validationError(message, { fields: [{ path, message }] })
}

/**
 * Competência de um lançamento (RF-02/03): informada pelo usuário, ou a da fatura
 * no crédito, ou o mês da data.
 */
function resolveCompetence(input: {
  competenceMonth?: string | undefined
  date: string
  card: CardRef | null
  mode: 'due_month' | 'closing_month'
}): string {
  if (input.competenceMonth) return input.competenceMonth
  if (input.card) return statementCompetenceMonth(input.date, input.card, input.mode)
  return isoDateToCompetenceMonth(input.date)
}

/**
 * Planejamento-pai de um gasto vinculado (RF-22): despesa `planned` do usuário.
 * O gasto vinculado fica na mesma competência do planejamento (é ali que ele é comparado).
 */
async function plannedParent(db: Db, userId: string, parentId: string, selfId?: string) {
  if (parentId === selfId)
    fieldError('parentPlannedId', 'Um lançamento não pode ser filho dele mesmo')
  const parent = await db.transaction.findFirst({
    where: { id: parentId, userId, deletedAt: null, nature: 'planned', type: 'expense' },
    select: { id: true, competenceMonth: true },
  })
  if (!parent) fieldError('parentPlannedId', 'Planejamento não encontrado')
  return parent
}

/** /transactions — lançamentos (CRUD, filtros, pagar/receber). */
export function transactionsRouter(prisma: PrismaClient): Router {
  const router = Router()

  const findOwned = (userId: string, id: string, deleted = false) =>
    ensureFound(
      prisma.transaction.findFirst({
        where: { id, userId, deletedAt: deleted ? { not: null } : null },
        include: transactionInclude,
      }),
      'Lançamento não encontrado',
    )

  router.get('/transactions', async (req, res) => {
    const userId = userIdOf(req)
    const query = parse(transactionListQuerySchema, req.query)
    const where: Prisma.TransactionWhereInput = {
      userId,
      deletedAt: null,
      ...(query.month && { competenceMonth: competenceMonthToDate(query.month) }),
      ...(query.type && { type: query.type }),
      ...(query.nature && { nature: query.nature }),
      ...(query.status && { status: query.status }),
      ...(query.categoryId && { categoryId: query.categoryId }),
      ...(query.cardId && { creditCardId: query.cardId }),
      ...(query.accountId && { accountId: query.accountId }),
      ...(query.payeeId && { payeeId: query.payeeId }),
      ...(query.q && { description: { contains: query.q, mode: 'insensitive' } }),
    }
    const rows = await prisma.transaction.findMany({
      where,
      include: transactionInclude,
      orderBy: [{ date: 'desc' }, { id: 'desc' }],
      take: query.limit + 1,
      ...(query.cursor && { cursor: { id: query.cursor }, skip: 1 }),
    })
    const page = rows.slice(0, query.limit)
    const body: ListResponse<Transaction> = {
      data: page.map(toTransaction),
      nextCursor: rows.length > query.limit ? (page.at(-1)?.id ?? null) : null,
    }
    res.json(body)
  })

  router.get('/transactions/:id', async (req, res) => {
    res.json(toTransaction(await findOwned(userIdOf(req), paramId(req))))
  })

  router.post('/transactions', async (req, res) => {
    const userId = userIdOf(req)
    const input = parse(createTransactionRequestSchema, req.body)
    const isCredit = input.paymentMethod === 'credit'
    const { card } = await assertRefs(prisma, userId, {
      categoryId: input.categoryId,
      categoryKind: input.type,
      accountId: input.accountId,
      payeeId: input.payeeId,
      creditCardId: isCredit ? input.creditCardId : null,
    })

    let competenceMonth: string
    if (input.parentPlannedId) {
      if (input.type !== 'expense' || input.nature === 'planned') {
        fieldError('parentPlannedId', 'Só gastos podem ser vinculados a um planejamento')
      }
      const parent = await plannedParent(prisma, userId, input.parentPlannedId)
      competenceMonth = dateToCompetenceMonth(parent.competenceMonth)
    } else {
      const { cardCompetence } = await financeSettings(prisma, userId)
      competenceMonth = resolveCompetence({
        competenceMonth: input.competenceMonth,
        date: input.date,
        card,
        mode: cardCompetence,
      })
    }

    const row = await prisma.transaction.create({
      data: {
        userId,
        type: input.type,
        nature: input.nature,
        status: input.status ?? defaultStatusFor(input.nature, input.paymentMethod),
        description: input.description,
        amountCents: BigInt(input.amountCents),
        competenceMonth: competenceMonthToDate(competenceMonth),
        date: isoDateToDate(input.date),
        categoryId: input.categoryId ?? null,
        accountId: input.accountId ?? null,
        payeeId: input.payeeId ?? null,
        paymentMethod: input.paymentMethod ?? null,
        creditCardId: isCredit ? (input.creditCardId ?? null) : null,
        parentPlannedId: input.parentPlannedId ?? null,
        tags: input.tags ?? [],
        notes: input.notes ?? null,
        source: 'manual',
      },
      include: transactionInclude,
    })
    res.status(201).json(toTransaction(row))
  })

  router.patch('/transactions/:id', async (req, res) => {
    const userId = userIdOf(req)
    const current = await findOwned(userId, paramId(req))
    const input = parse(updateTransactionRequestSchema, req.body)
    const generated = current.recurringTemplateId !== null || current.installmentPlanId !== null

    const type = (input.type ?? current.type) as TransactionType
    const nature = (input.nature ?? current.nature) as TransactionNature
    if (generated && (type !== current.type || nature !== current.nature)) {
      fieldError('nature', 'Lançamentos gerados por modelo ou parcelamento não mudam de tipo')
    }
    if (!isNatureAllowed(type, nature)) {
      fieldError(
        'nature',
        type === 'income' ? 'Receita é fixa ou extra' : 'Natureza inválida para despesa',
      )
    }
    if (current.nature === 'planned' && nature !== 'planned') {
      const children = await prisma.transaction.count({
        where: { parentPlannedId: current.id, deletedAt: null },
      })
      if (children > 0) throw conflict('Este planejamento tem gastos vinculados')
    }

    const paymentMethod =
      input.paymentMethod !== undefined ? input.paymentMethod : current.paymentMethod
    const isCredit = paymentMethod === 'credit'
    const creditCardId = isCredit
      ? input.creditCardId !== undefined
        ? input.creditCardId
        : current.creditCardId
      : null
    if (isCredit && !creditCardId) fieldError('creditCardId', 'Escolha o cartão')

    const categoryId = input.categoryId !== undefined ? input.categoryId : current.categoryId
    const { card } = await assertRefs(prisma, userId, {
      categoryId: input.categoryId !== undefined || input.type ? categoryId : undefined,
      categoryKind: type,
      accountId: input.accountId,
      payeeId: input.payeeId,
      creditCardId:
        input.creditCardId !== undefined || input.paymentMethod ? creditCardId : undefined,
    })

    const parentPlannedId =
      input.parentPlannedId !== undefined ? input.parentPlannedId : current.parentPlannedId
    const date = input.date ?? dateToIsoDate(current.date)
    let competenceMonth: string = dateToCompetenceMonth(current.competenceMonth)
    if (parentPlannedId) {
      if (type !== 'expense' || nature === 'planned') {
        fieldError('parentPlannedId', 'Só gastos podem ser vinculados a um planejamento')
      }
      const parent = await plannedParent(prisma, userId, parentPlannedId, current.id)
      competenceMonth = dateToCompetenceMonth(parent.competenceMonth)
    } else if (input.competenceMonth) {
      competenceMonth = input.competenceMonth
    } else if (!generated && (input.date || input.paymentMethod || input.creditCardId)) {
      // Lançamento manual: data ou cartão mudou → recalcula a competência (RF-02/03).
      const { cardCompetence } = await financeSettings(prisma, userId)
      const cardRef =
        card ??
        (creditCardId
          ? await prisma.creditCard.findFirst({
              where: { id: creditCardId, userId },
              select: { id: true, closingDay: true, dueDay: true },
            })
          : null)
      competenceMonth = resolveCompetence({
        date,
        card: isCredit ? cardRef : null,
        mode: cardCompetence,
      })
    }

    // RF-12/47: editar um lançamento gerado (fora o status) marca override.
    const { status: _status, ...contentChanges } = input
    const isOverride = current.isOverride || (generated && Object.keys(contentChanges).length > 0)

    const row = await prisma.transaction.update({
      where: { id: current.id },
      data: {
        type,
        nature,
        ...(input.status && { status: input.status }),
        ...(input.description !== undefined && { description: input.description }),
        ...(input.amountCents !== undefined && { amountCents: BigInt(input.amountCents) }),
        date: isoDateToDate(date),
        competenceMonth: competenceMonthToDate(competenceMonth),
        categoryId,
        ...(input.accountId !== undefined && { accountId: input.accountId }),
        ...(input.payeeId !== undefined && { payeeId: input.payeeId }),
        paymentMethod,
        creditCardId,
        parentPlannedId,
        ...(input.tags !== undefined && { tags: input.tags }),
        ...(input.notes !== undefined && { notes: input.notes }),
        isOverride,
      },
      include: transactionInclude,
    })
    res.json(toTransaction(row))
  })

  router.post('/transactions/:id/settle', async (req, res) => {
    const userId = userIdOf(req)
    const current = await findOwned(userId, paramId(req))
    const input = parse(settleTransactionRequestSchema, req.body ?? {})
    const generated = current.recurringTemplateId !== null || current.installmentPlanId !== null
    const amountChanged =
      input.amountCents !== undefined && BigInt(input.amountCents) !== current.amountCents
    const row = await prisma.transaction.update({
      where: { id: current.id },
      data: {
        status: 'settled',
        ...(input.amountCents !== undefined && { amountCents: BigInt(input.amountCents) }),
        ...(input.date && { date: isoDateToDate(input.date) }),
        ...(generated && amountChanged && { isOverride: true }),
      },
      include: transactionInclude,
    })
    res.json(toTransaction(row))
  })

  router.post('/transactions/:id/unsettle', async (req, res) => {
    const current = await findOwned(userIdOf(req), paramId(req))
    const row = await prisma.transaction.update({
      where: { id: current.id },
      data: { status: 'forecast' },
      include: transactionInclude,
    })
    res.json(toTransaction(row))
  })

  router.delete('/transactions/:id', async (req, res) => {
    const current = await findOwned(userIdOf(req), paramId(req))
    if (current.installmentPlanId) {
      throw conflict('Parcelas são alteradas pelo parcelamento (editar, quitar ou cancelar)')
    }
    await prisma.$transaction([
      // Gastos vinculados a um planejamento excluído continuam existindo, sem vínculo.
      prisma.transaction.updateMany({
        where: { parentPlannedId: current.id },
        data: { parentPlannedId: null },
      }),
      prisma.transaction.update({ where: { id: current.id }, data: { deletedAt: new Date() } }),
    ])
    res.status(204).end()
  })

  router.post('/transactions/:id/restore', async (req, res) => {
    const userId = userIdOf(req)
    const current = await findOwned(userId, paramId(req), true)
    if (current.installmentPlanId) {
      throw conflict('Parcelas voltam junto com o parcelamento')
    }
    const row = await prisma.transaction.update({
      where: { id: current.id },
      data: { deletedAt: null },
      include: transactionInclude,
    })
    res.json(toTransaction(row))
  })

  return router
}
