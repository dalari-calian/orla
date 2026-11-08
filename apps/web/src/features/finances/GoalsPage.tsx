import { savingsGoalSchema, type SavingsGoal, type SettingsResponse } from '@orla/contracts'
import { Target } from 'lucide-react'
import { useState } from 'react'
import { PageHeader } from '@/components/layout/PageHeader'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { TextField } from '@/components/ui/Field'
import { MoneyInput } from '@/components/ui/MoneyInput'
import { SegmentedControl } from '@/components/ui/SegmentedControl'
import { ErrorState, Skeleton } from '@/components/ui/States'
import { useToast } from '@/components/ui/Toast'
import { useSettings, useUpdateSettings } from '@/features/registrations/api'
import { errorMessage } from '@/lib/api'

type Mode = SavingsGoal['mode']

function GoalForm({ settings }: { settings: SettingsResponse }) {
  const update = useUpdateSettings()
  const toast = useToast()
  const goal = settings.savingsGoal
  const [mode, setMode] = useState<Mode>(goal.mode)
  const [amount, setAmount] = useState<number | null>(
    goal.mode === 'fixed' ? goal.amountCents : null,
  )
  const [percent, setPercent] = useState(
    goal.mode === 'percent' ? goal.percent.replace('.', ',') : '20',
  )
  const [error, setError] = useState<string | null>(null)

  function save() {
    const candidate: SavingsGoal =
      mode === 'fixed'
        ? { mode: 'fixed', amountCents: amount ?? 0 }
        : mode === 'percent'
          ? { mode: 'percent', percent: percent.trim().replace(',', '.') }
          : { mode: 'none' }
    const parsed = savingsGoalSchema.safeParse(candidate)
    if (!parsed.success) return setError(parsed.error.issues[0]?.message ?? 'Valor inválido')
    if (mode === 'fixed' && !amount) return setError('Informe quanto quer investir por mês.')
    setError(null)
    update.mutate(
      { savingsGoal: parsed.data },
      { onSuccess: () => toast({ message: 'Meta salva' }) },
    )
  }

  return (
    <Card className="space-y-4">
      <div className="flex items-center gap-3">
        <span className="flex size-10 items-center justify-center rounded-full bg-accent/12 text-accent">
          <Target className="size-5" aria-hidden />
        </span>
        <div>
          <h2 className="text-headline font-semibold">Meta de investimento</h2>
          <p className="text-footnote text-text-2">
            Sai da sobra de cada mês. Dá para trocar só um mês na tela de Finanças.
          </p>
        </div>
      </div>
      <SegmentedControl
        label="Tipo de meta"
        value={mode}
        onChange={setMode}
        options={[
          { value: 'fixed', label: 'Valor fixo' },
          { value: 'percent', label: '% da renda' },
          { value: 'none', label: 'Sem meta' },
        ]}
      />
      {mode === 'fixed' && (
        <MoneyInput label="Meta mensal" value={amount} onChange={setAmount} large />
      )}
      {mode === 'percent' && (
        <TextField
          label="Percentual das entradas do mês"
          inputMode="decimal"
          value={percent}
          onChange={(event) => setPercent(event.target.value)}
          trailing={<span className="pr-3 text-body text-text-2">%</span>}
          hint="Inclui receitas extras do mês (presente, bônus)."
        />
      )}
      {(error !== null || update.error) && (
        <p role="alert" className="text-footnote text-negative">
          {error ?? errorMessage(update.error)}
        </p>
      )}
      <Button block loading={update.isPending} onClick={save}>
        Salvar
      </Button>
    </Card>
  )
}

/** /config/metas — meta de investimento (RF-50). A alocação por classe chega com a Carteira. */
export function GoalsPage() {
  const settings = useSettings()
  return (
    <>
      <PageHeader title="Metas" back={{ to: '/config', label: 'Ajustes' }} />
      <div className="max-w-xl space-y-6">
        {settings.data ? (
          <GoalForm settings={settings.data} />
        ) : settings.isError ? (
          <Card>
            <ErrorState
              description={errorMessage(settings.error)}
              onRetry={() => void settings.refetch()}
            />
          </Card>
        ) : (
          <Skeleton className="h-64 rounded-card" />
        )}
        <p className="px-4 text-footnote text-text-2">
          Alocação ideal por classe (FIIs, Ações, Renda Fixa...) chega junto com a Carteira (Fase
          5).
        </p>
      </div>
    </>
  )
}
