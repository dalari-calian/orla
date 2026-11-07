import { Construction } from 'lucide-react'
import { Card } from '@/components/ui/Card'
import { GroupedList, ListRow } from '@/components/ui/GroupedList'
import { EmptyState } from '@/components/ui/States'
import { PageHeader } from '@/components/layout/PageHeader'
import type { Screen } from '@/routes/screens'

export function PhaseBadge({ phase }: { phase: number }) {
  return (
    <span className="rounded-full bg-surface-2 px-2.5 py-1 text-caption font-medium text-text-2">
      Fase {phase}
    </span>
  )
}

/** Tela ainda não implementada: explica o que ela vai ter e em que fase chega. */
export function PlaceholderPage({
  title,
  description,
  phase,
  back,
  children,
}: {
  title: string
  description: string
  phase: number
  back?: { to: string; label: string }
  children?: readonly Screen[]
}) {
  return (
    <>
      <PageHeader title={title} back={back} />
      <div className="space-y-6">
        <Card>
          <EmptyState
            icon={Construction}
            title="Em construção"
            description={description}
            action={<PhaseBadge phase={phase} />}
          />
        </Card>

        {children && children.length > 0 && (
          <GroupedList title="Telas desta seção">
            {children.map((screen) => (
              <ListRow
                key={screen.path}
                to={screen.sampleHref ?? screen.path}
                icon={screen.icon}
                title={screen.title}
                subtitle={screen.description}
                value={`Fase ${screen.phase}`}
              />
            ))}
          </GroupedList>
        )}
      </div>
    </>
  )
}
