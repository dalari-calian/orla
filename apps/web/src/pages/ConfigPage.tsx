import { Monitor, Moon, Sun } from 'lucide-react'
import { PageHeader } from '@/components/layout/PageHeader'
import { SystemStatus } from '@/components/SystemStatus'
import { Card, CardHeader } from '@/components/ui/Card'
import { GroupedList, ListRow } from '@/components/ui/GroupedList'
import { SegmentedControl } from '@/components/ui/SegmentedControl'
import { useTheme, type ThemePreference } from '@/lib/theme'
import { screensOf } from '@/routes/screens'

const themeOptions = [
  { value: 'light', label: 'Claro', icon: Sun },
  { value: 'dark', label: 'Escuro', icon: Moon },
  { value: 'system', label: 'Sistema', icon: Monitor },
] as const satisfies readonly { value: ThemePreference; label: string; icon: typeof Sun }[]

export function ConfigPage() {
  const [theme, setTheme] = useTheme()

  return (
    <>
      <PageHeader title="Configurações" />
      <div className="grid gap-6 lg:grid-cols-2 lg:items-start">
        <div className="space-y-6">
          <Card>
            <CardHeader title="Aparência" />
            <SegmentedControl
              label="Tema"
              options={themeOptions}
              value={theme}
              onChange={setTheme}
            />
          </Card>
          <SystemStatus />
        </div>

        <GroupedList title="Cadastros e dados">
          {screensOf('config').map((screen) => (
            <ListRow
              key={screen.path}
              to={screen.path}
              icon={screen.icon}
              title={screen.title}
              value={`Fase ${screen.phase}`}
            />
          ))}
        </GroupedList>
      </div>
    </>
  )
}
