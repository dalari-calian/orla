import { ChevronRight, type LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'
import { Link } from 'react-router'
import { cn } from '@/lib/cn'

/** Lista inset agrupada, no estilo dos Ajustes do iOS. */
export function GroupedList({
  title,
  footer,
  children,
  className,
}: {
  title?: ReactNode
  footer?: ReactNode
  children: ReactNode
  className?: string
}) {
  return (
    <section className={className}>
      {title && (
        <h2 className="mb-2 px-4 text-footnote font-medium tracking-wide text-text-2 uppercase">
          {title}
        </h2>
      )}
      <ul className="overflow-hidden rounded-card bg-surface shadow-card">{children}</ul>
      {footer && <p className="mt-2 px-4 text-footnote text-text-2">{footer}</p>}
    </section>
  )
}

interface ListRowProps {
  title: ReactNode
  subtitle?: ReactNode
  value?: ReactNode
  icon?: LucideIcon
  /** Cor do círculo do ícone (token CSS, ex.: var(--chart-2)). */
  iconColor?: string
  to?: string
}

export function ListRow({ title, subtitle, value, icon: Icon, iconColor, to }: ListRowProps) {
  const content = (
    <>
      {Icon && (
        <span
          className="flex size-9 shrink-0 items-center justify-center rounded-full"
          style={{
            color: iconColor ?? 'var(--accent)',
            backgroundColor: `color-mix(in srgb, ${iconColor ?? 'var(--accent)'} 14%, transparent)`,
          }}
          aria-hidden
        >
          <Icon className="size-[18px]" strokeWidth={2} />
        </span>
      )}
      <span className="min-w-0 flex-1">
        <span className="block truncate text-body">{title}</span>
        {subtitle && <span className="block truncate text-footnote text-text-2">{subtitle}</span>}
      </span>
      {value && <span className="shrink-0 text-subhead text-text-2 tabular">{value}</span>}
      {to && <ChevronRight className="size-4 shrink-0 text-text-3" aria-hidden />}
    </>
  )

  const rowClass = cn(
    'flex min-h-14 items-center gap-3 px-4 py-2.5',
    to && 'transition-colors hover:bg-surface-2 active:bg-surface-2',
  )

  return (
    <li className="relative [&+li]:before:absolute [&+li]:before:inset-x-4 [&+li]:before:top-0 [&+li]:before:h-px [&+li]:before:origin-top [&+li]:before:scale-y-50 [&+li]:before:bg-separator">
      {to ? (
        <Link to={to} className={rowClass}>
          {content}
        </Link>
      ) : (
        <div className={rowClass}>{content}</div>
      )}
    </li>
  )
}
