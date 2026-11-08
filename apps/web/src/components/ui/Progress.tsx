import { cn } from '@/lib/cn'

export type ProgressTone = 'accent' | 'positive' | 'warning' | 'negative'

const toneClass: Record<ProgressTone, string> = {
  accent: 'bg-accent',
  positive: 'bg-positive',
  warning: 'bg-warning',
  negative: 'bg-negative',
}

/** Barra de progresso (meta, parcelas, orçamento): preenche da esquerda ao montar. */
export function ProgressBar({
  value,
  tone = 'accent',
  className,
  label,
}: {
  /** 0–1 (acima de 1 fica cheia). */
  value: number
  tone?: ProgressTone
  className?: string
  label?: string
}) {
  return (
    <div
      className={cn('h-2 overflow-hidden rounded-full bg-surface-2', className)}
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(Math.min(1, Math.max(0, value)) * 100)}
    >
      <div
        className={cn(
          'h-full origin-left animate-grow-x rounded-full transition-[width] duration-500 ease-ios',
          toneClass[tone],
        )}
        style={{ width: `${Math.min(100, Math.max(0, value * 100))}%` }}
      />
    </div>
  )
}

/** Anel de progresso (gasto realizado × previsto). O traço anima ao montar e ao mudar. */
export function ProgressRing({
  value,
  size = 112,
  stroke = 12,
  tone = 'accent',
  children,
  label,
}: {
  value: number
  size?: number
  stroke?: number
  tone?: ProgressTone
  children?: React.ReactNode
  label?: string
}) {
  const radius = (size - stroke) / 2
  const circumference = 2 * Math.PI * radius
  const clamped = Math.min(1, Math.max(0, value))
  const color = {
    accent: 'var(--accent)',
    positive: 'var(--positive)',
    warning: 'var(--warning)',
    negative: 'var(--negative)',
  }[tone]
  return (
    <div
      className="relative shrink-0"
      style={{ width: size, height: size }}
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(clamped * 100)}
    >
      <svg width={size} height={size} className="-rotate-90" aria-hidden>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="var(--surface-2)"
          strokeWidth={stroke}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - clamped)}
          className="animate-ring transition-[stroke-dashoffset] duration-700 ease-ios"
          style={{ ['--ring-length' as string]: `${circumference}` }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
        {children}
      </div>
    </div>
  )
}
