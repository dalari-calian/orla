import {
  createPayeeRequestSchema,
  updatePayeeRequestSchema,
  type ListResponse,
  type Payee,
} from '@orla/contracts'
import type { PrismaClient } from '@orla/db'
import { Router } from 'express'
import { ensureFound, paramId, toIso, withUniqueConflict } from '../lib/db.ts'
import { validationError } from '../lib/errors.ts'
import { parse } from '../lib/validate.ts'
import { userIdOf } from '../middleware/auth.ts'

type PayeeRow = Awaited<ReturnType<PrismaClient['payee']['create']>>

function toPayee(row: PayeeRow): Payee {
  return {
    id: row.id,
    name: row.name,
    defaultCategoryId: row.defaultCategoryId,
    createdAt: toIso(row.createdAt),
    updatedAt: toIso(row.updatedAt),
  }
}

const DUPLICATE = 'Você já tem um estabelecimento com esse nome.'

/** /payees — estabelecimentos / quem pagou / quem recebeu. */
export function payeesRouter(prisma: PrismaClient): Router {
  const router = Router()
  const findOwned = (userId: string, id: string, deleted = false) =>
    ensureFound(
      prisma.payee.findFirst({ where: { id, userId, deletedAt: deleted ? { not: null } : null } }),
      'Estabelecimento não encontrado',
    )

  async function assertCategory(userId: string, categoryId: string): Promise<void> {
    const category = await prisma.category.findFirst({
      where: { id: categoryId, userId, deletedAt: null },
    })
    if (!category) {
      throw validationError('Categoria não encontrada', {
        fields: [{ path: 'defaultCategoryId', message: 'Categoria não encontrada' }],
      })
    }
  }

  router.get('/payees', async (req, res) => {
    const q = typeof req.query.q === 'string' ? req.query.q.trim().slice(0, 80) : ''
    const rows = await prisma.payee.findMany({
      where: {
        userId: userIdOf(req),
        deletedAt: null,
        ...(q && { name: { contains: q, mode: 'insensitive' as const } }),
      },
      orderBy: { name: 'asc' },
    })
    const body: ListResponse<Payee> = { data: rows.map(toPayee), nextCursor: null }
    res.json(body)
  })

  router.get('/payees/:id', async (req, res) => {
    res.json(toPayee(await findOwned(userIdOf(req), paramId(req))))
  })

  router.post('/payees', async (req, res) => {
    const userId = userIdOf(req)
    const input = parse(createPayeeRequestSchema, req.body)
    if (input.defaultCategoryId) await assertCategory(userId, input.defaultCategoryId)
    const row = await withUniqueConflict(
      prisma.payee.create({
        data: { userId, name: input.name, defaultCategoryId: input.defaultCategoryId ?? null },
      }),
      DUPLICATE,
    )
    res.status(201).json(toPayee(row))
  })

  router.patch('/payees/:id', async (req, res) => {
    const userId = userIdOf(req)
    const { id } = await findOwned(userId, paramId(req))
    const input = parse(updatePayeeRequestSchema, req.body)
    if (input.defaultCategoryId) await assertCategory(userId, input.defaultCategoryId)
    const row = await withUniqueConflict(
      prisma.payee.update({ where: { id }, data: input }),
      DUPLICATE,
    )
    res.json(toPayee(row))
  })

  router.delete('/payees/:id', async (req, res) => {
    const { id } = await findOwned(userIdOf(req), paramId(req))
    await prisma.payee.update({ where: { id }, data: { deletedAt: new Date() } })
    res.status(204).end()
  })

  router.post('/payees/:id/restore', async (req, res) => {
    const { id } = await findOwned(userIdOf(req), paramId(req), true)
    const row = await withUniqueConflict(
      prisma.payee.update({ where: { id }, data: { deletedAt: null } }),
      DUPLICATE,
    )
    res.json(toPayee(row))
  })

  return router
}
