import {
  categoryKindSchema,
  createCategoryRequestSchema,
  updateCategoryRequestSchema,
  type Category,
  type ListResponse,
} from '@orla/contracts'
import type { PrismaClient } from '@orla/db'
import { Router } from 'express'
import { centsToNumber, ensureFound, paramId, toIso, withUniqueConflict } from '../lib/db.ts'
import { conflict, validationError } from '../lib/errors.ts'
import { parse } from '../lib/validate.ts'
import { userIdOf } from '../middleware/auth.ts'

type CategoryRow = Awaited<ReturnType<PrismaClient['category']['create']>>

function toCategory(row: CategoryRow): Category {
  return {
    id: row.id,
    kind: row.kind === 'income' ? 'income' : 'expense',
    name: row.name,
    parentId: row.parentId,
    icon: row.icon as Category['icon'],
    color: row.color,
    monthlyBudgetCents: centsToNumber(row.monthlyBudgetCents),
    sortOrder: row.sortOrder,
    createdAt: toIso(row.createdAt),
    updatedAt: toIso(row.updatedAt),
  }
}

const DUPLICATE = 'Já existe uma categoria com esse nome.'

/** /categories — receitas/despesas com 1 nível de subcategoria. */
export function categoriesRouter(prisma: PrismaClient): Router {
  const router = Router()
  const findOwned = (userId: string, id: string, deleted = false) =>
    ensureFound(
      prisma.category.findFirst({
        where: { id, userId, deletedAt: deleted ? { not: null } : null },
      }),
      'Categoria não encontrada',
    )

  /** Pai precisa ser do usuário, do mesmo tipo, de nível 1 e diferente da própria categoria. */
  async function assertParent(userId: string, parentId: string, kind: string, selfId?: string) {
    const fail = (message: string) =>
      validationError(message, { fields: [{ path: 'parentId', message }] })
    if (parentId === selfId) throw fail('Uma categoria não pode ser pai dela mesma.')
    const parent = await prisma.category.findFirst({
      where: { id: parentId, userId, deletedAt: null },
    })
    if (!parent) throw fail('Categoria pai não encontrada.')
    if (parent.kind !== kind) throw fail('A categoria pai precisa ser do mesmo tipo.')
    if (parent.parentId) throw fail('Só é permitido um nível de subcategoria.')
    if (selfId) {
      const children = await prisma.category.count({ where: { parentId: selfId, deletedAt: null } })
      if (children > 0) throw fail('Uma categoria com subcategorias não pode virar subcategoria.')
    }
  }

  router.get('/categories', async (req, res) => {
    const kind =
      req.query.kind === undefined ? undefined : parse(categoryKindSchema, req.query.kind)
    const rows = await prisma.category.findMany({
      where: { userId: userIdOf(req), deletedAt: null, ...(kind && { kind }) },
      orderBy: [{ kind: 'asc' }, { sortOrder: 'asc' }, { name: 'asc' }],
    })
    const body: ListResponse<Category> = { data: rows.map(toCategory), nextCursor: null }
    res.json(body)
  })

  router.get('/categories/:id', async (req, res) => {
    res.json(toCategory(await findOwned(userIdOf(req), paramId(req))))
  })

  router.post('/categories', async (req, res) => {
    const userId = userIdOf(req)
    const input = parse(createCategoryRequestSchema, req.body)
    if (input.parentId) await assertParent(userId, input.parentId, input.kind)
    const last = await prisma.category.aggregate({
      where: { userId, kind: input.kind, deletedAt: null },
      _max: { sortOrder: true },
    })
    const row = await withUniqueConflict(
      prisma.category.create({
        data: {
          userId,
          kind: input.kind,
          name: input.name,
          parentId: input.parentId ?? null,
          icon: input.icon,
          color: input.color,
          monthlyBudgetCents:
            input.monthlyBudgetCents == null ? null : BigInt(input.monthlyBudgetCents),
          sortOrder: (last._max.sortOrder ?? -1) + 1,
        },
      }),
      DUPLICATE,
    )
    res.status(201).json(toCategory(row))
  })

  router.patch('/categories/:id', async (req, res) => {
    const userId = userIdOf(req)
    const current = await findOwned(userId, paramId(req))
    const input = parse(updateCategoryRequestSchema, req.body)
    if (input.parentId) await assertParent(userId, input.parentId, current.kind, current.id)
    const row = await withUniqueConflict(
      prisma.category.update({
        where: { id: current.id },
        data: {
          ...(input.name !== undefined && { name: input.name }),
          ...(input.parentId !== undefined && { parentId: input.parentId }),
          ...(input.icon !== undefined && { icon: input.icon }),
          ...(input.color !== undefined && { color: input.color }),
          ...(input.sortOrder !== undefined && { sortOrder: input.sortOrder }),
          ...(input.monthlyBudgetCents !== undefined && {
            monthlyBudgetCents:
              input.monthlyBudgetCents === null ? null : BigInt(input.monthlyBudgetCents),
          }),
        },
      }),
      DUPLICATE,
    )
    res.json(toCategory(row))
  })

  router.delete('/categories/:id', async (req, res) => {
    const { id } = await findOwned(userIdOf(req), paramId(req))
    const children = await prisma.category.count({ where: { parentId: id, deletedAt: null } })
    if (children > 0) throw conflict('Exclua as subcategorias antes.')
    await prisma.category.update({ where: { id }, data: { deletedAt: new Date() } })
    res.status(204).end()
  })

  router.post('/categories/:id/restore', async (req, res) => {
    const userId = userIdOf(req)
    const category = await findOwned(userId, paramId(req), true)
    if (category.parentId) {
      const parent = await prisma.category.findFirst({
        where: { id: category.parentId, userId, deletedAt: null },
      })
      if (!parent) throw conflict('Restaure a categoria pai antes.')
    }
    const row = await withUniqueConflict(
      prisma.category.update({ where: { id: category.id }, data: { deletedAt: null } }),
      DUPLICATE,
    )
    res.json(toCategory(row))
  })

  return router
}
