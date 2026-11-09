import { competenceMonthToDate, dateToCompetenceMonth, dateToIsoDate, toCsv } from '@orla/core'
import {
  BACKUP_FORMAT_VERSION,
  exportEntitySchema,
  exportQuerySchema,
  restoreRequestSchema,
  type Backup,
  type ExportTable,
  type RestoreResponse,
} from '@orla/contracts'
import { Prisma, type PrismaClient } from '@orla/db'
import { Router } from 'express'
import { notFound, validationError } from '../lib/errors.ts'
import { nextMonthDate } from '../lib/finance.ts'
import { parse } from '../lib/validate.ts'
import { userIdOf } from '../middleware/auth.ts'

// ─── Exportação (RE-01) ──────────────────────────────────────────────────────

/** Valor em reais no formato pt-BR sem símbolo ("1234,56"), que volta igual na importação. */
const money = (cents: bigint | number | null) =>
  cents === null ? null : (Number(cents) / 100).toFixed(2).replace('.', ',')
const brDate = (date: Date) => {
  const [year, month, day] = dateToIsoDate(date).split('-')
  return `${day}/${month}/${year}`
}
const brMonth = (date: Date) => {
  const [year, month] = dateToCompetenceMonth(date).split('-')
  return `${month}/${year}`
}

const NATURE: Record<string, string> = {
  fixed: 'fixa',
  variable: 'variavel',
  planned: 'planejamento',
  extra: 'extra',
  installment: 'parcela',
}
const METHOD: Record<string, string> = {
  pix: 'pix',
  debit: 'debito',
  credit: 'credito',
  cash: 'dinheiro',
  boleto: 'boleto',
  transfer: 'transferencia',
  other: 'outro',
}

async function transactionsTable(
  prisma: PrismaClient,
  userId: string,
  range: Prisma.DateTimeFilter | undefined,
): Promise<ExportTable> {
  const rows = await prisma.transaction.findMany({
    where: { userId, deletedAt: null, ...(range && { competenceMonth: range }) },
    include: { category: true, account: true, creditCard: true, payee: true },
    orderBy: [{ date: 'asc' }, { createdAt: 'asc' }],
  })
  return {
    // Mesmas colunas do template de Lançamentos (docs/08): exportar → importar funciona.
    columns: [
      'data',
      'competencia',
      'tipo',
      'natureza',
      'descricao',
      'valor',
      'categoria',
      'forma_pagamento',
      'conta',
      'cartao',
      'estabelecimento',
      'status',
      'observacao',
    ],
    rows: rows.map((row) => [
      brDate(row.date),
      brMonth(row.competenceMonth),
      row.type === 'income' ? 'receita' : 'despesa',
      NATURE[row.nature] ?? row.nature,
      row.description,
      money(row.amountCents),
      row.category?.name ?? null,
      row.paymentMethod ? (METHOD[row.paymentMethod] ?? row.paymentMethod) : null,
      row.account?.name ?? null,
      row.creditCard?.name ?? null,
      row.payee?.name ?? null,
      row.status === 'settled' ? 'pago' : 'previsto',
      row.notes,
    ]),
  }
}

async function plansTable(prisma: PrismaClient, userId: string): Promise<ExportTable> {
  const rows = await prisma.installmentPlan.findMany({
    where: { userId, deletedAt: null },
    include: {
      category: true,
      creditCard: true,
      payee: true,
      transactions: {
        where: { deletedAt: null },
        select: { status: true, installmentNumber: true },
      },
    },
    orderBy: { purchaseDate: 'asc' },
  })
  return {
    columns: [
      'data_compra',
      'descricao',
      'estabelecimento',
      'categoria',
      'cartao',
      'valor_total',
      'valor_parcela',
      'qtd_parcelas',
      'parcelas_pagas',
      'situacao',
      'observacao',
    ],
    rows: rows.map((row) => {
      const paid = row.transactions.filter(
        (item) => item.status === 'settled' && item.installmentNumber !== null,
      ).length
      return [
        brDate(row.purchaseDate),
        row.description,
        row.payee?.name ?? null,
        row.category?.name ?? null,
        row.creditCard?.name ?? null,
        money(row.totalCents),
        money(Math.round(Number(row.totalCents) / row.installmentsCount)),
        row.installmentsCount,
        paid,
        row.status === 'paid_off' ? 'quitado' : row.status === 'canceled' ? 'cancelado' : 'ativo',
        row.notes,
      ]
    }),
  }
}

// ─── Backup e restauração (RE-02) ────────────────────────────────────────────

/** Converte uma linha do Prisma em JSON puro (centavos como número, datas em ISO). */
function plain(row: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(row)) {
    if (key === 'userId') continue
    if (typeof value === 'bigint') out[key] = Number(value)
    else if (value instanceof Date) out[key] = value.toISOString()
    else if (value !== null && typeof value === 'object' && 'toFixed' in value)
      out[key] = String(value)
    else out[key] = value
  }
  return out
}

/** Colunas aceitas na restauração, com o tipo de cada uma (o resto do JSON é ignorado). */
type ColumnType =
  | 'string'
  | 'stringOrNull'
  | 'int'
  | 'bool'
  | 'cents'
  | 'centsOrNull'
  | 'date'
  | 'dateOrNull'
  | 'strings'
  | 'decimal'
  | 'decimalOrNull'
  | 'jsonOrNull'
  | 'json'
const COLUMNS: Record<string, Record<string, ColumnType>> = {
  assetClasses: { id: 'string', name: 'string', kind: 'string', color: 'string', sortOrder: 'int' },
  assets: {
    id: 'string',
    assetClassId: 'string',
    ticker: 'stringOrNull',
    name: 'string',
    accountId: 'stringOrNull',
    quoteMode: 'string',
    fixedIncomeInfo: 'jsonOrNull',
    targetWeightPct: 'decimalOrNull',
    maxWeightPct: 'decimalOrNull',
    manualPrice: 'decimalOrNull',
    manualPriceAt: 'dateOrNull',
    manualValueCents: 'centsOrNull',
    manualValueAt: 'dateOrNull',
    isArchived: 'bool',
  },
  assetTrades: {
    id: 'string',
    assetId: 'string',
    kind: 'string',
    tradeDate: 'date',
    quantity: 'decimal',
    unitPrice: 'decimal',
    feesCents: 'cents',
    totalCents: 'cents',
    splitRatio: 'decimalOrNull',
    notes: 'stringOrNull',
    source: 'string',
    contributionPlanId: 'stringOrNull',
  },
  contributionPlans: {
    id: 'string',
    competenceMonth: 'date',
    name: 'string',
    totalCents: 'cents',
    status: 'string',
    classSplit: 'json',
    executedAt: 'dateOrNull',
  },
  contributions: {
    id: 'string',
    date: 'date',
    competenceMonth: 'date',
    amountCents: 'cents',
    accountId: 'stringOrNull',
    notes: 'stringOrNull',
    contributionPlanId: 'stringOrNull',
  },
  dividends: {
    id: 'string',
    assetId: 'string',
    kind: 'string',
    payDate: 'date',
    exDate: 'dateOrNull',
    amountCents: 'cents',
    grossCents: 'centsOrNull',
    quantityBase: 'decimalOrNull',
    perShare: 'decimalOrNull',
    notes: 'stringOrNull',
    source: 'string',
  },
  accounts: { id: 'string', name: 'string', kind: 'string', color: 'string', isArchived: 'bool' },
  creditCards: {
    id: 'string',
    accountId: 'string',
    name: 'string',
    closingDay: 'int',
    dueDay: 'int',
    limitCents: 'centsOrNull',
  },
  categories: {
    id: 'string',
    kind: 'string',
    name: 'string',
    parentId: 'stringOrNull',
    icon: 'string',
    color: 'string',
    monthlyBudgetCents: 'centsOrNull',
    sortOrder: 'int',
  },
  payees: { id: 'string', name: 'string', defaultCategoryId: 'stringOrNull' },
  recurringTemplates: {
    id: 'string',
    type: 'string',
    nature: 'string',
    description: 'string',
    amountCents: 'cents',
    categoryId: 'stringOrNull',
    payeeId: 'stringOrNull',
    paymentMethod: 'stringOrNull',
    creditCardId: 'stringOrNull',
    accountId: 'stringOrNull',
    frequency: 'string',
    dayOfMonth: 'int',
    monthOfYear: 'int',
    startMonth: 'date',
    endMonth: 'dateOrNull',
    isActive: 'bool',
  },
  installmentPlans: {
    id: 'string',
    description: 'string',
    payeeId: 'stringOrNull',
    categoryId: 'stringOrNull',
    paymentMethod: 'string',
    creditCardId: 'stringOrNull',
    accountId: 'stringOrNull',
    purchaseDate: 'date',
    totalCents: 'cents',
    installmentsCount: 'int',
    firstCompetenceMonth: 'date',
    status: 'string',
    paidOffAt: 'dateOrNull',
    payoffDiscountCents: 'centsOrNull',
    notes: 'stringOrNull',
  },
  transactions: {
    id: 'string',
    type: 'string',
    nature: 'string',
    status: 'string',
    description: 'string',
    amountCents: 'cents',
    competenceMonth: 'date',
    date: 'date',
    categoryId: 'stringOrNull',
    accountId: 'stringOrNull',
    payeeId: 'stringOrNull',
    paymentMethod: 'stringOrNull',
    creditCardId: 'stringOrNull',
    installmentPlanId: 'stringOrNull',
    installmentNumber: 'int',
    recurringTemplateId: 'stringOrNull',
    parentPlannedId: 'stringOrNull',
    isOverride: 'bool',
    tags: 'strings',
    notes: 'stringOrNull',
    source: 'string',
  },
}

/** Campos que apontam para outros cadastros (precisam ser do mesmo usuário). */
const REFS: Record<string, Record<string, string>> = {
  assets: { assetClassId: 'assetClasses', accountId: 'accounts' },
  assetTrades: { assetId: 'assets', contributionPlanId: 'contributionPlans' },
  contributions: { accountId: 'accounts', contributionPlanId: 'contributionPlans' },
  dividends: { assetId: 'assets' },
  creditCards: { accountId: 'accounts' },
  categories: { parentId: 'categories' },
  payees: { defaultCategoryId: 'categories' },
  recurringTemplates: {
    categoryId: 'categories',
    payeeId: 'payees',
    creditCardId: 'creditCards',
    accountId: 'accounts',
  },
  installmentPlans: {
    categoryId: 'categories',
    payeeId: 'payees',
    creditCardId: 'creditCards',
    accountId: 'accounts',
  },
  transactions: {
    categoryId: 'categories',
    payeeId: 'payees',
    creditCardId: 'creditCards',
    accountId: 'accounts',
    installmentPlanId: 'installmentPlans',
    recurringTemplateId: 'recurringTemplates',
    parentPlannedId: 'transactions',
  },
}
const TABLE_ORDER = [
  'accounts',
  'creditCards',
  'categories',
  'payees',
  'recurringTemplates',
  'installmentPlans',
  'transactions',
  'assetClasses',
  'assets',
  'contributionPlans',
  'assetTrades',
  'dividends',
  'contributions',
] as const
type Table = (typeof TABLE_ORDER)[number]

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function invalid(message: string): never {
  throw validationError(`Backup inválido: ${message}`)
}

/** Lê uma linha do backup só com as colunas conhecidas e nos tipos do banco. */
function coerce(table: Table, record: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const [key, type] of Object.entries(COLUMNS[table] ?? {})) {
    const value = record[key]
    if (value === undefined) {
      if (type.endsWith('OrNull')) out[key] = null
      else if (key === 'installmentNumber' || key === 'monthOfYear') out[key] = null
      else if (type === 'bool' || type === 'strings') continue
      else invalid(`${table}.${key} ausente`)
      continue
    }
    if (
      value === null &&
      (type.endsWith('OrNull') || key === 'installmentNumber' || key === 'monthOfYear')
    ) {
      out[key] = null
      continue
    }
    switch (type) {
      case 'string':
      case 'stringOrNull':
        if (typeof value !== 'string' || value.length > 500) invalid(`${table}.${key}`)
        out[key] = value
        break
      case 'int':
        if (!Number.isInteger(value)) invalid(`${table}.${key}`)
        out[key] = value
        break
      case 'bool':
        out[key] = Boolean(value)
        break
      case 'cents':
      case 'centsOrNull':
        if (!Number.isSafeInteger(value)) invalid(`${table}.${key}`)
        out[key] = BigInt(value as number)
        break
      case 'date':
      case 'dateOrNull': {
        const date = new Date(String(value))
        if (Number.isNaN(date.getTime())) invalid(`${table}.${key}`)
        out[key] = date
        break
      }
      case 'decimal':
      case 'decimalOrNull':
        if (!/^-?\d+(\.\d+)?$/.test(String(value))) invalid(`${table}.${key}`)
        out[key] = String(value)
        break
      case 'jsonOrNull':
        out[key] = typeof value === 'object' ? value : null
        break
      case 'json':
        if (value === null || typeof value !== 'object' || Array.isArray(value)) {
          invalid(`${table}.${key}`)
        }
        out[key] = value
        break
      case 'strings':
        out[key] = Array.isArray(value)
          ? value.filter((item) => typeof item === 'string').slice(0, 20)
          : []
        break
      default:
        out[key] = value
    }
  }
  if (typeof out.id !== 'string' || !UUID.test(out.id)) invalid(`${table}.id`)
  return out
}

/** Acesso ao delegate do Prisma de cada tabela (todos têm id, userId e deletedAt). */
interface Delegate {
  findMany(args: unknown): Promise<{ id: string; userId: string }[]>
  create(args: unknown): Promise<unknown>
  update(args: unknown): Promise<unknown>
  updateMany(args: unknown): Promise<{ count: number }>
}
function delegate(tx: Prisma.TransactionClient, table: Table): Delegate {
  const map: Record<Table, unknown> = {
    accounts: tx.account,
    creditCards: tx.creditCard,
    categories: tx.category,
    payees: tx.payee,
    recurringTemplates: tx.recurringTemplate,
    installmentPlans: tx.installmentPlan,
    transactions: tx.transaction,
    assetClasses: tx.assetClass,
    assets: tx.asset,
    assetTrades: tx.assetTrade,
    dividends: tx.dividend,
    contributionPlans: tx.contributionPlan,
    contributions: tx.contribution,
  }
  return map[table] as Delegate
}

const PLAN_ITEM_MODES = ['by_value', 'by_quantity']
const DECIMAL = /^\d+(\.\d+)?$/

/**
 * Itens das simulações (não têm user_id: pertencem ao plano). Só entram itens de planos que
 * ficaram com este usuário e que apontam para ativos dele (ou ativo novo). A simulação
 * principal de cada mês volta a ser a do backup, se o mês ainda não tiver uma.
 */
async function restorePlanItems(
  tx: Prisma.TransactionClient,
  userId: string,
  mode: 'merge' | 'replace',
  owned: Map<Table, Set<string>>,
  data: {
    contributionPlanItems?: Record<string, unknown>[]
    contributionPlans?: Record<string, unknown>[]
  },
  counts: RestoreResponse,
): Promise<void> {
  const plans = owned.get('contributionPlans') ?? new Set<string>()
  const assets = owned.get('assets') ?? new Set<string>()
  const trades = owned.get('assetTrades') ?? new Set<string>()
  for (const record of data.contributionPlanItems ?? []) {
    const id = String(record.id)
    const planId = String(record.planId)
    if (!UUID.test(id) || !plans.has(planId)) continue
    const assetId =
      typeof record.assetId === 'string' && assets.has(record.assetId) ? record.assetId : null
    const newAsset =
      record.newAsset && typeof record.newAsset === 'object'
        ? (record.newAsset as Prisma.InputJsonValue)
        : null
    if (!assetId && !newAsset) continue
    if (!PLAN_ITEM_MODES.includes(String(record.mode))) invalid('contributionPlanItems.mode')
    for (const key of ['quantity', 'unitPrice']) {
      if (!DECIMAL.test(String(record[key]))) invalid(`contributionPlanItems.${key}`)
    }
    if (!Number.isSafeInteger(record.valueCents) || (record.valueCents as number) < 0) {
      invalid('contributionPlanItems.valueCents')
    }
    const executedAt = record.executedAt ? new Date(String(record.executedAt)) : null
    const item = {
      planId,
      assetId,
      newAsset: newAsset ?? Prisma.JsonNull,
      mode: String(record.mode),
      quantity: String(record.quantity),
      unitPrice: String(record.unitPrice),
      valueCents: BigInt(record.valueCents as number),
      sortOrder: Number.isInteger(record.sortOrder) ? (record.sortOrder as number) : 0,
      executedTradeId:
        typeof record.executedTradeId === 'string' && trades.has(record.executedTradeId)
          ? record.executedTradeId
          : null,
      executedAt: executedAt && !Number.isNaN(executedAt.getTime()) ? executedAt : null,
    }
    const exists = await tx.contributionPlanItem.findUnique({
      where: { id },
      select: { plan: { select: { userId: true } } },
    })
    if (exists && exists.plan.userId !== userId) continue
    if (exists && mode === 'merge') continue
    await tx.contributionPlanItem.upsert({ where: { id }, create: { id, ...item }, update: item })
    if (exists) counts.updated += 1
    else counts.created += 1
  }
  for (const record of data.contributionPlans ?? []) {
    const id = String(record.id)
    if (record.isPrimary !== true || !plans.has(id)) continue
    const plan = await tx.contributionPlan.findUnique({ where: { id } })
    if (!plan || plan.userId !== userId) continue
    const taken = await tx.contributionPlan.count({
      where: { userId, competenceMonth: plan.competenceMonth, isPrimary: true, deletedAt: null },
    })
    if (taken === 0) await tx.contributionPlan.update({ where: { id }, data: { isPrimary: true } })
  }
}

/** /exports, /backup, /restore (RE-01, RE-02). */
export function exportsRouter(prisma: PrismaClient): Router {
  const router = Router()

  router.get('/exports/:entity', async (req, res) => {
    const userId = userIdOf(req)
    const entity = exportEntitySchema.safeParse(req.params.entity)
    if (!entity.success) throw notFound('Exportação desconhecida')
    const query = parse(exportQuerySchema, req.query)
    const range =
      query.from || query.to
        ? {
            ...(query.from && { gte: competenceMonthToDate(query.from) }),
            ...(query.to && { lt: nextMonthDate(query.to) }),
          }
        : undefined
    const table =
      entity.data === 'transactions'
        ? await transactionsTable(prisma, userId, range)
        : await plansTable(prisma, userId)
    if (query.format === 'json') {
      res.json(table)
      return
    }
    const name = `orla-${entity.data === 'transactions' ? 'lancamentos' : 'parcelamentos'}.csv`
    res.setHeader('Content-Type', 'text/csv; charset=utf-8')
    res.setHeader('Content-Disposition', `attachment; filename="${name}"`)
    // BOM: o Excel abre os acentos certos.
    res.send(`\uFEFF${toCsv([table.columns, ...table.rows])}`)
  })

  router.get('/backup', async (req, res) => {
    const userId = userIdOf(req)
    const live = { userId, deletedAt: null }
    const [
      settings,
      accounts,
      creditCards,
      categories,
      payees,
      templates,
      plans,
      transactions,
      months,
      assetClasses,
      targetAllocations,
      assets,
      assetTrades,
      dividends,
      contributionPlans,
      contributions,
    ] = await Promise.all([
      prisma.userSettings.findUnique({ where: { userId } }),
      prisma.account.findMany({ where: live }),
      prisma.creditCard.findMany({ where: live }),
      prisma.category.findMany({
        where: live,
        orderBy: [{ parentId: { sort: 'asc', nulls: 'first' } }],
      }),
      prisma.payee.findMany({ where: live }),
      prisma.recurringTemplate.findMany({ where: live }),
      prisma.installmentPlan.findMany({ where: live }),
      prisma.transaction.findMany({ where: live, orderBy: [{ nature: 'asc' }, { date: 'asc' }] }),
      prisma.monthSettings.findMany({ where: { userId } }),
      prisma.assetClass.findMany({ where: live, orderBy: { sortOrder: 'asc' } }),
      prisma.targetAllocation.findMany({ where: { userId } }),
      prisma.asset.findMany({ where: live }),
      prisma.assetTrade.findMany({
        where: live,
        orderBy: [{ tradeDate: 'asc' }, { createdAt: 'asc' }],
      }),
      prisma.dividend.findMany({ where: live }),
      prisma.contributionPlan.findMany({ where: live, include: { items: true } }),
      prisma.contribution.findMany({ where: live }),
    ])
    const body: Backup = {
      app: 'orla',
      formatVersion: BACKUP_FORMAT_VERSION,
      exportedAt: new Date().toISOString(),
      data: {
        settings: settings ? plain(settings) : null,
        accounts: accounts.map(plain),
        creditCards: creditCards.map(plain),
        categories: categories.map(plain),
        payees: payees.map(plain),
        recurringTemplates: templates.map(plain),
        installmentPlans: plans.map(plain),
        transactions: transactions.map(plain),
        monthSettings: months.map(plain),
        assetClasses: assetClasses.map(plain),
        targetAllocations: targetAllocations.map(plain),
        assets: assets.map(plain),
        assetTrades: assetTrades.map(plain),
        dividends: dividends.map(plain),
        contributionPlans: contributionPlans.map(({ items: _items, ...plan }) => plain(plan)),
        contributionPlanItems: contributionPlans.flatMap((plan) => plan.items.map(plain)),
        contributions: contributions.map(plain),
      },
    }
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="orla-backup-${dateToIsoDate(new Date())}.json"`,
    )
    res.json(body)
  })

  router.post('/restore', async (req, res) => {
    const userId = userIdOf(req)
    const { mode, backup } = parse(restoreRequestSchema, req.body)
    if (backup.formatVersion > BACKUP_FORMAT_VERSION) {
      invalid('feito por uma versão mais nova do Orla')
    }
    const counts: RestoreResponse = { created: 0, updated: 0, removed: 0 }

    await prisma.$transaction(
      async (tx) => {
        const now = new Date()
        /** IDs válidos por tabela depois da restauração (para checar as referências). */
        const owned = new Map<Table, Set<string>>()

        // Ordem: quem é referenciado vem antes; dentro da tabela, pais antes dos filhos.
        for (const table of TABLE_ORDER) {
          const records = (backup.data[table] as Record<string, unknown>[]).map((record) =>
            coerce(table, record),
          )
          const ids = records.map((record) => record.id as string)
          const model = delegate(tx, table)
          const existing = await model.findMany({
            where: { id: { in: ids } },
            select: { id: true, userId: true },
          })
          const ownerOf = new Map(existing.map((row) => [row.id, row.userId]))
          const mine = await model.findMany({
            where: { userId, deletedAt: null },
            select: { id: true, userId: true },
          })
          const valid = new Set([...mine.map((row) => row.id)])

          if (mode === 'replace') {
            // Deixa igual ao backup: o que não está nele sai (soft delete).
            const result = await model.updateMany({
              where: { userId, deletedAt: null, id: { notIn: ids } },
              data: { deletedAt: now },
            })
            counts.removed += result.count
            for (const row of mine) if (!ids.includes(row.id)) valid.delete(row.id)
          }

          // Um modelo recorrente gera no máximo um lançamento por mês (índice único, inclusive
          // excluídos): se o mês já está ocupado por outro lançamento, o restaurado fica solto.
          const templateMonths = new Set<string>()
          if (table === 'transactions') {
            if (mode === 'replace') {
              await tx.transaction.updateMany({
                where: { userId, deletedAt: { not: null }, recurringTemplateId: { not: null } },
                data: { recurringTemplateId: null },
              })
            }
            const taken = await tx.transaction.findMany({
              where: { userId, recurringTemplateId: { not: null } },
              select: { id: true, recurringTemplateId: true, competenceMonth: true },
            })
            for (const row of taken) {
              templateMonths.add(
                `${row.recurringTemplateId}|${row.competenceMonth.toISOString()}|${row.id}`,
              )
            }
          }
          const monthTaken = (record: Record<string, unknown>) =>
            [...templateMonths].some((key) => {
              const [template, month, id] = key.split('|')
              return (
                template === record.recurringTemplateId &&
                month === (record.competenceMonth as Date).toISOString() &&
                id !== record.id
              )
            })

          const pending = [...records]
          // Auto-referências (subcategorias, gastos de um planejamento): pais primeiro.
          const selfRef =
            table === 'categories'
              ? 'parentId'
              : table === 'transactions'
                ? 'parentPlannedId'
                : null
          if (selfRef) pending.sort((a, b) => (a[selfRef] ? 1 : 0) - (b[selfRef] ? 1 : 0))

          for (const record of pending) {
            const id = record.id as string
            const owner = ownerOf.get(id)
            // Nunca toca em dados de outro usuário (IDs de outra conta no arquivo).
            if (owner && owner !== userId) continue
            for (const [field, target] of Object.entries(REFS[table] ?? {})) {
              const ref = record[field]
              if (typeof ref !== 'string') continue
              const targetIds = target === table ? valid : owned.get(target as Table)
              if (!targetIds?.has(ref)) {
                if (field === 'accountId' && table === 'creditCards') invalid('cartão sem conta')
                record[field] = null
              }
            }
            if (table === 'transactions' && record.recurringTemplateId && monthTaken(record)) {
              record.recurringTemplateId = null
            }
            if (owner) {
              if (mode === 'merge') {
                valid.add(id)
                continue
              }
              await model.update({ where: { id }, data: { ...record, deletedAt: null } })
              counts.updated += 1
            } else {
              await model.create({ data: { ...record, userId } })
              counts.created += 1
            }
            valid.add(id)
          }
          owned.set(table, valid)
        }

        for (const record of backup.data.monthSettings) {
          const month = new Date(String(record.competenceMonth))
          if (Number.isNaN(month.getTime())) invalid('monthSettings.competenceMonth')
          const competenceMonth = competenceMonthToDate(dateToCompetenceMonth(month))
          const cents = (value: unknown) =>
            Number.isSafeInteger(value) ? BigInt(value as number) : null
          const data = {
            savingsGoalCents: cents(record.savingsGoalCents),
            goalInvestedCents: cents(record.goalInvestedCents),
            notes: typeof record.notes === 'string' ? record.notes.slice(0, 2000) : null,
          }
          const exists = await tx.monthSettings.findUnique({
            where: { userId_competenceMonth: { userId, competenceMonth } },
          })
          if (exists && mode === 'merge') continue
          await tx.monthSettings.upsert({
            where: { userId_competenceMonth: { userId, competenceMonth } },
            create: { userId, competenceMonth, ...data },
            update: data,
          })
          if (exists) counts.updated += 1
          else counts.created += 1
        }

        await restorePlanItems(tx, userId, mode, owned, backup.data, counts)

        // Metas de alocação: só das classes que ficaram com este usuário.
        const myClasses = owned.get('assetClasses') ?? new Set<string>()
        for (const record of backup.data.targetAllocations ?? []) {
          const assetClassId = String(record.assetClassId)
          const target = String(record.targetPct)
          if (!myClasses.has(assetClassId) || !/^\d+(\.\d+)?$/.test(target)) continue
          const max =
            record.maxPct === null || record.maxPct === undefined ? null : String(record.maxPct)
          const exists = await tx.targetAllocation.findUnique({ where: { assetClassId } })
          if (exists && mode === 'merge') continue
          await tx.targetAllocation.upsert({
            where: { assetClassId },
            create: { userId, assetClassId, targetPct: target, maxPct: max },
            update: { targetPct: target, maxPct: max },
          })
        }

        const settings = backup.data.settings
        if (settings && mode === 'replace') {
          const pick = (key: string, allowed: readonly string[]) =>
            typeof settings[key] === 'string' && allowed.includes(settings[key] as string)
              ? (settings[key] as string)
              : undefined
          await tx.userSettings.updateMany({
            where: { userId },
            data: {
              defaultSavingsGoalCents: Number.isSafeInteger(settings.defaultSavingsGoalCents)
                ? BigInt(settings.defaultSavingsGoalCents as number)
                : null,
              defaultSavingsGoalPct:
                typeof settings.defaultSavingsGoalPct === 'string'
                  ? settings.defaultSavingsGoalPct
                  : null,
              cardCompetence: pick('cardCompetence', ['due_month', 'closing_month']),
              theme: pick('theme', ['light', 'dark', 'system']),
            },
          })
        }
      },
      { timeout: 180_000, maxWait: 10_000 },
    )
    res.json(counts)
  })

  return router
}
