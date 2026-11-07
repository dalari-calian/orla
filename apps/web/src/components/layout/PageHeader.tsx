import { ChevronLeft } from 'lucide-react'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Link } from 'react-router'
import { cn } from '@/lib/cn'

/**
 * Cabeçalho estilo iOS: título grande que, ao rolar, dá lugar a uma barra compacta
 * com vidro (só no mobile; no desktop a sidebar já orienta a navegação).
 */
export function PageHeader({
  title,
  subtitle,
  actions,
  back,
}: {
  title: string
  subtitle?: ReactNode
  actions?: ReactNode
  back?: { to: string; label: string }
}) {
  const largeTitleRef = useRef<HTMLHeadingElement>(null)
  const [collapsed, setCollapsed] = useState(false)

  useEffect(() => {
    const element = largeTitleRef.current
    if (!element) return
    const observer = new IntersectionObserver(
      ([entry]) => setCollapsed(entry ? !entry.isIntersecting : false),
      { rootMargin: '-52px 0px 0px 0px' },
    )
    observer.observe(element)
    return () => observer.disconnect()
  }, [])

  return (
    <>
      <div
        className={cn(
          'pt-safe sticky top-0 z-30 -mx-4 transition-[background-color,box-shadow] duration-200 lg:hidden',
          collapsed ? 'glass hairline-b' : 'bg-transparent',
        )}
      >
        <div className="relative flex h-11 items-center justify-between px-2">
          <div className="min-w-11">
            {back && (
              <Link
                to={back.to}
                className="flex min-h-11 items-center gap-0.5 pr-2 text-body text-accent"
              >
                <ChevronLeft className="size-6" aria-hidden />
                {back.label}
              </Link>
            )}
          </div>
          <span
            aria-hidden
            className={cn(
              'pointer-events-none absolute inset-x-24 truncate text-center text-headline font-semibold transition-opacity duration-200',
              collapsed ? 'opacity-100' : 'opacity-0',
            )}
          >
            {title}
          </span>
          <div className="flex min-w-11 justify-end">{actions}</div>
        </div>
      </div>

      <header className="mb-5 lg:mt-8 lg:mb-6">
        {back && (
          <Link
            to={back.to}
            className="mb-2 hidden min-h-11 items-center gap-0.5 text-subhead text-accent lg:inline-flex"
          >
            <ChevronLeft className="size-5" aria-hidden />
            {back.label}
          </Link>
        )}
        <div className="flex items-end justify-between gap-4">
          <div className="min-w-0">
            <h1
              ref={largeTitleRef}
              className="text-large-title font-bold tracking-tight text-balance"
            >
              {title}
            </h1>
            {subtitle && <p className="mt-1 text-subhead text-text-2">{subtitle}</p>}
          </div>
          {actions && <div className="hidden shrink-0 lg:flex">{actions}</div>}
        </div>
      </header>
    </>
  )
}
