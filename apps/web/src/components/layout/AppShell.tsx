import { Zap } from 'lucide-react'
import { useState } from 'react'
import { Outlet } from 'react-router'
import { Sheet } from '@/components/ui/Sheet'
import { EmptyState } from '@/components/ui/States'
import { Sidebar } from './Sidebar'
import { TabBar } from './TabBar'

/** Casca do app: tab bar no mobile, sidebar fixa no desktop (≥1024px). */
export function AppShell() {
  const [newEntryOpen, setNewEntryOpen] = useState(false)
  const openNewEntry = () => setNewEntryOpen(true)

  return (
    <div className="min-h-dvh">
      <Sidebar onNewEntry={openNewEntry} />

      <main className="px-4 pb-[calc(88px+env(safe-area-inset-bottom))] lg:pb-12 lg:pl-68 lg:pr-8 xl:pr-10">
        <div className="mx-auto w-full max-w-[1200px]">
          <Outlet />
        </div>
      </main>

      <TabBar onNewEntry={openNewEntry} />

      <Sheet open={newEntryOpen} onClose={() => setNewEntryOpen(false)} title="Novo lançamento">
        <EmptyState
          icon={Zap}
          title="Lançamento rápido"
          description="Aqui você vai registrar um gasto em até 3 toques. Chega na Fase 2."
          className="py-4"
        />
      </Sheet>
    </div>
  )
}
