import { CircleAlert, type LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'
import { cn } from '@/lib/cn'

/** Estado vazio — obrigatório em toda lista/tela (docs/09). */
export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  className,
}: {
  icon: LucideIcon
  title: ReactNode
  description?: ReactNode
  action?: ReactNode
  className?: string
}) {
  return (
    <div className={cn('flex flex-col items-center px-4 py-10 text-center', className)}>
      <span className="mb-4 flex size-14 items-center justify-center rounded-full bg-accent/12 text-accent">
        <Icon className="size-7" strokeWidth={1.75} aria-hidden />
      </span>
      <h2 className="text-title-2 font-semibold">{title}</h2>
      {description && <p className="mt-2 max-w-sm text-subhead text-text-2">{description}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  )
}

/** Estado de erro com ação de tentar de novo. */
export function ErrorState({
  title = 'Algo deu errado',
  description,
  onRetry,
}: {
  title?: string
  description?: ReactNode
  onRetry?: () => void
}) {
  return (
    <div role="alert" className="flex items-start gap-3">
      <CircleAlert className="mt-0.5 size-5 shrink-0 text-negative" aria-hidden />
      <div className="min-w-0 flex-1">
        <p className="text-body font-medium">{title}</p>
        {description && <p className="mt-0.5 text-footnote text-text-2">{description}</p>}
        {onRetry && (
          <button
            type="button"
            onClick={onRetry}
            className="mt-2 min-h-11 text-subhead font-medium text-accent"
          >
            Tentar de novo
          </button>
        )}
      </div>
    </div>
  )
}

/** Bloco de carregamento. */
export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden className={cn('animate-pulse rounded-field bg-surface-2', className)} />
}
