/**
 * Importação da carteira (Fase 5, docs/08): metas por classe, ativos, operações e proventos.
 * Ativos são resolvidos pelo ticker (+ corretora) ou pelo nome (renda fixa); os que não existem
 * são criados no commit. Ao final, a posição de cada ativo tocado é recalculada (venda maior
 * que a posição desfaz tudo — RI-05).
 */
import { randomUUID } from 'node:crypto'
import {
  computePosition,
  isManualQuoteKind,
  isoDateToDate,
  normalizeTicker,
  PortfolioError,
  refKey,
  tradeTotalCents,
  type AssetClassKind,
} from '@orla/core'
import type { ImportAssetRef, ImportDraftInput } from '@orla/contracts'
import type { Prisma } from '@orla/db'
import { centsToNumber } from './db.ts'
import { validationError } from './errors.ts'
import type { Db } from './finance.ts'
import { loadClasses, tradeInput } from './portfolio.ts'

type PortfolioDraft = Extract<
  ImportDraftInput,
  { kind: 'classTarget' | 'asset' | 'assetTrade' | 'dividend' | 'balance' | 'contribution' }
>

export const isPortfolioDraft = (draft: ImportDraftInput): draft is PortfolioDraft =>
  draft.kind === 'classTarget' ||
  draft.kind === 'asset' ||
  draft.kind === 'assetTrade' ||
  draft.kind === 'dividend' ||
  draft.kind === 'balance' ||
  draft.kind === 'contribution'

interface ClassLite {
  id: string
  name: string
  kind: string
}
interface AssetLite {
  id: string
  ticker: string | null
  name: string
  accountId: string | null
  assetClassId: string
}

export interface PortfolioContext {
  classes: ClassLite[]
  assets: AssetLite[]
  accounts: { id: string; name: string }[]
  /** asset|data|tipo|qtd|preço */
  trades: Set<string>
  /** asset|data|valor */
  dividends: Set<string>
  /** Meses (AAAA-MM) que já têm balanço. */
  balanceMonths: Set<string>
  /** data|valor dos aportes */
  contributions: Set<string>
}

export async function portfolioContext(db: Db, userId: string): Promise<PortfolioContext> {
  const [classes, assets, accounts, trades, dividends, balances, contributions] = await Promise.all(
    [
      loadClasses(db, userId),
      db.asset.findMany({
        where: { userId, deletedAt: null },
        select: { id: true, ticker: true, name: true, accountId: true, assetClassId: true },
      }),
      db.account.findMany({ where: { userId, deletedAt: null }, select: { id: true, name: true } }),
      db.assetTrade.findMany({
        where: { userId, deletedAt: null },
        select: { assetId: true, tradeDate: true, kind: true, quantity: true, unitPrice: true },
      }),
      db.dividend.findMany({
        where: { userId, deletedAt: null },
        select: { assetId: true, payDate: true, amountCents: true },
      }),
      db.balance.findMany({
        where: { userId, deletedAt: null },
        select: { competenceMonth: true },
      }),
      db.contribution.findMany({
        where: { userId, deletedAt: null },
        select: { date: true, amountCents: true },
      }),
    ],
  )
  return {
    classes: classes.map((item) => ({ id: item.id, name: item.name, kind: item.kind })),
    assets,
    accounts,
    trades: new Set(
      trades.map((item) =>
        tradeKey(
          item.assetId,
          item.tradeDate.toISOString().slice(0, 10),
          item.kind,
          item.quantity.toString(),
          item.unitPrice.toString(),
        ),
      ),
    ),
    dividends: new Set(
      dividends.map(
        (item) =>
          `${item.assetId}|${item.payDate.toISOString().slice(0, 10)}|${centsToNumber(item.amountCents)}`,
      ),
    ),
    balanceMonths: new Set(balances.map((item) => item.competenceMonth.toISOString().slice(0, 7))),
    contributions: new Set(
      contributions.map(
        (item) => `${item.date.toISOString().slice(0, 10)}|${centsToNumber(item.amountCents)}`,
      ),
    ),
  }
}

const tradeKey = (assetId: string, date: string, kind: string, quantity: string, price: string) =>
  `${assetId}|${date}|${kind}|${Number(quantity)}|${Number(price)}`

function resolveClass(
  ctx: PortfolioContext,
  ref: { classKind: string | null; className: string | null },
): ClassLite | undefined {
  if (ref.className) {
    const byName = ctx.classes.find((item) => refKey(item.name) === refKey(ref.className as string))
    if (byName) return byName
  }
  return ref.classKind ? ctx.classes.find((item) => item.kind === ref.classKind) : undefined
}

function accountIdOf(ctx: PortfolioContext, name: string | null): string | null {
  if (!name) return null
  const key = refKey(name)
  return (
    ctx.accounts.find((item) => refKey(item.name) === key || refKey(item.name).startsWith(key))
      ?.id ?? null
  )
}

/** Ativo existente para a referência (ticker + corretora, ou nome da renda fixa). */
export function findAsset(ctx: PortfolioContext, ref: ImportAssetRef): AssetLite | undefined {
  if (ref.ticker) {
    const ticker = normalizeTicker(ref.ticker)
    const candidates = ctx.assets.filter((item) => item.ticker === ticker)
    if (candidates.length <= 1) return candidates[0]
    const accountId = accountIdOf(ctx, ref.accountName)
    return candidates.find((item) => item.accountId === accountId) ?? candidates[0]
  }
  return ctx.assets.find((item) => !item.ticker && refKey(item.name) === refKey(ref.name))
}

const assetLabel = (ref: ImportAssetRef) => (ref.ticker ? normalizeTicker(ref.ticker) : ref.name)

/** Conferência de um rascunho da carteira (pré-visualização). */
export function checkPortfolioDraft(
  draft: PortfolioDraft,
  ctx: PortfolioContext,
): { errors: string[]; messages: string[]; creates: string[]; duplicate: boolean } {
  const errors: string[] = []
  const messages: string[] = []
  const creates: string[] = []
  let duplicate = false

  const refCheck = (ref: ImportAssetRef) => {
    const asset = findAsset(ctx, ref)
    if (asset) return asset
    const cls = resolveClass(ctx, ref)
    if (!cls)
      errors.push(
        `Classe de ${assetLabel(ref)} não encontrada (${ref.className ?? ref.classKind ?? 'sem classe'})`,
      )
    else creates.push(`Ativo: ${assetLabel(ref)}`)
    if (ref.accountName && !accountIdOf(ctx, ref.accountName))
      creates.push(`Conta: ${ref.accountName}`)
    return undefined
  }

  if (draft.kind === 'classTarget') {
    const cls = resolveClass(ctx, draft)
    if (!cls) errors.push(`Classe ${draft.className ?? draft.classKind ?? ''} não encontrada`)
    else messages.push(`Meta de ${cls.name}: ${draft.targetPct.replace('.', ',')}%`)
  } else if (draft.kind === 'asset') {
    const existing = refCheck(draft)
    if (existing) messages.push('Já cadastrado: atualiza o preço/saldo do último balanço')
  } else if (draft.kind === 'assetTrade') {
    const asset = refCheck(draft.asset)
    const split = draft.tradeKind === 'split' || draft.tradeKind === 'reverse_split'
    if (!split && Number(draft.quantity) <= 0) errors.push('Quantidade precisa ser maior que zero')
    if (
      asset &&
      ctx.trades.has(
        tradeKey(asset.id, draft.date, draft.tradeKind, draft.quantity, draft.unitPrice),
      )
    ) {
      duplicate = true
      messages.push(
        `Provável duplicado: ${assetLabel(draft.asset)} já tem essa operação em ${draft.date.split('-').reverse().join('/')}`,
      )
    }
  } else if (draft.kind === 'balance') {
    for (const item of draft.items) refCheck(item.asset)
    const total = draft.items.reduce((sum, item) => sum + item.valueCents, 0)
    messages.push(
      `Balanço de ${draft.referenceDate.split('-').reverse().join('/')}: ${draft.items.length} ativos`,
    )
    if (ctx.balanceMonths.has(draft.competenceMonth)) {
      duplicate = true
      messages.push('Já existe um balanço deste mês: fica o que já está no Orla')
    }
    if (total <= 0) errors.push('Balanço sem valor')
  } else if (draft.kind === 'contribution') {
    if (ctx.contributions.has(`${draft.date}|${draft.amountCents}`)) {
      duplicate = true
      messages.push('Provável duplicado: aporte igual já registrado')
    }
  } else {
    const asset = refCheck(draft.asset)
    if (asset && ctx.dividends.has(`${asset.id}|${draft.payDate}|${draft.amountCents}`)) {
      duplicate = true
      messages.push(
        `Provável duplicado: provento igual de ${assetLabel(draft.asset)} já registrado`,
      )
    }
  }
  return { errors, messages, creates, duplicate }
}

/** Grava os rascunhos da carteira dentro da transação do commit. */
export function portfolioWriter(
  tx: Prisma.TransactionClient,
  userId: string,
  ctx: PortfolioContext,
  options: {
    createMissing: boolean
    ensureAccount: (name: string | null) => Promise<string | null>
    created: { type: string; id: string; label: string }[]
  },
) {
  const touched = new Set<string>()

  async function assetFor(
    ref: ImportAssetRef,
    extra?: Extract<PortfolioDraft, { kind: 'asset' }>,
  ): Promise<AssetLite | null> {
    const found = findAsset(ctx, ref)
    if (found) return found
    if (!options.createMissing && !extra) return null
    const cls = resolveClass(ctx, ref)
    if (!cls) return null
    const accountId = ref.accountName ? await options.ensureAccount(ref.accountName) : null
    const ticker = ref.ticker ? normalizeTicker(ref.ticker) : null
    const manual = !ticker || isManualQuoteKind(cls.kind as AssetClassKind)
    const row = await tx.asset.create({
      data: {
        id: randomUUID(),
        userId,
        assetClassId: cls.id,
        ticker,
        name: ref.name.slice(0, 80),
        accountId,
        quoteMode: manual ? 'manual' : 'auto',
      },
      select: { id: true, ticker: true, name: true, accountId: true, assetClassId: true },
    })
    ctx.assets.push(row)
    options.created.push({ type: 'asset', id: row.id, label: `Ativo: ${ticker ?? ref.name}` })
    return row
  }

  /** Grava um rascunho; devolve a entidade para o histórico (desfazer). */
  async function apply(
    draft: PortfolioDraft,
  ): Promise<{ type: string; id: string | null; previous?: unknown } | null> {
    if (draft.kind === 'classTarget') {
      const cls = resolveClass(ctx, draft)
      if (!cls) return null
      const previous = await tx.targetAllocation.findUnique({ where: { assetClassId: cls.id } })
      await tx.targetAllocation.upsert({
        where: { assetClassId: cls.id },
        create: { userId, assetClassId: cls.id, targetPct: draft.targetPct },
        update: { targetPct: draft.targetPct },
      })
      return {
        type: 'target_allocation',
        id: cls.id,
        previous: previous
          ? {
              targetPct: previous.targetPct.toString(),
              maxPct: previous.maxPct?.toString() ?? null,
            }
          : null,
      }
    }
    if (draft.kind === 'asset') {
      const asset = await assetFor(draft, draft)
      if (!asset) return null
      const data: Prisma.AssetUpdateInput = {}
      if (draft.manualPrice) {
        data.manualPrice = draft.manualPrice
        data.manualPriceAt = draft.manualPriceAt ? isoDateToDate(draft.manualPriceAt) : new Date()
      }
      if (draft.manualValueCents !== null) {
        data.manualValueCents = BigInt(draft.manualValueCents)
        data.manualValueAt = draft.manualValueAt ? isoDateToDate(draft.manualValueAt) : new Date()
      }
      if (draft.fixedIncome) data.fixedIncomeInfo = { ...draft.fixedIncome, liquidity: null }
      if (draft.targetWeightPct) data.targetWeightPct = draft.targetWeightPct
      if (draft.maxWeightPct) data.maxWeightPct = draft.maxWeightPct
      if (Object.keys(data).length > 0) await tx.asset.update({ where: { id: asset.id }, data })
      return null // o ativo criado já entra em `created`; atualizar preço não precisa desfazer
    }
    if (draft.kind === 'contribution') {
      const id = randomUUID()
      await tx.contribution.create({
        data: {
          id,
          userId,
          date: isoDateToDate(draft.date),
          competenceMonth: isoDateToDate(`${draft.date.slice(0, 7)}-01`),
          amountCents: BigInt(draft.amountCents),
          notes: draft.notes,
        },
      })
      ctx.contributions.add(`${draft.date}|${draft.amountCents}`)
      return { type: 'contribution', id }
    }
    if (draft.kind === 'balance') {
      if (ctx.balanceMonths.has(draft.competenceMonth)) return null
      const items: Prisma.BalanceItemCreateManyBalanceInput[] = []
      for (const [index, item] of draft.items.entries()) {
        const asset = await assetFor(item.asset)
        if (!asset) continue
        items.push({
          kind: 'asset',
          assetId: asset.id,
          assetClassId: asset.assetClassId,
          accountId: asset.accountId,
          label: asset.ticker ?? asset.name,
          ticker: asset.ticker,
          quantity: item.quantity,
          price: item.price,
          valueCents: BigInt(item.valueCents),
          sortOrder: index,
        })
      }
      if (items.length === 0) return null
      const id = randomUUID()
      await tx.balance.create({
        data: {
          id,
          userId,
          competenceMonth: isoDateToDate(`${draft.competenceMonth}-01`),
          referenceDate: isoDateToDate(draft.referenceDate),
          totalCents: items.reduce((sum, item) => sum + BigInt(item.valueCents), 0n),
          // Fechado, com aporte e proventos calculados ao vivo (null = não congelado).
          status: 'closed',
          closedAt: new Date(),
          source: 'import',
          items: { createMany: { data: items } },
        },
      })
      ctx.balanceMonths.add(draft.competenceMonth)
      return { type: 'balance', id }
    }
    const asset = await assetFor(draft.asset)
    if (!asset) return null
    touched.add(asset.id)
    if (draft.kind === 'assetTrade') {
      const id = randomUUID()
      const total =
        draft.totalCents ??
        (draft.tradeKind === 'sell'
          ? Math.max(0, tradeTotalCents(draft.quantity, draft.unitPrice, 0) - draft.feesCents)
          : tradeTotalCents(draft.quantity, draft.unitPrice, draft.feesCents))
      await tx.assetTrade.create({
        data: {
          id,
          userId,
          assetId: asset.id,
          kind: draft.tradeKind,
          tradeDate: isoDateToDate(draft.date),
          quantity: draft.quantity,
          unitPrice: draft.unitPrice,
          feesCents: BigInt(draft.feesCents),
          totalCents: BigInt(total),
          splitRatio: draft.splitRatio,
          notes: draft.notes,
          source: 'import',
        },
      })
      return { type: 'asset_trade', id }
    }
    const id = randomUUID()
    await tx.dividend.create({
      data: {
        id,
        userId,
        assetId: asset.id,
        kind: draft.dividendKind,
        payDate: isoDateToDate(draft.payDate),
        amountCents: BigInt(draft.amountCents),
        source: 'import',
      },
    })
    return { type: 'dividend', id }
  }

  /** RI-05: recalcula a posição dos ativos tocados; venda maior que a posição desfaz o commit. */
  async function finish() {
    for (const assetId of touched) {
      const trades = await tx.assetTrade.findMany({
        where: { assetId, deletedAt: null },
        orderBy: [{ tradeDate: 'asc' }, { createdAt: 'asc' }],
      })
      try {
        computePosition(trades.map(tradeInput))
      } catch (error) {
        if (error instanceof PortfolioError) {
          const asset = ctx.assets.find((item) => item.id === assetId)
          throw validationError(
            `${asset?.ticker ?? asset?.name ?? 'Ativo'}: ${error.message}. Nada foi importado.`,
          )
        }
        throw error
      }
    }
  }

  return { apply, finish }
}

/** Desfaz o que a importação criou na carteira (soft delete; metas voltam ao valor anterior). */
export async function undoPortfolio(
  tx: Prisma.TransactionClient,
  userId: string,
  rows: { entityType: string | null; entityId: string | null; raw: unknown }[],
  now: Date,
) {
  const ids = (type: string) =>
    rows
      .filter((row) => row.entityType === type && row.entityId)
      .map((row) => row.entityId as string)
  await tx.assetTrade.updateMany({
    where: { userId, id: { in: ids('asset_trade') } },
    data: { deletedAt: now },
  })
  await tx.dividend.updateMany({
    where: { userId, id: { in: ids('dividend') } },
    data: { deletedAt: now },
  })
  await tx.balance.updateMany({
    where: { userId, id: { in: ids('balance') } },
    data: { deletedAt: now },
  })
  await tx.contribution.updateMany({
    where: { userId, id: { in: ids('contribution') } },
    data: { deletedAt: now },
  })
  for (const row of rows.filter(
    (item) => item.entityType === 'target_allocation' && item.entityId,
  )) {
    const previous = (row.raw as { _previous?: string } | null)?._previous
    const assetClassId = row.entityId as string
    if (!previous || previous === 'none') {
      await tx.targetAllocation.deleteMany({ where: { userId, assetClassId } })
    } else {
      const value = JSON.parse(previous) as { targetPct: string; maxPct: string | null }
      await tx.targetAllocation.updateMany({
        where: { userId, assetClassId },
        data: { targetPct: value.targetPct, maxPct: value.maxPct },
      })
    }
  }
  // Ativos criados pela importação saem se não sobrou operação nem provento neles.
  for (const id of ids('asset')) {
    const used =
      (await tx.assetTrade.count({ where: { assetId: id, deletedAt: null } })) +
      (await tx.dividend.count({ where: { assetId: id, deletedAt: null } }))
    if (used === 0) await tx.asset.updateMany({ where: { id, userId }, data: { deletedAt: now } })
  }
}
