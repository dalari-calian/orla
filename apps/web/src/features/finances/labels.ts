import { currentCompetenceMonth, isCompetenceMonth, parseCompetenceMonth } from '@orla/core'
import type { PaymentMethod, TransactionNature } from '@orla/contracts'
import { useSearchParams } from 'react-router'

export const paymentMethodLabels: Record<PaymentMethod, string> = {
  pix: 'PIX',
  debit: 'Débito',
  credit: 'Crédito',
  cash: 'Dinheiro',
  boleto: 'Boleto',
  transfer: 'Transferência',
  other: 'Outro',
}

export const natureLabels: Record<TransactionNature, string> = {
  fixed: 'Fixa',
  variable: 'Variável',
  planned: 'Planejamento',
  installment: 'Parcela',
  extra: 'Extra',
  carryover: 'Saldo anterior',
}

const MONTHS = [
  'janeiro',
  'fevereiro',
  'março',
  'abril',
  'maio',
  'junho',
  'julho',
  'agosto',
  'setembro',
  'outubro',
  'novembro',
  'dezembro',
] as const

export const monthNames = MONTHS

/** `2026-11` → "Novembro 2026". */
export function monthLabel(month: string): string {
  const { year, month: m } = parseCompetenceMonth(month)
  const name = MONTHS[m - 1] ?? ''
  return `${name.charAt(0).toLocaleUpperCase('pt-BR')}${name.slice(1)} ${year}`
}

/** `2026-11` → "nov/2026". */
export function shortMonthLabel(month: string): string {
  const { year, month: m } = parseCompetenceMonth(month)
  return `${(MONTHS[m - 1] ?? '').slice(0, 3)}/${year}`
}

/** `2026-11-07` → "07/11". */
export function shortDate(date: string): string {
  const [, month, day] = date.split('-')
  return `${day}/${month}`
}

/** `2026-11-07` → "sáb., 7 de novembro". */
export function dayHeading(date: string): string {
  const [year, month, day] = date.split('-').map(Number) as [number, number, number]
  return new Intl.DateTimeFormat('pt-BR', {
    weekday: 'short',
    day: 'numeric',
    month: 'long',
    timeZone: 'UTC',
  }).format(new Date(Date.UTC(year, month - 1, day)))
}

/**
 * Mês selecionado nas telas de Finanças, guardado na URL (`?mes=2026-11`): dá para
 * compartilhar o link e o botão voltar funciona (docs/10). Sem `?mes`, o mês atual.
 */
export function useMonthParam(): [string, (month: string) => void] {
  const [params, setParams] = useSearchParams()
  const value = params.get('mes')
  const month = value && isCompetenceMonth(value) ? value : currentCompetenceMonth()
  const setMonth = (next: string) =>
    setParams(
      (current) => {
        const copy = new URLSearchParams(current)
        copy.set('mes', next)
        return copy
      },
      { replace: true },
    )
  return [month, setMonth]
}
