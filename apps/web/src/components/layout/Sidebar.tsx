import { Moon, Plus, Sun } from 'lucide-react'
import { NavLink } from 'react-router'
import { cn } from '@/lib/cn'
import { useMe } from '@/features/auth/api'
import { useTheme } from '@/lib/theme'
import { sections } from '@/routes/screens'
import { Logo } from './Logo'

/** Navegação do desktop (≥1024px): logo, seções, botão de lançar e tema. */
export function Sidebar({ onNewEntry }: { onNewEntry: () => void }) {
  const [theme, setTheme] = useTheme()
  const me = useMe()
  const isDark =
    theme === 'dark' || (theme === 'system' && document.documentElement.dataset.theme === 'dark')

  return (
    <aside className="fixed inset-y-0 left-0 z-40 hidden w-60 flex-col bg-surface px-3 py-5 shadow-[inset_-0.5px_0_0_var(--separator)] lg:flex dark:bg-bg">
      <div className="px-3 pb-6">
        <Logo />
      </div>

      <button
        type="button"
        onClick={onNewEntry}
        className="mx-1 mb-5 flex min-h-11 items-center justify-center gap-2 rounded-field bg-accent px-4 text-subhead font-semibold text-white transition-opacity hover:opacity-90"
      >
        <Plus className="size-5" aria-hidden />
        Novo lançamento
      </button>

      <nav aria-label="Navegação principal" className="flex-1">
        <ul className="space-y-0.5">
          {sections.map(({ key, title, path, icon: Icon }) => (
            <li key={key}>
              <NavLink
                to={path}
                end={path === '/'}
                className={({ isActive }) =>
                  cn(
                    'flex min-h-11 items-center gap-3 rounded-field px-3 text-callout transition-colors',
                    isActive
                      ? 'bg-accent/12 font-semibold text-accent'
                      : 'text-text hover:bg-surface-2',
                  )
                }
              >
                <Icon className="size-5" aria-hidden />
                {title}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>

      <div className="flex items-center justify-between px-3 pt-4">
        <div className="min-w-0">
          <p className="truncate text-subhead font-medium">
            {me.data?.displayName || me.data?.username}
          </p>
          <NavLink to="/config" className="text-caption text-text-2 hover:text-accent">
            Perfil e ajustes
          </NavLink>
        </div>
        <button
          type="button"
          onClick={() => setTheme(isDark ? 'light' : 'dark')}
          aria-label={isDark ? 'Usar tema claro' : 'Usar tema escuro'}
          className="flex size-11 items-center justify-center rounded-full text-text-2 hover:bg-surface-2"
        >
          {isDark ? (
            <Sun className="size-5" aria-hidden />
          ) : (
            <Moon className="size-5" aria-hidden />
          )}
        </button>
      </div>
    </aside>
  )
}
