/**
 * Catálogos fixos do módulo financeiro: ícones e cores permitidos e as
 * categorias padrão criadas no cadastro (RF-60).
 */

/** Paleta de categorias/classes (docs/09). O tema escuro troca pela versão escura na UI. */
export const PALETTE = [
  '#007AFF',
  '#34C759',
  '#FF9500',
  '#AF52DE',
  '#FF2D55',
  '#5AC8FA',
  '#FFCC00',
  '#8E8E93',
] as const

export type PaletteColor = (typeof PALETTE)[number]

/** Ícones (nomes do lucide) que uma categoria pode usar. */
export const CATEGORY_ICONS = [
  'house',
  'shopping-cart',
  'utensils-crossed',
  'car',
  'heart-pulse',
  'graduation-cap',
  'popcorn',
  'repeat',
  'shopping-bag',
  'gift',
  'paw-print',
  'plane',
  'ellipsis',
  'briefcase',
  'sparkles',
  'undo-2',
  'plus',
  'coffee',
  'fuel',
  'baby',
  'dumbbell',
  'shirt',
  'smartphone',
  'zap',
  'wifi',
  'bus',
  'pill',
  'book-open',
  'gamepad-2',
  'headphones',
  'scissors',
  'wrench',
  'landmark',
  'piggy-bank',
  'hand-coins',
  'receipt',
] as const

export type CategoryIcon = (typeof CATEGORY_ICONS)[number]

export type CategoryKind = 'income' | 'expense'

export interface DefaultCategory {
  kind: CategoryKind
  name: string
  icon: CategoryIcon
  color: PaletteColor
}

const [blue, green, orange, purple, pink, teal, yellow, gray] = PALETTE

/** RF-60: categorias padrão criadas no cadastro (editáveis depois). */
export const DEFAULT_CATEGORIES: readonly DefaultCategory[] = [
  { kind: 'expense', name: 'Moradia', icon: 'house', color: blue },
  { kind: 'expense', name: 'Mercado', icon: 'shopping-cart', color: green },
  { kind: 'expense', name: 'Alimentação fora', icon: 'utensils-crossed', color: orange },
  { kind: 'expense', name: 'Transporte', icon: 'car', color: teal },
  { kind: 'expense', name: 'Saúde', icon: 'heart-pulse', color: pink },
  { kind: 'expense', name: 'Educação', icon: 'graduation-cap', color: purple },
  { kind: 'expense', name: 'Lazer', icon: 'popcorn', color: yellow },
  { kind: 'expense', name: 'Assinaturas', icon: 'repeat', color: purple },
  { kind: 'expense', name: 'Compras', icon: 'shopping-bag', color: pink },
  { kind: 'expense', name: 'Presentes', icon: 'gift', color: orange },
  { kind: 'expense', name: 'Pets', icon: 'paw-print', color: yellow },
  { kind: 'expense', name: 'Viagem', icon: 'plane', color: teal },
  { kind: 'expense', name: 'Outros', icon: 'ellipsis', color: gray },
  { kind: 'income', name: 'Salário', icon: 'briefcase', color: green },
  { kind: 'income', name: 'Extra', icon: 'sparkles', color: blue },
  { kind: 'income', name: 'Presente', icon: 'gift', color: orange },
  { kind: 'income', name: 'Reembolso', icon: 'undo-2', color: teal },
  { kind: 'income', name: 'Outros', icon: 'ellipsis', color: gray },
] as const satisfies readonly DefaultCategory[]

/** Valida uma cor hex `#RRGGBB`. */
export function isHexColor(value: string): boolean {
  return /^#[0-9A-Fa-f]{6}$/.test(value)
}
