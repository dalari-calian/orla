import {
  type PlanItemMode,
  type SimAsset,
  type SimClass,
  type SimItem,
  type SuggestAsset,
} from '@orla/core'
import type {
  AssetClass,
  ContributionPlan,
  NewPlanAsset,
  PortfolioResponse,
  SaveContributionPlanRequest,
} from '@orla/contracts'

/** Item do carrinho como a tela edita (o plano salvo vira isso e volta). */
export interface DraftItem {
  /** Chave local, estável enquanto a tela está aberta. */
  key: string
  /** Id no servidor (muda a cada salvamento; null = ainda não salvo). */
  id: string | null
  assetId: string | null
  newAsset: NewPlanAsset | null
  mode: PlanItemMode
  quantity: string
  unitPrice: string
  valueCents: number
  /** Já comprado (efetivação parcial): só leitura. */
  executed: boolean
}

export interface Draft {
  name: string
  totalCents: number
  split: Record<string, string>
  items: DraftItem[]
}

/** Ativo da simulação: os da carteira e os novos do carrinho. */
export interface PlanAsset {
  key: string
  assetId: string | null
  classId: string
  label: string
  name: string
  currentCents: number
  price: string | null
  fractional: boolean
  maxWeightPct: number | null
  targetWeightPct: number | null
  isNew: boolean
}

export const assetKeyOf = (item: Pick<DraftItem, 'assetId' | 'newAsset'>) =>
  item.assetId ?? `new:${(item.newAsset?.ticker ?? item.newAsset?.name ?? '').toUpperCase()}`

let counter = 0
export const newKey = () => `k${Date.now().toString(36)}${(counter++).toString(36)}`

const pctNumber = (value: string | null) => (value === null ? null : Number(value))

/** Divisão padrão: as metas de alocação (RA-02); sem metas, igual entre as classes. */
export function defaultSplit(classes: readonly AssetClass[]): Record<string, string> {
  const withTarget = classes.filter((item) => item.targetPct !== null && Number(item.targetPct) > 0)
  if (withTarget.length > 0) {
    return Object.fromEntries(classes.map((item) => [item.id, item.targetPct ?? '0']))
  }
  if (classes.length === 0) return {}
  const base = Math.floor(10000 / classes.length)
  return Object.fromEntries(
    classes.map((item, index) => [
      item.id,
      String((index === 0 ? 10000 - base * (classes.length - 1) : base) / 100),
    ]),
  )
}

export function draftFromPlan(plan: ContributionPlan): Draft {
  return {
    name: plan.name,
    totalCents: plan.totalCents,
    split: { ...plan.classSplit },
    items: plan.items.map((item) => ({
      key: item.id,
      id: item.id,
      assetId: item.assetId,
      newAsset: item.newAsset,
      mode: item.mode,
      quantity: item.quantity,
      unitPrice: item.unitPrice,
      valueCents: item.valueCents,
      executed: item.executedAt !== null,
    })),
  }
}

/**
 * Depois de salvar, o servidor recria os itens não comprados com ids novos, na mesma ordem.
 * Liga cada item local ao id novo; se o carrinho mudou no meio, fica sem id até o próximo.
 */
export function assignServerIds(draft: Draft, saved: ContributionPlan): Draft {
  const pendingSaved = saved.items
    .filter((item) => item.executedAt === null)
    .sort((a, b) => a.sortOrder - b.sortOrder)
  const pending = draft.items.filter((item) => !item.executed)
  const same = pending.length === pendingSaved.length
  let index = 0
  return {
    ...draft,
    items: draft.items.map((item) => {
      if (item.executed) return item
      const match = same ? pendingSaved[index++] : undefined
      return { ...item, id: match?.id ?? null }
    }),
  }
}

/** O que vai para o PUT: só os itens ainda não comprados. */
export function saveRequest(
  plan: ContributionPlan,
  draft: Draft,
  extra: Partial<SaveContributionPlanRequest> = {},
): SaveContributionPlanRequest {
  return {
    competenceMonth: plan.competenceMonth,
    name: draft.name.trim() || plan.name,
    totalCents: draft.totalCents,
    classSplit: Object.fromEntries(
      Object.entries(draft.split).map(([id, value]) => [id, value.trim() || '0']),
    ),
    items: draft.items
      .filter((item) => !item.executed)
      .map((item) => ({
        assetId: item.assetId,
        newAsset: item.newAsset,
        mode: item.mode,
        quantity: item.quantity || '0',
        unitPrice: item.unitPrice || '0',
        valueCents: item.valueCents,
      })),
    ...extra,
  }
}

/** Ativos da carteira + os novos do carrinho, no formato do simulador. */
export function planAssets(portfolio: PortfolioResponse, items: readonly DraftItem[]): PlanAsset[] {
  const kindOf = new Map(
    portfolio.classes.map((item) => [item.assetClass.id, item.assetClass.kind]),
  )
  const list: PlanAsset[] = portfolio.positions
    .filter((position) => !position.asset.isArchived)
    .map((position) => ({
      key: position.asset.id,
      assetId: position.asset.id,
      classId: position.asset.assetClassId,
      label: position.asset.ticker ?? position.asset.name,
      name: position.asset.name,
      currentCents: position.valueCents,
      price: position.price,
      fractional:
        kindOf.get(position.asset.assetClassId) === 'fixed_income' || !position.asset.ticker,
      maxWeightPct: pctNumber(position.asset.maxWeightPct),
      targetWeightPct: pctNumber(position.asset.targetWeightPct),
      isNew: false,
    }))
  const known = new Set(list.map((item) => item.key))
  for (const item of items) {
    const key = assetKeyOf(item)
    if (known.has(key) || !item.newAsset) continue
    known.add(key)
    list.push({
      key,
      assetId: null,
      classId: item.newAsset.assetClassId,
      label: item.newAsset.ticker ?? item.newAsset.name,
      name: item.newAsset.name,
      currentCents: 0,
      price: item.unitPrice !== '0' ? item.unitPrice : null,
      fractional:
        kindOf.get(item.newAsset.assetClassId) === 'fixed_income' || !item.newAsset.ticker,
      maxWeightPct: null,
      targetWeightPct: null,
      isNew: true,
    })
  }
  return list
}

export function simClasses(portfolio: PortfolioResponse): SimClass[] {
  return portfolio.classes.map((item) => ({
    id: item.assetClass.id,
    name: item.assetClass.name,
    targetPct: pctNumber(item.assetClass.targetPct),
  }))
}

export const toSimAsset = (asset: PlanAsset): SimAsset => ({
  key: asset.key,
  classId: asset.classId,
  label: asset.label,
  currentCents: asset.currentCents,
  maxWeightPct: asset.maxWeightPct,
  targetWeightPct: asset.targetWeightPct,
})

export const toSuggestAsset = (asset: PlanAsset): SuggestAsset => ({
  ...toSimAsset(asset),
  unitPrice: asset.price,
  fractional: asset.fractional,
})

export function simItems(items: readonly DraftItem[], assets: readonly PlanAsset[]): SimItem[] {
  const byKey = new Map(assets.map((asset) => [asset.key, asset]))
  return items.map((item) => ({
    key: item.key,
    assetKey: assetKeyOf(item),
    mode: item.mode,
    quantity: item.quantity || '0',
    unitPrice: item.unitPrice || '0',
    valueCents: item.valueCents,
    fractional: byKey.get(assetKeyOf(item))?.fractional ?? false,
  }))
}

/** Texto decimal digitado ("9,73") → "9.73"; inválido → "0". */
export function decimalInput(value: string): string {
  const text = value.replace(/\s/g, '').replace(/^R\$/i, '')
  const normalized = text.includes(',') ? text.replace(/\./g, '').replace(',', '.') : text
  return /^\d+(\.\d+)?$/.test(normalized) ? normalized : '0'
}

/** "9.73" → "9,73" para exibir em campo. */
export const toInputText = (value: string) => (value === '0' ? '' : value.replace('.', ','))
