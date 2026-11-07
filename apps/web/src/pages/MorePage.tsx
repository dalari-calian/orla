import { PageHeader } from '@/components/layout/PageHeader'
import { GroupedList, ListRow } from '@/components/ui/GroupedList'
import { sections } from '@/routes/screens'

const colors: Record<string, string> = {
  aporte: 'var(--chart-2)',
  balanco: 'var(--chart-4)',
  config: 'var(--chart-8)',
}

/** Aba "Mais" do mobile: seções que não cabem na tab bar. */
export function MorePage() {
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
    </>
  )
}
