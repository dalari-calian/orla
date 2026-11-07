import { ChartPie, Ellipsis, House, Plus, ReceiptText, type LucideIcon } from 'lucide-react'
import { NavLink, useLocation } from 'react-router'
import { cn } from '@/lib/cn'

interface Tab {
  title: string
  path: string
  icon: LucideIcon
  /** Prefixos de rota que também ativam a aba. */
  matches: string[]
}

const leftTabs: Tab[] = [
  { title: 'Início', path: '/', icon: House, matches: [] },
  { title: 'Finanças', path: '/financas', icon: ReceiptText, matches: ['/financas'] },
]
const rightTabs: Tab[] = [
  { title: 'Carteira', path: '/carteira', icon: ChartPie, matches: ['/carteira'] },
  {
    title: 'Mais',
    path: '/mais',
    icon: Ellipsis,
    matches: ['/mais', '/aporte', '/balanco', '/config'],
  },
]

function TabLink({ tab, pathname }: { tab: Tab; pathname: string }) {
  const active =
    tab.path === '/' ? pathname === '/' : tab.matches.some((prefix) => pathname.startsWith(prefix))
  const Icon = tab.icon
  return (
    <NavLink
      to={tab.path}
      aria-current={active ? 'page' : undefined}
      className={cn(
        'flex min-h-12 flex-col items-center justify-center gap-0.5 text-[10px] font-medium transition-colors',
        active ? 'text-accent' : 'text-text-2',
      )}
    >
      <Icon className="size-6" strokeWidth={active ? 2.25 : 1.75} aria-hidden />
      {tab.title}
    </NavLink>
  )
}

/** Tab bar do mobile: Início · Finanças · + · Carteira · Mais. */
export function TabBar({ onNewEntry }: { onNewEntry: () => void }) {
  const { pathname } = useLocation()

  return (
    <nav
      aria-label="Navegação principal"
      className="glass hairline-t pb-safe fixed inset-x-0 bottom-0 z-40 lg:hidden"
    >
      <div className="mx-auto grid h-14 max-w-lg grid-cols-5 items-center px-2">
        {leftTabs.map((tab) => (
          <TabLink key={tab.path} tab={tab} pathname={pathname} />
        ))}
        <div className="flex justify-center">
          <button
            type="button"
            onClick={onNewEntry}
            aria-label="Novo lançamento"
            className="flex size-12 items-center justify-center rounded-full bg-accent text-white shadow-[0_6px_16px_color-mix(in_srgb,var(--accent)_35%,transparent)] transition-transform duration-200 ease-ios active:scale-95"
          >
            <Plus className="size-6" strokeWidth={2.5} aria-hidden />
          </button>
        </div>
        {rightTabs.map((tab) => (
          <TabLink key={tab.path} tab={tab} pathname={pathname} />
        ))}
      </div>
    </nav>
  )
}
