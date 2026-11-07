import {
  createCreditCardRequestSchema,
  updateCreditCardRequestSchema,
  type CreditCard,
  type ListResponse,
} from '@orla/contracts'
import type { PrismaClient } from '@orla/db'
import { Router } from 'express'
import { centsToNumber, ensureFound, paramId, toIso } from '../lib/db.ts'
import { validationError } from '../lib/errors.ts'
import { parse } from '../lib/validate.ts'
import { userIdOf } from '../middleware/auth.ts'

type CardRow = Awaited<ReturnType<PrismaClient['creditCard']['create']>>

function toCreditCard(row: CardRow): CreditCard {
  return {
    id: row.id,
    accountId: row.accountId,
    name: row.name,
    closingDay: row.closingDay,
    dueDay: row.dueDay,
    limitCents: centsToNumber(row.limitCents),
    createdAt: toIso(row.createdAt),
    updatedAt: toIso(row.updatedAt),
  }
}

/** /credit-cards — cartões de crédito ligados a uma conta (banco emissor). */
export function creditCardsRouter(prisma: PrismaClient): Router {
  const router = Router()
  const findOwned = (userId: string, id: string, deleted = false) =>
    ensureFound(
      prisma.creditCard.findFirst({
        where: { id, userId, deletedAt: deleted ? { not: null } : null },
      }),
      'Cartão não encontrado',
    )

  /** A conta precisa ser do mesmo usuário e não estar excluída. */
  async function assertAccount(userId: string, accountId: string): Promise<void> {
    const account = await prisma.account.findFirst({
      where: { id: accountId, userId, deletedAt: null },
    })
    if (!account)
      throw validationError('Conta do cartão não encontrada', {
        fields: [{ path: 'accountId', message: 'Conta não encontrada' }],
      })
  }

  router.get('/credit-cards', async (req, res) => {
    const rows = await prisma.creditCard.findMany({
      where: { userId: userIdOf(req), deletedAt: null },
      orderBy: { name: 'asc' },
    })
    const body: ListResponse<CreditCard> = { data: rows.map(toCreditCard), nextCursor: null }
    res.json(body)
  })

  router.get('/credit-cards/:id', async (req, res) => {
    res.json(toCreditCard(await findOwned(userIdOf(req), paramId(req))))
  })

  router.post('/credit-cards', async (req, res) => {
    const userId = userIdOf(req)
    const input = parse(createCreditCardRequestSchema, req.body)
    await assertAccount(userId, input.accountId)
    const row = await prisma.creditCard.create({
      data: {
        userId,
        accountId: input.accountId,
        name: input.name,
        closingDay: input.closingDay,
        dueDay: input.dueDay,
        limitCents: input.limitCents == null ? null : BigInt(input.limitCents),
      },
    })
    res.status(201).json(toCreditCard(row))
  })

  router.patch('/credit-cards/:id', async (req, res) => {
    const userId = userIdOf(req)
    const { id } = await findOwned(userId, paramId(req))
    const input = parse(updateCreditCardRequestSchema, req.body)
    if (input.accountId) await assertAccount(userId, input.accountId)
    const row = await prisma.creditCard.update({
      where: { id },
      data: {
        ...(input.accountId !== undefined && { accountId: input.accountId }),
        ...(input.name !== undefined && { name: input.name }),
        ...(input.closingDay !== undefined && { closingDay: input.closingDay }),
        ...(input.dueDay !== undefined && { dueDay: input.dueDay }),
        ...(input.limitCents !== undefined && {
          limitCents: input.limitCents === null ? null : BigInt(input.limitCents),
        }),
      },
    })
    res.json(toCreditCard(row))
  })

  router.delete('/credit-cards/:id', async (req, res) => {
    const { id } = await findOwned(userIdOf(req), paramId(req))
    await prisma.creditCard.update({ where: { id }, data: { deletedAt: new Date() } })
    res.status(204).end()
  })

  router.post('/credit-cards/:id/restore', async (req, res) => {
    const userId = userIdOf(req)
    const card = await findOwned(userId, paramId(req), true)
    await assertAccount(userId, card.accountId)
    const row = await prisma.creditCard.update({
      where: { id: card.id },
      data: { deletedAt: null },
    })
    res.json(toCreditCard(row))
  })

  return router
}
