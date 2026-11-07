import { updateProfileRequestSchema, type UpdateProfileRequest } from '@orla/contracts'
import { LogOut, Monitor, Moon, Sun } from 'lucide-react'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { PageHeader } from '@/components/layout/PageHeader'
import { SystemStatus } from '@/components/SystemStatus'
import { Button } from '@/components/ui/Button'
import { Card, CardHeader } from '@/components/ui/Card'
import { TextField } from '@/components/ui/Field'
import { GroupedList, ListRow } from '@/components/ui/GroupedList'
import { SegmentedControl } from '@/components/ui/SegmentedControl'
import { Sheet } from '@/components/ui/Sheet'
import { useToast } from '@/components/ui/Toast'
import { useLogout, useMe, useUpdateProfile } from '@/features/auth/api'
import { errorMessage } from '@/lib/api'
import { zodResolver } from '@/lib/form'
import { useTheme, type ThemePreference } from '@/lib/theme'
import { screensOf } from '@/routes/screens'

const themeOptions = [
  { value: 'light', label: 'Claro', icon: Sun },
  { value: 'dark', label: 'Escuro', icon: Moon },
  { value: 'system', label: 'Sistema', icon: Monitor },
] as const satisfies readonly { value: ThemePreference; label: string; icon: typeof Sun }[]

function ProfileCard() {
  const me = useMe()
  const logout = useLogout()
  const updateProfile = useUpdateProfile()
  const toast = useToast()
  const [editing, setEditing] = useState(false)
  const form = useForm<UpdateProfileRequest>({
    resolver: zodResolver(updateProfileRequestSchema),
    values: { displayName: me.data?.displayName ?? '' },
  })

  if (!me.data) return null
  const name = me.data.displayName || me.data.username

  return (
    <Card>
      <div className="flex items-center gap-4">
        <span
          className="flex size-14 shrink-0 items-center justify-center rounded-full bg-accent/14 text-title-2 font-semibold text-accent"
          aria-hidden
        >
          {name.charAt(0).toLocaleUpperCase('pt-BR')}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-headline font-semibold">{name}</p>
          <p className="truncate text-subhead text-text-2">@{me.data.username}</p>
        </div>
        <Button variant="plain" onClick={() => setEditing(true)}>
          Editar
        </Button>
      </div>
      <div className="mt-4 border-t border-separator pt-3">
        <Button
          variant="destructive"
          loading={logout.isPending}
          onClick={() => logout.mutate()}
          className="-ml-4"
        >
          <LogOut className="size-5" aria-hidden />
          Sair
        </Button>
      </div>

      <Sheet open={editing} onClose={() => setEditing(false)} title="Editar perfil">
        <form
          noValidate
          className="space-y-4"
          onSubmit={form.handleSubmit((values) =>
            updateProfile.mutate(values, {
              onSuccess: () => {
                setEditing(false)
                toast({ message: 'Perfil atualizado' })
              },
            }),
          )}
        >
          <TextField
            label="Como quer ser chamado"
            error={form.formState.errors.displayName?.message}
            {...form.register('displayName')}
          />
          {updateProfile.isError && (
            <p role="alert" className="text-footnote text-negative">
              {errorMessage(updateProfile.error)}
            </p>
          )}
          <Button type="submit" block loading={updateProfile.isPending}>
            Salvar
          </Button>
        </form>
      </Sheet>
    </Card>
  )
}

export function ConfigPage() {
  const [theme, setTheme] = useTheme()

  return (
    <>
      <PageHeader title="Configurações" />
      <div className="grid gap-6 lg:grid-cols-2 lg:items-start">
        <div className="space-y-6">
          <ProfileCard />
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
              value={screen.phase > 1 ? `Fase ${screen.phase}` : undefined}
            />
          ))}
        </GroupedList>
      </div>
    </>
  )
}
