import type { CarryoverMode } from '@orla/core'
import { updateProfileRequestSchema, type UpdateProfileRequest } from '@orla/contracts'
import { useQueryClient } from '@tanstack/react-query'
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
import { ErrorState, Skeleton } from '@/components/ui/States'
import { useLogout, useMe, useUpdateProfile } from '@/features/auth/api'
import { invalidateFinances } from '@/features/finances/api'
import { useSettings, useUpdateSettings } from '@/features/registrations/api'
import { errorMessage } from '@/lib/api'
import { zodResolver } from '@/lib/form'
import { useTheme, type ThemePreference } from '@/lib/theme'
import { CURRENT_PHASE, screensOf } from '@/routes/screens'

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

const carryoverOptions = [
  { value: 'ask', label: 'Perguntar' },
  { value: 'auto', label: 'Automático' },
  { value: 'off', label: 'Nunca' },
] as const satisfies readonly { value: CarryoverMode; label: string }[]

const carryoverHelp: Record<CarryoverMode, string> = {
  ask: 'Na virada do mês, o Orla mostra quanto sobrou (ou faltou) e você decide se leva para o mês seguinte.',
  auto: 'Quando o mês termina, o saldo entra sozinho no mês seguinte e se ajusta se o mês anterior mudar.',
  off: 'Cada mês começa do zero. Você ainda pode lançar o saldo à mão como receita.',
}

/** RF-54: levar o saldo do mês anterior — perguntar (padrão), automático ou nunca. */
function CarryoverModeCard() {
  const settings = useSettings()
  const update = useUpdateSettings()
  const queryClient = useQueryClient()
  const toast = useToast()
  const mode = settings.data?.carryoverMode ?? 'ask'

  return (
    <Card>
      <CardHeader title="Saldo do mês anterior" />
      {settings.isPending ? (
        <Skeleton className="h-11 w-full" />
      ) : settings.isError ? (
        <ErrorState
          description={errorMessage(settings.error)}
          onRetry={() => void settings.refetch()}
        />
      ) : (
        <div className="space-y-3">
          <SegmentedControl
            label="Levar o que sobrou para o mês seguinte"
            options={carryoverOptions}
            value={mode}
            onChange={(value) =>
              update.mutate(
                { carryoverMode: value },
                {
                  onSuccess: () => void invalidateFinances(queryClient),
                  onError: (error) => toast({ message: errorMessage(error), tone: 'error' }),
                },
              )
            }
          />
          <p className="text-footnote text-text-2">{carryoverHelp[mode]}</p>
        </div>
      )}
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
          <CarryoverModeCard />
          <SystemStatus />
        </div>

        <GroupedList title="Cadastros e dados">
          {screensOf('config').map((screen) => (
            <ListRow
              key={screen.path}
              to={screen.path}
              icon={screen.icon}
              title={screen.title}
              value={screen.phase > CURRENT_PHASE ? `Fase ${screen.phase}` : undefined}
            />
          ))}
        </GroupedList>
      </div>
    </>
  )
}
