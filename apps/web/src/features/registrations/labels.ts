import type { AccountKind } from '@orla/contracts'

export const accountKindLabels: Record<AccountKind, string> = {
  checking: 'Conta corrente',
  savings: 'Poupança',
  brokerage: 'Corretora',
  wallet: 'Dinheiro em espécie',
  other: 'Outra',
}

/** Sugestões do onboarding: toque e a conta é criada (nome, tipo e cor editáveis depois). */
export const institutionPresets: { name: string; kind: AccountKind; color: string }[] = [
  { name: 'Nubank', kind: 'checking', color: '#8A05BE' },
  { name: 'Itaú', kind: 'checking', color: '#EC7000' },
  { name: 'Bradesco', kind: 'checking', color: '#CC092F' },
  { name: 'Santander', kind: 'checking', color: '#EC0000' },
  { name: 'Banco do Brasil', kind: 'checking', color: '#0038A8' },
  { name: 'Caixa', kind: 'checking', color: '#005CA9' },
  { name: 'Inter', kind: 'checking', color: '#FF7A00' },
  { name: 'C6 Bank', kind: 'checking', color: '#3A3A3C' },
  { name: 'XP', kind: 'brokerage', color: '#1C1C1E' },
  { name: 'Rico', kind: 'brokerage', color: '#FF5A00' },
  { name: 'BTG Pactual', kind: 'brokerage', color: '#05132A' },
  { name: 'Carteira', kind: 'wallet', color: '#34C759' },
]

/** Paleta das contas: as cores do design system + as dos bancos mais comuns. */
export const accountColors = [
  '#007AFF',
  '#34C759',
  '#FF9500',
  '#AF52DE',
  '#FF2D55',
  '#5AC8FA',
  '#FFCC00',
  '#8E8E93',
  '#8A05BE',
  '#EC7000',
  '#CC092F',
  '#005CA9',
]

/** "Fecha dia 3 · vence dia 10" */
export function cardDaysLabel(closingDay: number, dueDay: number): string {
  return `Fecha dia ${closingDay} · vence dia ${dueDay}`
}
