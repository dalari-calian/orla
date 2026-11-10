import { currentCompetenceMonth, recurringIncomeForMonth, shareOfIncome } from '@orla/core'
import { formatBRL, percentOfCents } from '@orla/core/money'
import { savingsGoalSchema, type SavingsGoal } from '@orla/contracts'
import { Check, CreditCard as CardIcon, Landmark, Plus } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router'
import { LogoMark } from '@/components/layout/Logo'
import { Button } from '@/components/ui/Button'
import { TextField } from '@/components/ui/Field'
import { SelectField } from '@/components/ui/Select'
import { GroupedList, ListRow } from '@/components/ui/GroupedList'
import { MoneyInput } from '@/components/ui/MoneyInput'
import { SlideSwap } from '@/components/ui/SlideSwap'
import { SegmentedControl } from '@/components/ui/SegmentedControl'
import { Sheet } from '@/components/ui/Sheet'
import { ErrorState, Skeleton } from '@/components/ui/States'
import { useToast } from '@/components/ui/Toast'
import { accounts, categories, creditCards, useUpdateSettings } from '@/features/registrations/api'
import { useRecurringTemplateMutations, useRecurringTemplates } from '@/features/finances/api'
import { AccountForm, CreditCardForm } from '@/features/registrations/forms'
import {
  accountKindLabels,
  cardDaysLabel,
  institutionPresets,
} from '@/features/registrations/labels'
import { errorMessage } from '@/lib/api'
import { cn } from '@/lib/cn'

const STEPS = ['Contas', 'Cartões', 'Salário', 'Meta'] as const

/** "20%", "12,5%" — casas só quando precisa. */
const sharePercent = new Intl.NumberFormat('pt-BR', {
  style: 'percent',
  minimumFractionDigits: 0,
  maximumFractionDigits: 1,
})

function StepLayout({
  title,
  description,
  children,
  footer,
}: {
  title: string
  description: string
  children: ReactNode
  footer: ReactNode
}) {
  return (
    <>
      <div className="flex-1">
        <h1 className="text-large-title font-bold tracking-tight">{title}</h1>
        <p className="mt-2 text-body text-text-2">{description}</p>
        <div className="mt-6 space-y-5">{children}</div>
      </div>
      <div className="pb-safe sticky bottom-0 -mx-4 mt-8 space-y-2 bg-bg/90 px-4 pt-3 pb-4 backdrop-blur">
        {footer}
      </div>
    </>
  )
}

// ─── Passo 1: contas ─────────────────────────────────────────────────────────

function AccountsStep({ onNext }: { onNext: () => void }) {
  const list = accounts.useList()
  const { create, remove } = accounts.useMutations()
  const toast = useToast()
  const [customOpen, setCustomOpen] = useState(false)
  const [pending, setPending] = useState<string | null>(null)
  // Nome (minúsculo) → id da conta: o chip selecionado sabe qual conta remover.
  const existing = new Map(
    (list.data ?? []).map((account) => [account.name.toLocaleLowerCase('pt-BR'), account.id]),
  )
  const mutationOptions = {
    onError: (error: unknown) => toast({ message: errorMessage(error), tone: 'error' }),
    onSettled: () => setPending(null),
  }

  return (
    <StepLayout
      title="Onde está seu dinheiro?"
      description="Toque nos bancos, corretoras e carteiras que você usa (toque de novo para tirar). Dá para mudar tudo depois."
      footer={
        <Button block onClick={onNext}>
          {(list.data?.length ?? 0) > 0 ? 'Continuar' : 'Pular por enquanto'}
        </Button>
      }
    >
      <div className="flex flex-wrap gap-2" role="group" aria-label="Sugestões de contas">
        {institutionPresets.map((preset) => {
          const addedId = existing.get(preset.name.toLocaleLowerCase('pt-BR'))
          const added = addedId !== undefined
          return (
            <button
              key={preset.name}
              type="button"
              aria-pressed={added}
              // Um toque por vez: evita criar/remover em paralelo e sair de sincronia.
              disabled={pending !== null}
              onClick={() => {
                setPending(preset.name)
                if (addedId) remove.mutate(addedId, mutationOptions)
                else create.mutate(preset, mutationOptions)
              }}
              className={cn(
                'inline-flex min-h-11 items-center gap-2 rounded-full px-4 text-subhead font-medium transition-[background-color,color,transform] active:scale-95 motion-reduce:transition-none motion-reduce:active:scale-100',
                added
                  ? 'bg-accent text-white'
                  : 'bg-surface text-text shadow-card hover:bg-surface-2',
                pending === preset.name && 'opacity-60',
              )}
            >
              {added ? (
                <Check className="size-4" aria-hidden />
              ) : (
                <span
                  className="size-2.5 rounded-full"
                  style={{ backgroundColor: preset.color }}
                  aria-hidden
                />
              )}
              {preset.name}
            </button>
          )
        })}
        <button
          type="button"
          onClick={() => setCustomOpen(true)}
          className="inline-flex min-h-11 items-center gap-2 rounded-full border border-dashed border-text-3 px-4 text-subhead font-medium text-text-2 hover:text-text"
        >
          <Plus className="size-4" aria-hidden />
          Outra
        </button>
      </div>

      {list.isError && (
        <ErrorState description={errorMessage(list.error)} onRetry={() => void list.refetch()} />
      )}
      {(list.data?.length ?? 0) > 0 && (
        <GroupedList title="Suas contas">
          {list.data?.map((account) => (
            <ListRow
              key={account.id}
              icon={Landmark}
              iconColor={account.color}
              title={account.name}
              subtitle={accountKindLabels[account.kind]}
            />
          ))}
        </GroupedList>
      )}

      <Sheet open={customOpen} onClose={() => setCustomOpen(false)} title="Nova conta">
        {customOpen && (
          <AccountForm
            submitLabel="Adicionar"
            error={create.error}
            submitting={create.isPending}
            onSubmit={async (values) => {
              await create.mutateAsync(values)
              setCustomOpen(false)
            }}
          />
        )}
      </Sheet>
    </StepLayout>
  )
}

// ─── Passo 2: cartões ────────────────────────────────────────────────────────

function CardsStep({ onNext }: { onNext: () => void }) {
  const list = creditCards.useList()
  const accountList = accounts.useList()
  const { create } = creditCards.useMutations()
  const [open, setOpen] = useState(false)
  const activeAccounts = (accountList.data ?? []).filter((account) => !account.isArchived)
  const colorOf = new Map(activeAccounts.map((account) => [account.id, account.color]))

  return (
    <StepLayout
      title="Seus cartões de crédito"
      description="Com o dia de fechamento, o Orla coloca cada compra na fatura certa."
      footer={
        <Button block onClick={onNext}>
          {(list.data?.length ?? 0) > 0 ? 'Continuar' : 'Não uso cartão / pular'}
        </Button>
      }
    >
      {accountList.isSuccess && activeAccounts.length === 0 ? (
        <p className="rounded-card bg-surface p-4 text-body text-text-2 shadow-card">
          Para cadastrar um cartão, volte e adicione a conta do banco que o emite. Ou pule — dá para
          fazer depois em Configurações.
        </p>
      ) : (
        <>
          {(list.data?.length ?? 0) > 0 && (
            <GroupedList>
              {list.data?.map((card) => (
                <ListRow
                  key={card.id}
                  icon={CardIcon}
                  iconColor={colorOf.get(card.accountId) ?? 'var(--accent)'}
                  title={card.name}
                  subtitle={cardDaysLabel(card.closingDay, card.dueDay)}
                />
              ))}
            </GroupedList>
          )}
          <Button
            variant="secondary"
            block
            onClick={() => setOpen(true)}
            disabled={!accountList.isSuccess}
          >
            <Plus className="size-5" aria-hidden />
            Adicionar cartão
          </Button>
        </>
      )}

      <Sheet open={open} onClose={() => setOpen(false)} title="Novo cartão">
        {open && (
          <CreditCardForm
            accounts={activeAccounts}
            submitLabel="Adicionar"
            error={create.error}
            submitting={create.isPending}
            onSubmit={async (values) => {
              await create.mutateAsync(values)
              setOpen(false)
            }}
          />
        )}
      </Sheet>
    </StepLayout>
  )
}

// ─── Passo 3: salário base ───────────────────────────────────────────────────

function SalaryStep({ onNext }: { onNext: () => void }) {
  const templates = useRecurringTemplates()
  const accountList = accounts.useList()
  const categoryList = categories.useList()
  const createTemplate = useRecurringTemplateMutations().create
  const [amount, setAmount] = useState<number | null>(null)
  const [day, setDay] = useState('5')
  const [accountId, setAccountId] = useState('')
  const [error, setError] = useState<string | null>(null)

  const salary = templates.data?.find((template) => template.type === 'income')
  const salaryCategory = categoryList.data?.find(
    (category) => category.kind === 'income' && category.name === 'Salário',
  )

  const submit = () => {
    const dayOfMonth = Number(day)
    if (!amount || amount <= 0) return setError('Informe o valor do salário.')
    if (!Number.isInteger(dayOfMonth) || dayOfMonth < 1 || dayOfMonth > 31)
      return setError('Dia entre 1 e 31.')
    setError(null)
    createTemplate.mutate(
      {
        type: 'income',
        description: 'Salário',
        amountCents: amount,
        dayOfMonth,
        startMonth: currentCompetenceMonth(),
        categoryId: salaryCategory?.id ?? null,
        accountId: accountId || null,
      },
      { onSuccess: onNext, onError: (err) => setError(errorMessage(err)) },
    )
  }

  if (templates.isPending) {
    return <Skeleton className="h-40 w-full" />
  }

  if (salary) {
    return (
      <StepLayout
        title="Salário base"
        description="Seu salário já está cadastrado. Ele aparece todo mês como receita prevista."
        footer={
          <Button block onClick={onNext}>
            Continuar
          </Button>
        }
      >
        <GroupedList>
          <ListRow
            icon={Landmark}
            iconColor="var(--positive)"
            title={salary.description}
            subtitle={`Todo dia ${salary.dayOfMonth}`}
            value={formatBRL(salary.amountCents)}
          />
        </GroupedList>
      </StepLayout>
    )
  }

  return (
    <StepLayout
      title="Quanto você recebe?"
      description="Use a média do salário. Nos meses em que vier diferente, você ajusta só aquele mês."
      footer={
        <>
          <Button block onClick={submit} loading={createTemplate.isPending}>
            Salvar e continuar
          </Button>
          <Button block variant="plain" onClick={onNext}>
            Pular
          </Button>
        </>
      }
    >
      <MoneyInput label="Salário líquido" value={amount} onChange={setAmount} large autoFocus />
      <TextField
        label="Dia em que costuma cair"
        type="number"
        inputMode="numeric"
        min={1}
        max={31}
        value={day}
        onChange={(event) => setDay(event.target.value)}
      />
      {(accountList.data?.length ?? 0) > 0 && (
        <SelectField
          label="Cai em qual conta? (opcional)"
          value={accountId}
          onChange={(event) => setAccountId(event.target.value)}
        >
          <option value="">Não informar</option>
          {accountList.data
            ?.filter((account) => !account.isArchived)
            .map((account) => (
              <option key={account.id} value={account.id}>
                {account.name}
              </option>
            ))}
        </SelectField>
      )}
      {error && (
        <p role="alert" className="text-footnote text-negative">
          {error}
        </p>
      )}
    </StepLayout>
  )
}

// ─── Passo 4: meta de investimento ───────────────────────────────────────────

function GoalStep({
  onFinish,
  finishing,
  finishError,
}: {
  onFinish: (goal: SavingsGoal | null) => void
  finishing: boolean
  finishError: unknown
}) {
  const [mode, setMode] = useState<'fixed' | 'percent'>('fixed')
  const [amount, setAmount] = useState<number | null>(null)
  const [percent, setPercent] = useState('20')
  const [error, setError] = useState<string | null>(null)
  const templates = useRecurringTemplates()
  // Renda de referência: salários (e outras receitas recorrentes) do passo anterior.
  const incomeCents = recurringIncomeForMonth(templates.data ?? [], currentCompetenceMonth())

  const fixedHint = (() => {
    if (!amount || amount <= 0) return undefined
    const share = shareOfIncome(amount, incomeCents)
    if (share === null) return undefined
    return `Esse valor corresponde a ${sharePercent.format(share)} da sua renda (${formatBRL(incomeCents)}).`
  })()

  const percentHint = (() => {
    if (incomeCents <= 0) {
      return templates.isSuccess
        ? 'Cadastre o salário no passo anterior para ver quanto isso dá em reais.'
        : undefined
    }
    const parsed = savingsGoalSchema.safeParse({
      mode: 'percent',
      percent: percent.trim().replace(',', '.'),
    })
    if (!parsed.success || parsed.data.mode !== 'percent') return undefined
    const goalCents = percentOfCents(incomeCents, parsed.data.percent)
    return `Esse percentual corresponde a ${formatBRL(goalCents)} por mês da sua renda (${formatBRL(incomeCents)}).`
  })()

  const submit = () => {
    const candidate: SavingsGoal =
      mode === 'fixed'
        ? { mode: 'fixed', amountCents: amount ?? 0 }
        : { mode: 'percent', percent: percent.trim().replace(',', '.') }
    const parsed = savingsGoalSchema.safeParse(candidate)
    if (!parsed.success) return setError(parsed.error.issues[0]?.message ?? 'Valor inválido')
    if (mode === 'fixed' && !amount) return setError('Informe quanto quer investir por mês.')
    setError(null)
    onFinish(parsed.data)
  }

  return (
    <StepLayout
      title="Quanto quer investir por mês?"
      description="Essa meta sai da sua sobra do mês. Pode ser um valor fixo ou uma parte do que você recebe."
      footer={
        <>
          <Button block onClick={submit} loading={finishing}>
            Concluir
          </Button>
          <Button block variant="plain" onClick={() => onFinish(null)} disabled={finishing}>
            Definir depois
          </Button>
        </>
      }
    >
      <SegmentedControl
        label="Tipo de meta"
        value={mode}
        onChange={setMode}
        options={[
          { value: 'fixed', label: 'Valor fixo' },
          { value: 'percent', label: '% da renda' },
        ]}
      />
      <SlideSwap index={mode === 'fixed' ? 0 : 1}>
        {mode === 'fixed' ? (
          <MoneyInput
            label="Meta mensal"
            value={amount}
            onChange={setAmount}
            large
            hint={fixedHint && <span aria-live="polite">{fixedHint}</span>}
          />
        ) : (
          <TextField
            label="Percentual das receitas do mês"
            inputMode="decimal"
            value={percent}
            onChange={(event) => setPercent(event.target.value)}
            hint={percentHint && <span aria-live="polite">{percentHint}</span>}
            trailing={<span className="pr-3 text-body text-text-2">%</span>}
          />
        )}
      </SlideSwap>
      {(error !== null || finishError != null) && (
        <p role="alert" className="text-footnote text-negative">
          {error ?? errorMessage(finishError)}
        </p>
      )}
    </StepLayout>
  )
}

// ─── Página ──────────────────────────────────────────────────────────────────

/** Primeiro acesso (doc 10 › Onboarding, passos 1–4). Tudo pulável e editável depois. */
export function OnboardingPage() {
  const [step, setStep] = useState(0)
  const updateSettings = useUpdateSettings()
  const navigate = useNavigate()
  const next = () => {
    setStep((current) => Math.min(current + 1, STEPS.length - 1))
    window.scrollTo({ top: 0 })
  }

  const finish = (goal: SavingsGoal | null) => {
    updateSettings.mutate(
      { onboardingCompleted: true, ...(goal && { savingsGoal: goal }) },
      { onSuccess: () => navigate('/', { replace: true }) },
    )
  }

  return (
    <div className="pt-safe mx-auto flex min-h-dvh w-full max-w-xl flex-col px-4">
      <header className="flex items-center justify-between py-4">
        <div className="flex items-center gap-3">
          <LogoMark className="size-8" />
          <span className="text-footnote font-medium text-text-2">
            Passo {step + 1} de {STEPS.length}
          </span>
        </div>
        <Button variant="plain" onClick={() => finish(null)} disabled={updateSettings.isPending}>
          Pular tudo
        </Button>
      </header>

      <ol className="mb-8 grid grid-cols-4 gap-2" aria-label="Progresso">
        {STEPS.map((label, index) => (
          <li key={label} className="space-y-1.5">
            <div className={cn('h-1 rounded-full', index <= step ? 'bg-accent' : 'bg-separator')} />
            <button
              type="button"
              onClick={() => index < step && setStep(index)}
              disabled={index >= step}
              aria-current={index === step ? 'step' : undefined}
              className={cn(
                'text-caption',
                index === step ? 'font-semibold text-text' : 'text-text-2',
              )}
            >
              {label}
            </button>
          </li>
        ))}
      </ol>

      {step === 0 && <AccountsStep onNext={next} />}
      {step === 1 && <CardsStep onNext={next} />}
      {step === 2 && <SalaryStep onNext={next} />}
      {step === 3 && (
        <GoalStep
          onFinish={finish}
          finishing={updateSettings.isPending}
          finishError={updateSettings.error}
        />
      )}
    </div>
  )
}
