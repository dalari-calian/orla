import {
  createAccountRequestSchema,
  updateAccountRequestSchema,
  type Account,
  type AccountKind,
  type ListResponse,
} from '@orla/contracts'
import type { PrismaClient } from '@orla/db'
import { Router } from 'express'
import { ensureFound, paramId, toIso, withUniqueConflict } from '../lib/db.ts'
import { conflict } from '../lib/errors.ts'
import { parse } from '../lib/validate.ts'
import { userIdOf } from '../middleware/auth.ts'

type AccountRow = Awaited<ReturnType<PrismaClient['account']['create']>>

export function toAccount(row: AccountRow): Account {
  return {
    id: row.id,
    name: row.name,
    kind: row.kind as AccountKind,
    color: row.color,
    isArchived: row.isArchived,
    createdAt: toIso(row.createdAt),
    updatedAt: toIso(row.updatedAt),
  }
}

const DUPLICATE = 'Você já tem uma conta com esse nome.'

/** /accounts — bancos, corretoras e carteiras (soft delete + restore). */
export function accountsRouter(prisma: PrismaClient): Router {
  const router = Router()
  const findOwned = (userId: string, id: string, deleted = false) =>
    ensureFound(
      prisma.account.findFirst({
        where: { id, userId, deletedAt: deleted ? { not: null } : null },
      }),
      'Conta não encontrada',
    )

  router.get('/accounts', async (req, res) => {
    const rows = await prisma.account.findMany({
      where: { userId: userIdOf(req), deletedAt: null },
      orderBy: [{ isArchived: 'asc' }, { name: 'asc' }],
    })
    const body: ListResponse<Account> = { data: rows.map(toAccount), nextCursor: null }
    res.json(body)
  })

  router.get('/accounts/:id', async (req, res) => {
    res.json(toAccount(await findOwned(userIdOf(req), paramId(req))))
  })

  router.post('/accounts', async (req, res) => {
    const input = parse(createAccountRequestSchema, req.body)
    const row = await withUniqueConflict(
      prisma.account.create({ data: { ...input, userId: userIdOf(req) } }),
      DUPLICATE,
    )
    res.status(201).json(toAccount(row))
  })

  router.patch('/accounts/:id', async (req, res) => {
    const userId = userIdOf(req)
    const { id } = await findOwned(userId, paramId(req))
    const input = parse(updateAccountRequestSchema, req.body)
    const row = await withUniqueConflict(
      prisma.account.update({ where: { id }, data: input }),
      DUPLICATE,
    )
    res.json(toAccount(row))
  })

  router.delete('/accounts/:id', async (req, res) => {
    const userId = userIdOf(req)
    const { id } = await findOwned(userId, paramId(req))
    const activeCards = await prisma.creditCard.count({ where: { accountId: id, deletedAt: null } })
    if (activeCards > 0) {
      throw conflict('Essa conta tem cartões. Exclua ou mova os cartões antes.')
    }
    await prisma.account.update({ where: { id }, data: { deletedAt: new Date() } })
    res.status(204).end()
  })

  router.post('/accounts/:id/restore', async (req, res) => {
    const { id } = await findOwned(userIdOf(req), paramId(req), true)
    const row = await withUniqueConflict(
      prisma.account.update({ where: { id }, data: { deletedAt: null } }),
      DUPLICATE,
    )
    res.json(toAccount(row))
  })

  return router
}
