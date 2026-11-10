import { randomUUID } from 'node:crypto'
import {
  buildInstallmentSchedule,
  compareMonths,
  competenceMonthToDate,
  dateInMonth,
  dateToCompetenceMonth,
  duplicateKey,
  firstMonthFromCurrentInstallment,
  isoDateToCompetenceMonth,
  isoDateToDate,
  PALETTE,
  refKey,
  statementCompetenceMonth,
} from '@orla/core'
import {
  commitImportRequestSchema,
  createImportRequestSchema,
  importDraftSchema,
  importRowsRequestSchema,
  type ImportDraftInput,
  type ImportJob,
  type ImportRowCheck,
  type ListResponse,
} from '@orla/contracts'
import type { Prisma, PrismaClient } from '@orla/db'
import { Router } from 'express'
import type { Clock } from '../lib/clock.ts'
import { centsToNumber, ensureFound, paramId, toIso } from '../lib/db.ts'
import { conflict } from '../lib/errors.ts'
import {
  financeSettings,
  installmentDate,
  resolveCompetence,
  type CardRef,
  type Db,
} from '../lib/finance.ts'
import { parse } from '../lib/validate.ts'
import { userIdOf } from '../middleware/auth.ts'
import {
  checkPortfolioDraft,
  isPortfolioDraft,
  portfolioContext,
  portfolioWriter,
  undoPortfolio,
  type PortfolioContext,
} from '../lib/portfolio-import.ts'

// ─── Cadastros do usuário, por nome ──────────────────────────────────────────

interface Named {
  id: string
  name: string
}
interface Lookups {
  categories: (Named & { kind: string })[]
  accounts: Named[]
  cards: (Named & CardRef)[]
  payees: Named[]
}

async function loadLookups(db: Db, userId: string): Promise<Lookups> {
  const where = { userId, deletedAt: null }
  const [categories, accounts, cards, payees] = await Promise.all([
    db.category.findMany({ where, select: { id: true, name: true, kind: true } }),
    db.account.findMany({ where, select: { id: true, name: true } }),
    db.creditCard.findMany({
      where,
      select: { id: true, name: true, closingDay: true, dueDay: true },
    }),
    db.payee.findMany({ where, select: { id: true, name: true } }),
  ])
  return { categories, accounts, cards, payees }
}

/**
 * Acha um cadastro pelo nome (sem acento/maiúsculas). Sem igualdade exata, aceita um único
 * cadastro que comece com o nome ("Nubank" → "Nubank Roxinho").
 */
function findByName<T extends Named>(items: readonly T[], name: string | null): T | undefined {
  if (!name) return undefined
  const key = refKey(name)
  const exact = items.find((item) => refKey(item.name) === key)
  if (exact) return exact
  const partial = items.filter((item) => {
    const itemKey = refKey(item.name)
    return itemKey.startsWith(key)
  })
  return partial.length === 1 ? partial[0] : undefined
}

// ─── Conferência de cada rascunho (pré-visualização) ─────────────────────────

interface CheckContext {
  lookups: Lookups
  cardCompetence: 'due_month' | 'closing_month'
  /** RI-02: lançamentos que já existem (mês|valor|descrição). */
  existing: Set<string>
  /** Lançamentos gerados por modelos recorrentes (mês|tipo|descrição). */
  generated: Set<string>
  plans: Set<string>
  goals: Map<string, number | null>
  /** Carteira (Fase 5): classes, ativos, operações e proventos existentes. */
  portfolio: PortfolioContext
}

const planKey = (description: string, count: number, totalCents: number) =>
  `${refKey(description)}|${count}|${totalCents}`

const monthLabel = (month: string) => `${month.slice(5, 7)}/${month.slice(0, 4)}`

function transactionMonth(
  draft: Extract<ImportDraftInput, { kind: 'transaction' }>,
  ctx: CheckContext,
): string {
  const card =
    draft.paymentMethod === 'credit' ? findByName(ctx.lookups.cards, draft.cardName) : undefined
  return resolveCompetence({
    competenceMonth: draft.competenceMonth ?? undefined,
    date: draft.date,
    card: card ?? null,
    mode: ctx.cardCompetence,
  })
}

function checkRefs(
  draft: Extract<ImportDraftInput, { kind: 'transaction' | 'installmentPlan' }>,
  categoryKind: 'income' | 'expense',
  ctx: CheckContext,
  errors: string[],
  creates: string[],
) {
  if (draft.paymentMethod === 'credit') {
    if (!draft.cardName) errors.push('Compra no crédito sem cartão')
    else if (!findByName(ctx.lookups.cards, draft.cardName)) {
      errors.push(`Cartão "${draft.cardName}" não cadastrado (cadastre em Configurações › Cartões)`)
    }
  }
  const categories = ctx.lookups.categories.filter((item) => item.kind === categoryKind)
  if (draft.categoryName && !findByName(categories, draft.categoryName)) {
    creates.push(`Categoria: ${draft.categoryName}`)
  }
  if (draft.accountName && !findByName(ctx.lookups.accounts, draft.accountName)) {
    creates.push(`Conta: ${draft.accountName}`)
  }
  if (draft.payeeName && !findByName(ctx.lookups.payees, draft.payeeName)) {
    creates.push(`Estabelecimento: ${draft.payeeName}`)
  }
}

function checkDraft(draft: ImportDraftInput, ctx: CheckContext): Omit<ImportRowCheck, 'rowNumber'> {
  const errors: string[] = []
  const messages: string[] = []
  const creates: string[] = []
  let duplicate = false

  if (draft.kind === 'transaction') {
    checkRefs(draft, draft.type, ctx, errors, creates)
    const month = transactionMonth(draft, ctx)
    if (ctx.existing.has(duplicateKey(month, draft.amountCents, draft.description))) {
      duplicate = true
      messages.push(
        `Provável duplicado: já existe "${draft.description}" igual em ${monthLabel(month)}`,
      )
    } else if (ctx.generated.has(`${month}|${draft.type}|${refKey(draft.description)}`)) {
      duplicate = true
      messages.push(
        `Já existe "${draft.description}" em ${monthLabel(month)}, gerado por um modelo recorrente`,
      )
    }
  } else if (draft.kind === 'installmentPlan') {
    checkRefs(draft, 'expense', ctx, errors, creates)
    if (draft.settledCount !== null && draft.settledCount > draft.installmentsCount) {
      errors.push('Parcelas pagas maior que o nº de parcelas')
    }
    if (draft.currentInstallment !== null && draft.currentInstallment > draft.installmentsCount) {
      errors.push('Parcela atual maior que o nº de parcelas')
    }
    if (ctx.plans.has(planKey(draft.description, draft.installmentsCount, draft.totalCents))) {
      duplicate = true
      messages.push(`Provável duplicado: já existe o parcelamento "${draft.description}"`)
    }
  } else if (isPortfolioDraft(draft)) {
    const result = checkPortfolioDraft(draft, ctx.portfolio)
    errors.push(...result.errors)
    messages.push(...result.messages)
    creates.push(...result.creates)
    duplicate = result.duplicate
  } else {
    const previous = ctx.goals.get(draft.month)
    if (previous !== undefined && previous !== null && previous > 0) {
      messages.push(`Substitui o investido já registrado em ${monthLabel(draft.month)}`)
    }
  }

  const status: ImportRowCheck['status'] =
    errors.length > 0 ? 'error' : duplicate ? 'duplicate' : messages.length > 0 ? 'warning' : 'ok'
  return { status, messages: [...errors, ...messages], creates }
}

/** Monta o contexto de conferência: cadastros, lançamentos e parcelamentos existentes. */
async function checkContext(
  db: Db,
  userId: string,
  drafts: readonly ImportDraftInput[],
): Promise<CheckContext> {
  const [lookups, settings, portfolio] = await Promise.all([
    loadLookups(db, userId),
    financeSettings(db, userId),
    portfolioContext(db, userId),
  ])
  const months = drafts.flatMap((draft) =>
    draft.kind === 'transaction'
      ? [draft.competenceMonth ?? isoDateToCompetenceMonth(draft.date)]
      : draft.kind === 'monthGoal'
        ? [draft.month]
        : [],
  )
  const sorted = [...months].sort(compareMonths)
  const from = sorted[0]
  const to = sorted[sorted.length - 1]
  const [rows, plans, goals] = await Promise.all([
    from && to
      ? db.transaction.findMany({
          where: {
            userId,
            deletedAt: null,
            // Uma margem de 2 meses cobre compras no crédito que caem na fatura seguinte.
            competenceMonth: {
              gte: competenceMonthToDate(from),
              lte: competenceMonthToDate(
                dateToCompetenceMonth(
                  new Date(competenceMonthToDate(to).getTime() + 62 * 86_400_000),
                ),
              ),
            },
          },
          select: {
            type: true,
            description: true,
            amountCents: true,
            competenceMonth: true,
            recurringTemplateId: true,
          },
        })
      : Promise.resolve([]),
    db.installmentPlan.findMany({
      where: { userId, deletedAt: null },
      select: { description: true, installmentsCount: true, totalCents: true },
    }),
    db.monthSettings.findMany({
      where: { userId },
      select: { competenceMonth: true, goalInvestedCents: true },
    }),
  ])
  const existing = new Set<string>()
  const generated = new Set<string>()
  for (const row of rows) {
    const month = dateToCompetenceMonth(row.competenceMonth)
    existing.add(duplicateKey(month, centsToNumber(row.amountCents), row.description))
    if (row.recurringTemplateId) generated.add(`${month}|${row.type}|${refKey(row.description)}`)
  }
  return {
    lookups,
    portfolio,
    cardCompetence: settings.cardCompetence,
    existing,
    generated,
    plans: new Set(
      plans.map((plan) =>
        planKey(plan.description, plan.installmentsCount, centsToNumber(plan.totalCents)),
      ),
    ),
    goals: new Map(
      goals.map((row) => [
        dateToCompetenceMonth(row.competenceMonth),
        centsToNumber(row.goalInvestedCents),
      ]),
    ),
  }
}

// ─── Respostas ───────────────────────────────────────────────────────────────

type JobRow = Prisma.ImportJobGetPayload<object>

const EMPTY_STATS: ImportJob['stats'] = {
  rows: 0,
  transactions: 0,
  installmentPlans: 0,
  monthGoals: 0,
  assets: 0,
  trades: 0,
  dividends: 0,
  balances: 0,
  contributions: 0,
  created: [],
  skipped: 0,
}

function toJob(row: JobRow): ImportJob {
  return {
    id: row.id,
    kind: row.kind as ImportJob['kind'],
    fileName: row.fileName,
    status: row.status as ImportJob['status'],
    mapping: (row.mapping as Record<string, unknown> | null) ?? null,
    stats: { ...EMPTY_STATS, ...((row.stats as Partial<ImportJob['stats']> | null) ?? {}) },
    createdAt: toIso(row.createdAt),
    committedAt: row.committedAt ? toIso(row.committedAt) : null,
    undoneAt: row.undoneAt ? toIso(row.undoneAt) : null,
  }
}

// ─── Rotas ───────────────────────────────────────────────────────────────────

/** /imports — importação em lotes, confirmação única e desfazer (RI-02, RI-03, RI-07). */
export function importsRouter(prisma: PrismaClient, clock: Clock): Router {
  const router = Router()
  const findOwned = (userId: string, id: string) =>
    ensureFound(prisma.importJob.findFirst({ where: { id, userId } }), 'Importação não encontrada')

  router.get('/imports', async (req, res) => {
    const rows = await prisma.importJob.findMany({
      where: { userId: userIdOf(req), status: { not: 'pending' } },
      orderBy: { createdAt: 'desc' },
      take: 50,
    })
    const body: ListResponse<ImportJob> = { data: rows.map(toJob), nextCursor: null }
    res.json(body)
  })

  /** Último mapeamento usado em cada tipo (passo 3 já vem preenchido). */
  router.get('/imports/mappings', async (req, res) => {
    const rows = await prisma.importJob.findMany({
      where: { userId: userIdOf(req), status: 'committed', mapping: { not: undefined } },
      orderBy: { createdAt: 'desc' },
      select: { kind: true, mapping: true },
      take: 30,
    })
    const out: Record<string, unknown> = {}
    for (const row of rows) if (row.mapping && !(row.kind in out)) out[row.kind] = row.mapping
    res.json(out)
  })

  router.post('/imports', async (req, res) => {
    const userId = userIdOf(req)
    const input = parse(createImportRequestSchema, req.body)
    // Rascunhos abandonados (o usuário saiu no meio do wizard) não ficam para sempre.
    await prisma.importJob.deleteMany({
      where: { userId, status: 'pending', createdAt: { lt: new Date(Date.now() - 86_400_000) } },
    })
    const row = await prisma.importJob.create({
      data: {
        userId,
        kind: input.kind,
        fileName: input.fileName,
        mapping: (input.mapping ?? undefined) as Prisma.InputJsonValue | undefined,
      },
    })
    res.status(201).json(toJob(row))
  })

  router.post('/imports/:id/rows', async (req, res) => {
    const userId = userIdOf(req)
    const job = await findOwned(userId, paramId(req))
    if (job.status !== 'pending') throw conflict('Esta importação já foi confirmada')
    const input = parse(importRowsRequestSchema, req.body)
    const ctx = await checkContext(
      prisma,
      userId,
      input.rows.map((row) => row.draft),
    )
    const checks: ImportRowCheck[] = input.rows.map((row) => ({
      rowNumber: row.rowNumber,
      ...checkDraft(row.draft, ctx),
    }))
    const numbers = input.rows.map((row) => row.rowNumber)
    await prisma.$transaction([
      // Reenviar a mesma linha (ex.: depois de mudar a associação de bancos) substitui a anterior.
      prisma.importRow.deleteMany({ where: { jobId: job.id, rowNumber: { in: numbers } } }),
      prisma.importRow.createMany({
        data: input.rows.map((row, index) => ({
          jobId: job.id,
          rowNumber: row.rowNumber,
          raw: { ...row.raw, _sourceRows: row.sourceRows.join(',') },
          parsed: row.draft as Prisma.InputJsonValue,
          errors: checks[index] as unknown as Prisma.InputJsonValue,
        })),
      }),
    ])
    res.json({ rows: checks })
  })

  router.post('/imports/:id/commit', async (req, res) => {
    const userId = userIdOf(req)
    const job = await findOwned(userId, paramId(req))
    if (job.status !== 'pending') throw conflict('Esta importação já foi confirmada')
    const input = parse(commitImportRequestSchema, req.body ?? {})
    const skip = new Set(input.skipRows)
    const stored = await prisma.importRow.findMany({
      where: { jobId: job.id, rowNumber: { gt: 0 } },
      orderBy: { rowNumber: 'asc' },
    })

    const result = await prisma.$transaction(
      async (tx) => {
        const drafts = stored
          .filter((row) => !skip.has(row.rowNumber))
          .map((row) => ({ row, draft: importDraftSchema.parse(row.parsed) }))
        const ctx = await checkContext(
          tx,
          userId,
          drafts.map((item) => item.draft),
        )
        const { lookups } = ctx
        const created: { type: string; id: string; label: string }[] = []
        const stats: ImportJob['stats'] = { ...EMPTY_STATS, created: [], rows: stored.length }
        stats.skipped = stored.length - drafts.length

        async function ensureRef(
          type: 'category' | 'account' | 'payee',
          name: string | null,
          kind: 'income' | 'expense' = 'expense',
        ): Promise<string | null> {
          if (!name) return null
          const list =
            type === 'category'
              ? lookups.categories.filter((item) => item.kind === kind)
              : type === 'account'
                ? lookups.accounts
                : lookups.payees
          const found = findByName(list, name)
          if (found) return found.id
          if (!input.createMissing) return null
          const color = PALETTE[created.length % PALETTE.length] as string
          if (type === 'category') {
            const row = await tx.category.create({
              data: { userId, kind, name, icon: 'ellipsis', color },
              select: { id: true, name: true, kind: true },
            })
            lookups.categories.push(row)
            created.push({ type, id: row.id, label: `Categoria: ${name}` })
            return row.id
          }
          if (type === 'account') {
            const row = await tx.account.create({
              data: { userId, name, kind: 'checking', color },
              select: { id: true, name: true },
            })
            lookups.accounts.push(row)
            created.push({ type, id: row.id, label: `Conta: ${name}` })
            return row.id
          }
          const row = await tx.payee.create({
            data: { userId, name },
            select: { id: true, name: true },
          })
          lookups.payees.push(row)
          created.push({ type, id: row.id, label: `Estabelecimento: ${name}` })
          return row.id
        }

        // Modelos recorrentes: o lançamento importado "ocupa" o mês do modelo com a mesma
        // descrição, para o modelo não gerar o mesmo salário/conta de novo naquele mês.
        const templates = await tx.recurringTemplate.findMany({
          where: { userId, deletedAt: null },
          select: { id: true, type: true, description: true, startMonth: true, endMonth: true },
        })
        const taken = new Set(
          (
            await tx.transaction.findMany({
              where: { userId, recurringTemplateId: { not: null } },
              select: { recurringTemplateId: true, competenceMonth: true },
            })
          ).map(
            (row) => `${row.recurringTemplateId}|${dateToCompetenceMonth(row.competenceMonth)}`,
          ),
        )
        const templateFor = (type: string, description: string, month: string) => {
          const template = templates.find(
            (item) =>
              item.type === type &&
              refKey(item.description) === refKey(description) &&
              compareMonths(dateToCompetenceMonth(item.startMonth), month) <= 0 &&
              (!item.endMonth || compareMonths(dateToCompetenceMonth(item.endMonth), month) >= 0) &&
              !taken.has(`${item.id}|${month}`),
          )
          if (template) taken.add(`${template.id}|${month}`)
          return template
        }

        const entityOf = new Map<string, { type: string; id: string | null }>()
        const portfolio = portfolioWriter(tx, userId, ctx.portfolio, {
          createMissing: input.createMissing,
          ensureAccount: (name) => ensureRef('account', name),
          created,
        })

        for (const { row, draft } of drafts) {
          const check = checkDraft(draft, ctx)
          if (check.status === 'error') {
            stats.skipped += 1
            continue
          }
          if (isPortfolioDraft(draft)) {
            const entity = await portfolio.apply(draft)
            if (draft.kind === 'asset') stats.assets += 1
            if (!entity) {
              if (draft.kind !== 'asset') stats.skipped += 1
              continue
            }
            if (entity.type === 'target_allocation') {
              await tx.importRow.update({
                where: { id: row.id },
                data: {
                  entityType: entity.type,
                  entityId: entity.id,
                  raw: {
                    ...(row.raw as Record<string, string>),
                    _previous: entity.previous ? JSON.stringify(entity.previous) : 'none',
                  },
                },
              })
            } else {
              entityOf.set(row.id, { type: entity.type, id: entity.id })
              if (entity.type === 'asset_trade') stats.trades += 1
              if (entity.type === 'dividend') stats.dividends += 1
              if (entity.type === 'balance') stats.balances += 1
              if (entity.type === 'contribution') stats.contributions += 1
            }
            continue
          }
          if (draft.kind === 'monthGoal') {
            const competenceMonth = competenceMonthToDate(draft.month)
            const previous = await tx.monthSettings.findUnique({
              where: { userId_competenceMonth: { userId, competenceMonth } },
            })
            await tx.monthSettings.upsert({
              where: { userId_competenceMonth: { userId, competenceMonth } },
              create: {
                userId,
                competenceMonth,
                savingsGoalCents: BigInt(draft.goalCents),
                goalInvestedCents: BigInt(draft.investedCents),
              },
              update: {
                savingsGoalCents: BigInt(draft.goalCents),
                goalInvestedCents: BigInt(draft.investedCents),
              },
            })
            await tx.importRow.update({
              where: { id: row.id },
              data: {
                entityType: 'month_settings',
                raw: {
                  ...(row.raw as Record<string, string>),
                  _previous: previous
                    ? JSON.stringify({
                        savingsGoalCents: centsToNumber(previous.savingsGoalCents),
                        goalInvestedCents: centsToNumber(previous.goalInvestedCents),
                      })
                    : 'none',
                },
              },
            })
            stats.monthGoals += 1
            continue
          }

          const card =
            draft.paymentMethod === 'credit'
              ? (findByName(lookups.cards, draft.cardName) ?? null)
              : null
          const refs = {
            categoryId: await ensureRef(
              'category',
              draft.categoryName,
              draft.kind === 'transaction' ? draft.type : 'expense',
            ),
            accountId: await ensureRef('account', draft.accountName),
            payeeId: await ensureRef('payee', draft.payeeName),
            creditCardId: card?.id ?? null,
          }

          if (draft.kind === 'transaction') {
            const month = transactionMonth(draft, ctx)
            const template = templateFor(draft.type, draft.description, month)
            const id = randomUUID()
            // RF-57: um saldo anterior por mês. Se o mês já tem, a linha entra como extra.
            let nature: string = draft.nature
            if (nature === 'carryover') {
              const taken = await tx.transaction.count({
                where: {
                  userId,
                  competenceMonth: competenceMonthToDate(month),
                  nature: 'carryover',
                  deletedAt: null,
                },
              })
              if (taken > 0) nature = draft.type === 'income' ? 'extra' : 'variable'
            }
            await tx.transaction.create({
              data: {
                id,
                userId,
                type: draft.type,
                nature,
                status: draft.status,
                description: draft.description,
                amountCents: BigInt(draft.amountCents),
                competenceMonth: competenceMonthToDate(month),
                date: isoDateToDate(draft.date),
                paymentMethod: draft.paymentMethod,
                notes: draft.notes,
                recurringTemplateId: template?.id ?? null,
                isOverride: Boolean(template),
                source: 'import',
                ...refs,
              },
            })
            entityOf.set(row.id, { type: 'transaction', id })
            stats.transactions += 1
            continue
          }

          // Parcelamento (RF-40..43, RI-04).
          const firstCompetenceMonth =
            draft.firstCompetenceMonth ??
            (draft.currentInstallment
              ? firstMonthFromCurrentInstallment(clock.currentMonth(), draft.currentInstallment)
              : card
                ? statementCompetenceMonth(draft.purchaseDate, card, ctx.cardCompetence)
                : isoDateToCompetenceMonth(draft.purchaseDate))
          const settledCount =
            draft.settledCount ?? (draft.currentInstallment ? draft.currentInstallment - 1 : 0)
          const schedule = buildInstallmentSchedule({
            totalCents: draft.totalCents,
            count: draft.installmentsCount,
            firstCompetenceMonth,
          })
          const planId = randomUUID()
          const payoff = draft.payoffMonth
            ? schedule.filter((item) => item.number > settledCount)
            : []
          await tx.installmentPlan.create({
            data: {
              id: planId,
              userId,
              description: draft.description,
              paymentMethod: draft.paymentMethod,
              purchaseDate: isoDateToDate(draft.purchaseDate),
              totalCents: BigInt(draft.totalCents),
              installmentsCount: draft.installmentsCount,
              firstCompetenceMonth: competenceMonthToDate(firstCompetenceMonth),
              notes: draft.notes,
              categoryId: refs.categoryId,
              accountId: refs.accountId,
              payeeId: refs.payeeId,
              creditCardId: refs.creditCardId,
              ...(draft.payoffMonth && {
                status: 'paid_off',
                paidOffAt: isoDateToDate(dateInMonth(draft.payoffMonth, 1)),
                payoffDiscountCents: 0n,
              }),
            },
          })
          const common = {
            userId,
            type: 'expense',
            nature: 'installment',
            description: draft.description,
            paymentMethod: draft.paymentMethod,
            installmentPlanId: planId,
            source: 'import',
            ...refs,
          }
          await tx.transaction.createMany({
            data: schedule
              .filter((item) => !draft.payoffMonth || item.number <= settledCount)
              .map((item) => ({
                ...common,
                status: item.number <= settledCount ? 'settled' : 'forecast',
                amountCents: BigInt(item.amountCents),
                competenceMonth: competenceMonthToDate(item.competenceMonth),
                date: installmentDate(
                  item.competenceMonth,
                  draft.purchaseDate,
                  card,
                  ctx.cardCompetence,
                ),
                installmentNumber: item.number,
              })),
          })
          if (draft.payoffMonth && payoff.length > 0) {
            await tx.transaction.create({
              data: {
                ...common,
                description: `Quitação: ${draft.description}`,
                status: 'settled',
                amountCents: BigInt(payoff.reduce((sum, item) => sum + item.amountCents, 0)),
                competenceMonth: competenceMonthToDate(draft.payoffMonth),
                date: isoDateToDate(dateInMonth(draft.payoffMonth, 1)),
                installmentNumber: null,
              },
            })
          }
          entityOf.set(row.id, { type: 'installment_plan', id: planId })
          stats.installmentPlans += 1
        }

        // RI-05: posições recalculadas; venda maior que a posição desfaz tudo.
        await portfolio.finish()

        for (const [rowId, entity] of entityOf) {
          await tx.importRow.update({
            where: { id: rowId },
            data: { entityType: entity.type, entityId: entity.id },
          })
        }
        if (created.length > 0) {
          await tx.importRow.createMany({
            data: created.map((item) => ({
              jobId: job.id,
              rowNumber: 0,
              raw: { label: item.label },
              entityType: item.type,
              entityId: item.id,
            })),
          })
        }
        stats.created = created.map((item) => item.label)
        return tx.importJob.update({
          where: { id: job.id },
          data: {
            status: 'committed',
            committedAt: new Date(),
            stats: stats as unknown as Prisma.InputJsonValue,
          },
        })
      },
      { timeout: 120_000, maxWait: 10_000 },
    )
    res.json(toJob(result))
  })

  /** RI-03: desfaz tudo o que a importação criou (soft delete) e devolve as metas anteriores. */
  router.post('/imports/:id/undo', async (req, res) => {
    const userId = userIdOf(req)
    const job = await findOwned(userId, paramId(req))
    if (job.status !== 'committed') throw conflict('Só dá para desfazer uma importação confirmada')
    const rows = await prisma.importRow.findMany({
      where: { jobId: job.id, entityType: { not: null } },
    })
    const ids = (type: string) =>
      rows
        .filter((row) => row.entityType === type && row.entityId)
        .map((row) => row.entityId as string)
    const now = new Date()

    const result = await prisma.$transaction(
      async (tx) => {
        const transactions = ids('transaction')
        const plans = ids('installment_plan')
        // Solta o vínculo com o modelo recorrente: o mês volta a receber o lançamento do modelo.
        await tx.transaction.updateMany({
          where: { userId, id: { in: transactions } },
          data: { deletedAt: now, recurringTemplateId: null },
        })
        await tx.transaction.updateMany({
          where: { userId, installmentPlanId: { in: plans }, deletedAt: null },
          data: { deletedAt: now },
        })
        await tx.installmentPlan.updateMany({
          where: { userId, id: { in: plans } },
          data: { deletedAt: now },
        })
        for (const row of rows.filter((item) => item.entityType === 'month_settings')) {
          const parsed = row.parsed as { month?: string } | null
          const raw = row.raw as Record<string, string> | null
          if (!parsed?.month) continue
          const previous =
            raw?._previous && raw._previous !== 'none'
              ? (JSON.parse(raw._previous) as {
                  savingsGoalCents: number | null
                  goalInvestedCents: number | null
                })
              : { savingsGoalCents: null, goalInvestedCents: null }
          await tx.monthSettings.updateMany({
            where: { userId, competenceMonth: competenceMonthToDate(parsed.month) },
            data: {
              savingsGoalCents:
                previous.savingsGoalCents === null ? null : BigInt(previous.savingsGoalCents),
              goalInvestedCents:
                previous.goalInvestedCents === null ? null : BigInt(previous.goalInvestedCents),
            },
          })
        }
        await undoPortfolio(tx, userId, rows, now)
        // Cadastros criados pela importação saem só se nada mais os usa.
        const inUse = { deletedAt: null }
        for (const id of ids('account')) {
          const used =
            (await tx.transaction.count({ where: { accountId: id, ...inUse } })) +
            (await tx.creditCard.count({ where: { accountId: id, ...inUse } })) +
            (await tx.recurringTemplate.count({ where: { accountId: id, ...inUse } }))
          if (used === 0)
            await tx.account.updateMany({ where: { id, userId }, data: { deletedAt: now } })
        }
        for (const id of ids('category')) {
          const used =
            (await tx.transaction.count({ where: { categoryId: id, ...inUse } })) +
            (await tx.recurringTemplate.count({ where: { categoryId: id, ...inUse } }))
          if (used === 0)
            await tx.category.updateMany({ where: { id, userId }, data: { deletedAt: now } })
        }
        for (const id of ids('payee')) {
          const used =
            (await tx.transaction.count({ where: { payeeId: id, ...inUse } })) +
            (await tx.recurringTemplate.count({ where: { payeeId: id, ...inUse } }))
          if (used === 0)
            await tx.payee.updateMany({ where: { id, userId }, data: { deletedAt: now } })
        }
        return tx.importJob.update({
          where: { id: job.id },
          data: { status: 'undone', undoneAt: now },
        })
      },
      { timeout: 60_000 },
    )
    res.json(toJob(result))
  })

  return router
}
