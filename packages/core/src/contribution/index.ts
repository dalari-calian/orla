/**
 * Simulador de aporte e rebalanceamento (docs/06). Funções puras: rodam no navegador a
 * cada tecla; a API só salva o plano e efetiva as compras.
 *
 * Dinheiro em centavos inteiros; percentuais 0–100 (até 2 casas); quantidades e preços em
 * Decimal (texto). Ações/FIIs só compram cotas inteiras; renda fixa aceita o valor exato.
 */
import { type Cents } from '../money/cents.ts'
import { Decimal, type DecimalInput, toDecimal } from '../money/decimal.ts'

export const PLAN_STATUSES = ['draft', 'executed', 'discarded'] as const
export type PlanStatus = (typeof PLAN_STATUSES)[number]

export const PLAN_ITEM_MODES = ['by_value', 'by_quantity'] as const
export type PlanItemMode = (typeof PLAN_ITEM_MODES)[number]

/** RA-14: passou do valor da classe em até 5% → âmbar; mais que isso → vermelho. */
export const CLASS_OVER_TOLERANCE = 0.05
/** RA-14: peso do ativo na classe acima da meta + 5 p.p. gera alerta. */
export const ASSET_IN_CLASS_TOLERANCE_PP = 5

const cents = (value: Decimal): Cents =>
  value.toDecimalPlaces(0, Decimal.ROUND_HALF_EVEN).toNumber() + 0

const safeDecimal = (value: DecimalInput | null | undefined): Decimal => {
  try {
    const parsed = toDecimal(value ?? 0)
    return parsed.isFinite() && !parsed.isNegative() ? parsed : new Decimal(0)
  } catch {
    return new Decimal(0)
  }
}

// ─── Itens ───────────────────────────────────────────────────────────────────

export interface PlanItemInput {
  mode: PlanItemMode
  /** Por quantidade: cotas (ações/FIIs, inteiras). */
  quantity: DecimalInput
  /** Preço que vai pagar (reais). */
  unitPrice: DecimalInput
  /** Por valor: quanto quer gastar (centavos). */
  valueCents: Cents
  /** Renda fixa: aceita valor exato, sem cotas. */
  fractional: boolean
}

export interface ResolvedItem {
  quantity: Decimal
  /** Quanto o item consome do aporte. */
  spentCents: Cents
  /** Por valor, o que sobra por não fechar cota inteira (RA-10). */
  changeCents: Cents
}

/** RA-10: por quantidade → qtd × preço; por valor → cotas inteiras (floor) e troco. */
export function resolveItem(item: PlanItemInput): ResolvedItem {
  const price = safeDecimal(item.unitPrice)
  if (item.fractional) {
    const spent =
      item.mode === 'by_value'
        ? Math.max(0, item.valueCents)
        : cents(safeDecimal(item.quantity).times(price).times(100))
    return { quantity: new Decimal(1), spentCents: spent, changeCents: 0 }
  }
  if (item.mode === 'by_quantity') {
    const quantity = safeDecimal(item.quantity).floor()
    return { quantity, spentCents: cents(quantity.times(price).times(100)), changeCents: 0 }
  }
  const value = Math.max(0, item.valueCents)
  if (price.isZero()) return { quantity: new Decimal(0), spentCents: 0, changeCents: value }
  const quantity = new Decimal(value).dividedBy(100).dividedBy(price).floor()
  const spent = cents(quantity.times(price).times(100))
  return { quantity, spentCents: spent, changeCents: value - spent }
}

// ─── Divisão por classe ──────────────────────────────────────────────────────

/** Soma das divisões (RA-02). Válida quando dá 100% (tolerância de 0,01). */
export function splitTotal(split: Readonly<Record<string, DecimalInput>>): {
  totalPct: number
  valid: boolean
} {
  const total = Object.values(split).reduce<Decimal>(
    (sum, value) => sum.plus(safeDecimal(value)),
    new Decimal(0),
  )
  return {
    totalPct: total.toDecimalPlaces(2).toNumber(),
    valid: total.minus(100).abs().lessThanOrEqualTo(0.01),
  }
}

/**
 * % de um valor sobre o total, com 8 casas (a divisão pode ser digitada em R$: 400 de
 * 1.200 → "33.33333333", que volta a dar R$ 400,00).
 */
export function pctOf(amountCents: Cents, totalCents: Cents): string {
  if (totalCents <= 0) return '0'
  return new Decimal(amountCents).times(100).dividedBy(totalCents).toDecimalPlaces(8).toString()
}

/** Valor da classe = total × divisão / 100. */
export function classAllotment(totalCents: Cents, pct: DecimalInput): Cents {
  return cents(new Decimal(totalCents).times(safeDecimal(pct)).dividedBy(100))
}

/**
 * Reparte `total` em partes inteiras proporcionais aos pesos, somando exatamente `total`
 * (maior resto). Pesos todos zero → tudo zero.
 */
export function apportion(total: number, weights: readonly Decimal[]): number[] {
  const sum = weights.reduce((acc, weight) => acc.plus(weight), new Decimal(0))
  if (sum.isZero() || total <= 0) return weights.map(() => 0)
  const exact = weights.map((weight) => weight.times(total).dividedBy(sum))
  const floors = exact.map((value) => value.floor().toNumber())
  let left = total - floors.reduce((acc, value) => acc + value, 0)
  const order = exact
    .map((value, index) => ({ index, rest: value.minus(value.floor()) }))
    .sort((a, b) => b.rest.comparedTo(a.rest) || a.index - b.index)
  for (const { index } of order) {
    if (left <= 0) break
    floors[index] = (floors[index] ?? 0) + 1
    left -= 1
  }
  return floors
}

// ─── Simulação ───────────────────────────────────────────────────────────────

export interface SimClass {
  id: string
  name: string
  /** Meta de alocação (0–100) ou null. */
  targetPct: number | null
}

export interface SimAsset {
  key: string
  classId: string
  label: string
  /** Valor atual na carteira (0 para ativo novo). */
  currentCents: Cents
  /** Teto na carteira (0–100). */
  maxWeightPct: number | null
  /** Peso alvo dentro da classe (0–100). */
  targetWeightPct: number | null
}

export interface SimItem extends PlanItemInput {
  key: string
  assetKey: string
}

export type ClassTone = 'ok' | 'warn' | 'over'

export interface SimulationInput {
  totalCents: Cents
  split: Readonly<Record<string, DecimalInput>>
  classes: readonly SimClass[]
  assets: readonly SimAsset[]
  items: readonly SimItem[]
}

export interface ClassResult {
  id: string
  allottedCents: Cents
  spentCents: Cents
  /** + falta gastar; − passou. */
  remainingCents: Cents
  tone: ClassTone
  beforeCents: Cents
  afterCents: Cents
  weightBefore: number
  weightAfter: number
  /** Meta como fração (0–1). */
  target: number | null
  /** Desvio da meta depois do aporte, em p.p. */
  deviationAfterPp: number | null
}

export interface AssetResult {
  key: string
  classId: string
  beforeCents: Cents
  afterCents: Cents
  weightBefore: number
  weightAfter: number
  inClassBefore: number
  inClassAfter: number
  alerts: string[]
}

export interface SimulationResult {
  split: { totalPct: number; valid: boolean }
  spentCents: Cents
  /** "Dos R$ 1.200, faltam R$ 600" (negativo = passou do total). */
  remainingCents: Cents
  changeCents: Cents
  patrimonyBeforeCents: Cents
  patrimonyAfterCents: Cents
  items: Record<string, ResolvedItem>
  classes: ClassResult[]
  assets: AssetResult[]
}

const ratio = (part: number, whole: number) => (whole > 0 ? part / whole : 0)
const pctText = (value: number) =>
  `${(Math.round(value * 1000) / 10).toString().replace('.', ',')}%`

/** RA-14: verde (sobra ou zero), âmbar (passou até 5% da classe), vermelho (mais). */
export function classTone(allottedCents: Cents, remainingCents: Cents): ClassTone {
  if (remainingCents >= 0) return 'ok'
  const limit = Math.max(1, Math.round(allottedCents * CLASS_OVER_TOLERANCE))
  return -remainingCents <= limit ? 'warn' : 'over'
}

/** §3: tudo o que a tela mostra em tempo real. */
export function simulate(input: SimulationInput): SimulationResult {
  const resolved: Record<string, ResolvedItem> = {}
  const spentByAsset = new Map<string, Cents>()
  let spent = 0
  let change = 0
  for (const item of input.items) {
    const result = resolveItem(item)
    resolved[item.key] = result
    spent += result.spentCents
    change += result.changeCents
    spentByAsset.set(item.assetKey, (spentByAsset.get(item.assetKey) ?? 0) + result.spentCents)
  }

  const patrimonyBefore = input.assets.reduce((sum, asset) => sum + asset.currentCents, 0)
  const patrimonyAfter = patrimonyBefore + spent

  const classBefore = new Map<string, Cents>()
  const classAfter = new Map<string, Cents>()
  const classSpent = new Map<string, Cents>()
  for (const asset of input.assets) {
    const add = spentByAsset.get(asset.key) ?? 0
    classBefore.set(asset.classId, (classBefore.get(asset.classId) ?? 0) + asset.currentCents)
    classAfter.set(asset.classId, (classAfter.get(asset.classId) ?? 0) + asset.currentCents + add)
    classSpent.set(asset.classId, (classSpent.get(asset.classId) ?? 0) + add)
  }

  const split = splitTotal(input.split)
  // Divisão válida: os valores por classe somam exatamente o total (maior resto).
  const allotments = split.valid
    ? apportion(
        input.totalCents,
        input.classes.map((assetClass) => safeDecimal(input.split[assetClass.id] ?? 0)),
      )
    : input.classes.map((assetClass) =>
        classAllotment(input.totalCents, input.split[assetClass.id] ?? 0),
      )
  const classes: ClassResult[] = input.classes.map((assetClass, index) => {
    const allotted = allotments[index] ?? 0
    const classSpentCents = classSpent.get(assetClass.id) ?? 0
    const remaining = allotted - classSpentCents
    const before = classBefore.get(assetClass.id) ?? 0
    const after = classAfter.get(assetClass.id) ?? 0
    const target = assetClass.targetPct === null ? null : assetClass.targetPct / 100
    const weightAfter = ratio(after, patrimonyAfter)
    return {
      id: assetClass.id,
      allottedCents: allotted,
      spentCents: classSpentCents,
      remainingCents: remaining,
      tone: classTone(allotted, remaining),
      beforeCents: before,
      afterCents: after,
      weightBefore: ratio(before, patrimonyBefore),
      weightAfter,
      target,
      deviationAfterPp: target === null ? null : (weightAfter - target) * 100,
    }
  })

  const assets: AssetResult[] = input.assets.map((asset) => {
    const add = spentByAsset.get(asset.key) ?? 0
    const after = asset.currentCents + add
    const weightAfter = ratio(after, patrimonyAfter)
    const inClassAfter = ratio(after, classAfter.get(asset.classId) ?? 0)
    const alerts: string[] = []
    if (add > 0 && asset.maxWeightPct !== null && weightAfter * 100 > asset.maxWeightPct) {
      alerts.push(
        `${asset.label} ficaria muito predominante: ${pctText(weightAfter)} > teto ${pctText(asset.maxWeightPct / 100)}`,
      )
    }
    if (
      add > 0 &&
      asset.targetWeightPct !== null &&
      inClassAfter * 100 > asset.targetWeightPct + ASSET_IN_CLASS_TOLERANCE_PP
    ) {
      alerts.push(
        `${asset.label} passaria do peso na classe: ${pctText(inClassAfter)} > meta ${pctText(asset.targetWeightPct / 100)}`,
      )
    }
    return {
      key: asset.key,
      classId: asset.classId,
      beforeCents: asset.currentCents,
      afterCents: after,
      weightBefore: ratio(asset.currentCents, patrimonyBefore),
      weightAfter,
      inClassBefore: ratio(asset.currentCents, classBefore.get(asset.classId) ?? 0),
      inClassAfter,
      alerts,
    }
  })

  return {
    split,
    spentCents: spent,
    remainingCents: input.totalCents - spent,
    changeCents: change,
    patrimonyBeforeCents: patrimonyBefore,
    patrimonyAfterCents: patrimonyAfter,
    items: resolved,
    classes,
    assets,
  }
}

// ─── Rebalanceamento (RA-20) ─────────────────────────────────────────────────

/**
 * Divisão que aproxima a carteira da meta sem vender: alvo = (patrimônio + aporte) × meta;
 * reparte o aporte pelos déficits; se sobrar, o excedente vai pela meta. Classe acima da
 * meta recebe 0. Devolve o valor de cada classe (soma = total) e o % (soma = 100).
 */
export function suggestSplit(
  totalCents: Cents,
  classes: readonly SimClass[],
  assets: readonly SimAsset[],
): { amounts: Record<string, Cents>; split: Record<string, string> } {
  const current = new Map<string, Cents>()
  for (const asset of assets) {
    current.set(asset.classId, (current.get(asset.classId) ?? 0) + asset.currentCents)
  }
  const patrimony = [...current.values()].reduce((sum, value) => sum + value, 0)
  const targets = classes.map((item) => safeDecimal(item.targetPct ?? 0))
  const targetSum = targets.reduce((sum, value) => sum.plus(value), new Decimal(0))
  const deficits = classes.map((item, index) => {
    const goal = new Decimal(patrimony + totalCents)
      .times(targets[index] ?? 0)
      .dividedBy(targetSum.isZero() ? 1 : targetSum)
    return Decimal.max(0, goal.minus(current.get(item.id) ?? 0))
  })
  const deficitSum = deficits.reduce((sum, value) => sum.plus(value), new Decimal(0))
  let amounts: number[]
  if (deficitSum.greaterThanOrEqualTo(totalCents)) {
    amounts = apportion(totalCents, deficits)
  } else {
    const base = deficits.map((value) => value.floor().toNumber())
    const rest = totalCents - base.reduce((sum, value) => sum + value, 0)
    const extra = apportion(rest, targetSum.isZero() ? classes.map(() => new Decimal(1)) : targets)
    amounts = base.map((value, index) => value + (extra[index] ?? 0))
  }
  const basisPoints = apportion(
    totalCents > 0 ? 10_000 : 0,
    amounts.map((value) => new Decimal(value)),
  )
  return {
    amounts: Object.fromEntries(classes.map((item, index) => [item.id, amounts[index] ?? 0])),
    split: Object.fromEntries(
      classes.map((item, index) => [
        item.id,
        new Decimal(basisPoints[index] ?? 0).dividedBy(100).toString(),
      ]),
    ),
  }
}

export interface SuggestAsset extends SimAsset {
  /** Preço que vai pagar (reais); null/0 = sem preço, não entra na sugestão (bolsa). */
  unitPrice: DecimalInput | null
  fractional: boolean
}

export interface SuggestedItem {
  assetKey: string
  mode: PlanItemMode
  quantity: string
  unitPrice: string
  valueCents: Cents
}

/**
 * RA-20 passos 4–5, dentro de uma classe: reparte `amountCents` pelos déficits de cada ativo
 * em relação ao peso alvo na classe (sem pesos: igual entre os ativos, ou seja, os de menor
 * peso recebem mais). Bolsa vira cotas inteiras; o troco compra cotas extras de quem ainda
 * está mais longe do alvo, enquanto couber. Renda fixa recebe valor exato.
 */
export function suggestClassItems(
  amountCents: Cents,
  assets: readonly SuggestAsset[],
): SuggestedItem[] {
  const usable = assets.filter(
    (asset) => asset.fractional || safeDecimal(asset.unitPrice).greaterThan(0),
  )
  if (amountCents <= 0 || usable.length === 0) return []
  const classAfter = usable.reduce((sum, asset) => sum + asset.currentCents, 0) + amountCents
  const anyWeights = usable.some((asset) => asset.targetWeightPct !== null)
  const weights = usable.map((asset) =>
    anyWeights ? safeDecimal(asset.targetWeightPct ?? 0) : new Decimal(1),
  )
  const weightSum = weights.reduce((sum, value) => sum.plus(value), new Decimal(0))
  const goals = usable.map((_, index) =>
    weightSum.isZero()
      ? new Decimal(0)
      : new Decimal(classAfter).times(weights[index] ?? 0).dividedBy(weightSum),
  )
  const deficits = usable.map((asset, index) =>
    Decimal.max(0, (goals[index] ?? new Decimal(0)).minus(asset.currentCents)),
  )
  const allocation = apportion(
    amountCents,
    deficits.some((value) => value.greaterThan(0)) ? deficits : weights,
  )

  const quantities = usable.map(() => new Decimal(0))
  const spent = usable.map(() => 0)
  usable.forEach((asset, index) => {
    const share = allocation[index] ?? 0
    if (asset.fractional) {
      spent[index] = share
      return
    }
    const resolved = resolveItem({
      mode: 'by_value',
      quantity: 0,
      unitPrice: asset.unitPrice ?? 0,
      valueCents: share,
      fractional: false,
    })
    quantities[index] = resolved.quantity
    spent[index] = resolved.spentCents
  })

  let left = amountCents - spent.reduce((sum, value) => sum + value, 0)
  const priceCents = usable.map((asset) =>
    asset.fractional ? 0 : cents(safeDecimal(asset.unitPrice).times(100)),
  )
  // Troco: uma cota por vez para quem está mais longe do alvo e cabe no que sobrou.
  for (;;) {
    let best = -1
    let bestGap = new Decimal(-Infinity)
    usable.forEach((asset, index) => {
      if (asset.fractional) return
      const price = priceCents[index] ?? 0
      if (price <= 0 || price > left) return
      const gap = (goals[index] ?? new Decimal(0)).minus(asset.currentCents + (spent[index] ?? 0))
      if (gap.greaterThan(bestGap)) {
        bestGap = gap
        best = index
      }
    })
    if (best < 0) break
    quantities[best] = (quantities[best] ?? new Decimal(0)).plus(1)
    const added = cents(
      (quantities[best] ?? new Decimal(0)).times(safeDecimal(usable[best]?.unitPrice)).times(100),
    )
    left -= added - (spent[best] ?? 0)
    spent[best] = added
  }
  // Ainda sobrou e há renda fixa na classe: vai para ela (valor exato).
  const fixedIndex = usable.findIndex((asset) => asset.fractional)
  if (left > 0 && fixedIndex >= 0) {
    spent[fixedIndex] = (spent[fixedIndex] ?? 0) + left
    left = 0
  }

  return usable.flatMap((asset, index) => {
    const value = spent[index] ?? 0
    if (value <= 0) return []
    return [
      asset.fractional
        ? {
            assetKey: asset.key,
            mode: 'by_value' as const,
            quantity: '1',
            unitPrice: '0',
            valueCents: value,
          }
        : {
            assetKey: asset.key,
            mode: 'by_quantity' as const,
            quantity: (quantities[index] ?? new Decimal(0)).toString(),
            unitPrice: safeDecimal(asset.unitPrice).toString(),
            valueCents: value,
          },
    ]
  })
}

/** Carrinho completo sugerido: divisão por classe + itens de cada classe (RA-21). */
export function suggestPlan(
  totalCents: Cents,
  classes: readonly SimClass[],
  assets: readonly SuggestAsset[],
): { split: Record<string, string>; items: SuggestedItem[] } {
  const { amounts, split } = suggestSplit(totalCents, classes, assets)
  const items = classes.flatMap((assetClass) =>
    suggestClassItems(
      amounts[assetClass.id] ?? 0,
      assets.filter((asset) => asset.classId === assetClass.id),
    ),
  )
  return { split, items }
}
