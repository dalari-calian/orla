/**
 * Posição e preço médio pelo método da Receita Federal (docs/05 §4).
 * Quantidades e preços em Decimal; dinheiro em centavos (arredonda só no final, half-even).
 */
import { type Cents } from '../money/cents.ts'
import { Decimal, type DecimalInput, toDecimal } from '../money/decimal.ts'

export class PortfolioError extends Error {
  override name = 'PortfolioError'
}

export const TRADE_KINDS = [
  'buy',
  'sell',
  'bonus',
  'split',
  'reverse_split',
  'subscription',
  'fixed_income_deposit',
  'fixed_income_withdrawal',
  'position_set',
] as const
export type TradeKind = (typeof TRADE_KINDS)[number]

export interface TradeInput {
  kind: TradeKind
  /** `AAAA-MM-DD`. */
  date: string
  quantity: DecimalInput
  unitPrice: DecimalInput
  feesCents: Cents
  /** Compra: qtd × preço + taxas (o da nota). Bonificação: custo atribuído. Renda fixa: valor. */
  totalCents: Cents
  /** Desdobramento: ações novas por antiga (1:10 → 10). Grupamento: antigas por nova (10:1 → 10). */
  splitRatio?: DecimalInput | null
  /** Desempate no mesmo dia (ordem de cadastro). */
  createdAt?: string
}

export interface Position {
  quantity: Decimal
  /** Preço médio por unidade, em reais. */
  avgPrice: Decimal
  /** Custo da posição atual (centavos). */
  costCents: Cents
  /** Lucro/prejuízo realizado nas vendas (centavos). */
  realizedPnlCents: Cents
  /** Total investido em compras/depósitos (centavos), para referência. */
  investedCents: Cents
}

const centsOf = (value: Decimal): Cents =>
  value.toDecimalPlaces(0, Decimal.ROUND_HALF_EVEN).toNumber() + 0

/** Valor da quantidade × preço (reais) em centavos. */
export function valueCents(quantity: DecimalInput, price: DecimalInput): Cents {
  return centsOf(toDecimal(quantity).times(toDecimal(price)).times(100))
}

/** Valor total de uma compra: round(qtd × preço) + taxas (RC-20). */
export function tradeTotalCents(
  quantity: DecimalInput,
  unitPrice: DecimalInput,
  feesCents: Cents,
): Cents {
  return valueCents(quantity, unitPrice) + feesCents
}

export function sortTrades<T extends Pick<TradeInput, 'date' | 'createdAt'>>(
  trades: readonly T[],
): T[] {
  return [...trades].sort(
    (a, b) => a.date.localeCompare(b.date) || (a.createdAt ?? '').localeCompare(b.createdAt ?? ''),
  )
}

/**
 * Processa as operações em ordem de data (desempate por cadastro):
 * - compra/subscrição: custo += total; qtd += qtd → PM = custo / qtd;
 * - venda: PM não muda; custo −= qtd × PM; lucro += qtd × (preço − PM) − taxas;
 *   vender mais do que tem é erro;
 * - bonificação: qtd += bônus; custo += custo atribuído (total, 0 por padrão);
 * - desdobramento/grupamento: qtd × razão (ou ÷), custo igual;
 * - renda fixa: depósito soma ao custo; resgate tira do custo (até zerar);
 * - ajuste de posição (informado à mão): a partir da data, qtd = qtd informada e
 *   custo = total (qtd × PM); o que veio antes deixa de contar, o lucro realizado fica.
 */
export function computePosition(trades: readonly TradeInput[]): Position {
  let quantity = new Decimal(0)
  let cost = new Decimal(0) // em centavos, sem arredondar
  let realized = new Decimal(0)
  let invested = new Decimal(0)

  for (const trade of sortTrades(trades)) {
    const qty = toDecimal(trade.quantity)
    const total = new Decimal(trade.totalCents)
    if (qty.isNegative()) throw new PortfolioError('Quantidade não pode ser negativa')
    switch (trade.kind) {
      case 'buy':
      case 'subscription':
      case 'fixed_income_deposit':
        quantity = quantity.plus(qty)
        cost = cost.plus(total)
        invested = invested.plus(total)
        break
      case 'sell': {
        if (qty.greaterThan(quantity)) {
          throw new PortfolioError(
            `Venda de ${qty.toString()} maior que a posição de ${quantity.toString()} em ${trade.date}`,
          )
        }
        const avg = quantity.isZero() ? new Decimal(0) : cost.dividedBy(quantity)
        const price = toDecimal(trade.unitPrice).times(100)
        realized = realized.plus(qty.times(price.minus(avg))).minus(trade.feesCents)
        cost = cost.minus(qty.times(avg))
        quantity = quantity.minus(qty)
        if (quantity.isZero()) cost = new Decimal(0)
        break
      }
      case 'bonus':
        quantity = quantity.plus(qty)
        cost = cost.plus(total)
        break
      case 'split':
      case 'reverse_split': {
        const ratio = toDecimal(trade.splitRatio ?? 0)
        if (!ratio.greaterThan(0))
          throw new PortfolioError('Informe a proporção do desdobramento/grupamento')
        quantity = trade.kind === 'split' ? quantity.times(ratio) : quantity.dividedBy(ratio)
        break
      }
      case 'fixed_income_withdrawal': {
        const withdrawn = Decimal.min(total, cost)
        cost = cost.minus(withdrawn)
        if (qty.greaterThan(0)) quantity = Decimal.max(new Decimal(0), quantity.minus(qty))
        break
      }
      case 'position_set':
        if (total.greaterThan(cost)) invested = invested.plus(total.minus(cost))
        quantity = qty
        cost = qty.isZero() ? new Decimal(0) : total
        break
    }
  }

  return {
    quantity,
    avgPrice: quantity.isZero() ? new Decimal(0) : cost.dividedBy(quantity).dividedBy(100),
    costCents: centsOf(cost),
    realizedPnlCents: centsOf(realized),
    investedCents: centsOf(invested),
  }
}
