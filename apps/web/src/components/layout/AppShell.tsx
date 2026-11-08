import { useEffect } from 'react'
import { Outlet, useLocation, useNavigate } from 'react-router'
import { EntryProvider, useEntrySheet, type EntryKind } from '@/features/finances/EntrySheet'
import { Sidebar } from './Sidebar'
import { TabBar } from './TabBar'

/** Atalho `N` (desktop) para novo lançamento, fora de campos de texto (RM-01). */
function useNewEntryShortcut(open: () => void) {
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key.toLowerCase() !== 'n' || event.metaKey || event.ctrlKey || event.altKey) return
      const target = event.target as HTMLElement | null
      if (target?.closest('input, textarea, select, [contenteditable="true"], dialog[open]')) return
      event.preventDefault()
      open()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [open])
}

/** Link direto para o sheet: `#novo` (despesa), `#novo-receita`, `#novo-parcelado`, `#novo-planejar`. */
const hashKinds: Record<string, EntryKind> = {
  '#novo': 'expense',
  '#novo-receita': 'income',
  '#novo-parcelado': 'installment',
  '#novo-planejar': 'planned',
}

function Shell() {
  const { openNew } = useEntrySheet()
  const { hash, pathname, search } = useLocation()
  const navigate = useNavigate()
  const openNewEntry = () => openNew()
  useNewEntryShortcut(openNew)

  useEffect(() => {
    const kind = hashKinds[hash]
    if (!kind) return
    openNew(kind)
    void navigate({ pathname, search }, { replace: true })
  }, [hash, pathname, search, openNew, navigate])

  return (
    <div className="min-h-dvh">
      <Sidebar onNewEntry={openNewEntry} />

      <main className="overflow-x-clip px-4 pb-[calc(88px+env(safe-area-inset-bottom))] lg:pb-12 lg:pl-68 lg:pr-8 xl:pr-10">
        <div className="mx-auto w-full max-w-[1200px]">
          {/* Cada tela entra com um fade curto (doc 09 › Movimento). */}
          <div key={pathname} className="animate-enter">
            <Outlet />
          </div>
        </div>
      </main>

      <TabBar onNewEntry={openNewEntry} />
    </div>
  )
}

/** Casca do app: tab bar no mobile, sidebar fixa no desktop (≥1024px) e o sheet "+". */
export function AppShell() {
  return (
    <EntryProvider>
      <Shell />
    </EntryProvider>
  )
}
