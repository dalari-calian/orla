import type { HTMLAttributes, ReactNode } from 'react'
import { cn } from '@/lib/cn'

/** Superfície padrão: cantos de 20px, sombra suave no claro e nenhuma no escuro. */
export function Card({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn('rounded-card bg-surface p-4 shadow-card md:p-5', className)} {...props} />
  )
}

export function CardHeader({
  title,
  action,
  className,
}: {
  title: ReactNode
  action?: ReactNode
  className?: string
}) {
  return (
    <div className={cn('mb-3 flex items-center justify-between gap-3', className)}>
      <h2 className="text-headline font-semibold">{title}</h2>
      {action}
    </div>
  )
}
