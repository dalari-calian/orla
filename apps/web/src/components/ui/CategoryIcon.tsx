import type { CategoryIcon as CategoryIconName } from '@orla/core'
import {
  Baby,
  BookOpen,
  Briefcase,
  Bus,
  Car,
  Coffee,
  Dumbbell,
  Ellipsis,
  Fuel,
  Gamepad2,
  Gift,
  GraduationCap,
  HandCoins,
  Headphones,
  HeartPulse,
  House,
  Landmark,
  PawPrint,
  PiggyBank,
  Pill,
  Plane,
  Plus,
  Popcorn,
  Receipt,
  Repeat,
  Scissors,
  Shirt,
  ShoppingBag,
  ShoppingCart,
  Smartphone,
  Sparkles,
  Undo2,
  UtensilsCrossed,
  Wifi,
  Wrench,
  Zap,
  type LucideIcon,
} from 'lucide-react'

/** Nome do catálogo (`@orla/core`) → componente do lucide. O tipo garante que todos existem. */
export const categoryIcons: Record<CategoryIconName, LucideIcon> = {
  house: House,
  'shopping-cart': ShoppingCart,
  'utensils-crossed': UtensilsCrossed,
  car: Car,
  'heart-pulse': HeartPulse,
  'graduation-cap': GraduationCap,
  popcorn: Popcorn,
  repeat: Repeat,
  'shopping-bag': ShoppingBag,
  gift: Gift,
  'paw-print': PawPrint,
  plane: Plane,
  ellipsis: Ellipsis,
  briefcase: Briefcase,
  sparkles: Sparkles,
  'undo-2': Undo2,
  plus: Plus,
  coffee: Coffee,
  fuel: Fuel,
  baby: Baby,
  dumbbell: Dumbbell,
  shirt: Shirt,
  smartphone: Smartphone,
  zap: Zap,
  wifi: Wifi,
  bus: Bus,
  pill: Pill,
  'book-open': BookOpen,
  'gamepad-2': Gamepad2,
  headphones: Headphones,
  scissors: Scissors,
  wrench: Wrench,
  landmark: Landmark,
  'piggy-bank': PiggyBank,
  'hand-coins': HandCoins,
  receipt: Receipt,
}

/** Ícone em círculo com a cor suave da categoria/conta. */
export function IconBadge({
  icon: Icon,
  color,
  size = 'md',
}: {
  icon: LucideIcon
  color: string
  size?: 'md' | 'lg'
}) {
  return (
    <span
      className={
        size === 'lg'
          ? 'flex size-12 items-center justify-center rounded-full'
          : 'flex size-9 items-center justify-center rounded-full'
      }
      style={{ color, backgroundColor: `color-mix(in srgb, ${color} 16%, transparent)` }}
      aria-hidden
    >
      <Icon className={size === 'lg' ? 'size-6' : 'size-[18px]'} strokeWidth={2} />
    </span>
  )
}
