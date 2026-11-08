import { MessageSquareWarning } from 'lucide-react'
import { PageHeader } from '@/components/layout/PageHeader'
import { GroupedList, ListRow } from '@/components/ui/GroupedList'
import { useFeedback } from '@/features/feedback/FeedbackSheet'
import { sections } from '@/routes/screens'

const colors: Record<string, string> = {
  aporte: 'var(--chart-2)',
  balanco: 'var(--chart-4)',
  config: 'var(--chart-8)',
}

/** Aba "Mais" do mobile: seções que não cabem na tab bar. */
export function MorePage() {
  const { openFeedback } = useFeedback()
  const items = sections.filter((section) => ['aporte', 'balanco', 'config'].includes(section.key))
  return (
    <>
      <PageHeader title="Mais" />
      <GroupedList>
        {items.map((section) => (
          <ListRow
            key={section.key}
            to={section.path}
            icon={section.icon}
            iconColor={colors[section.key]}
            title={section.title}
          />
        ))}
      </GroupedList>
      <GroupedList title="Ajude a melhorar o Orla">
        <ListRow
          icon={MessageSquareWarning}
          iconColor="var(--negative)"
          title="Reportar bug ou sugerir melhoria"
          onClick={() => openFeedback()}
        />
        <ListRow
          icon={MessageSquareWarning}
          iconColor="var(--chart-4)"
          title="Meus relatos"
          subtitle="Acompanhe o andamento"
          to="/config/feedback"
        />
      </GroupedList>
    </>
  )
}
