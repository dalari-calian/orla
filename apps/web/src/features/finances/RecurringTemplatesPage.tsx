import { currentCompetenceMonth } from '@orla/core'
import { formatBRL } from '@orla/core/money'
import {
  createRecurringTemplateRequestSchema,
  type CreateRecurringTemplateRequest,
  type PaymentMethod,
  type RecurringTemplate,
} from '@orla/contracts'
import { Plus, Repeat } from 'lucide-react'
import { useMemo, useState, type ReactNode } from 'react'
import { PageHeader } from '@/components/layout/PageHeader'
import { Button } from '@/components/ui/Button'
import { categoryIcons } from '@/components/ui/CategoryIcon'
import { ChipGroup } from '@/components/ui/Chips'
import { TextField } from '@/components/ui/Field'
import { MonthField } from '@/components/ui/MonthField'
import { SelectField } from '@/components/ui/Select'
import { GroupedList, ListRow } from '@/components/ui/GroupedList'
import { MoneyInput } from '@/components/ui/MoneyInput'
import { SlideSwap } from '@/components/ui/SlideSwap'
import { SegmentedControl } from '@/components/ui/SegmentedControl'
import { Sheet } from '@/components/ui/Sheet'
import { EmptyState, ErrorState, Skeleton } from '@/components/ui/States'
import { useToast } from '@/components/ui/Toast'
import { accounts, categories, creditCards } from '@/features/registrations/api'
import { errorMessage } from '@/lib/api'
import { useRecurringTemplateMutations, useRecurringTemplates } from './api'
import { apiFieldErrors, categoryOptions, zodFieldErrors, type FieldErrors } from './form-utils'
import { monthNames, paymentMethodLabels, shortMonthLabel } from './labels'

const methods: PaymentMethod[] = ['pix', 'debit', 'credit', 'boleto', 'transfer', 'cash', 'other']

function describe(template: RecurringTemplate): string {
  const when =
    template.frequency === 'yearly'
      ? `todo ${monthNames[(template.monthOfYear ?? 1) - 1]}, dia ${template.dayOfMonth}`
      : `todo dia ${template.dayOfMonth}`
  const until = template.endMonth ? ` · até ${shortMonthLabel(template.endMonth)}` : ''
  return `${when} · desde ${shortMonthLabel(template.startMonth)}${until}${template.isActive ? '' : ' · pausado'}`
}

export type RecurringKind = 'income' | 'fixed' | 'planned'
type Kind = RecurringKind

export function TemplateForm({
  initial,
  initialKind = 'fixed',
  submitting,
  error,
  onSubmit,
  extra,
}: {
  initial?: RecurringTemplate | undefined
  /** Tipo já escolhido ao abrir um modelo novo (atalhos do Início e de Finanças). */
  initialKind?: Kind
  submitting: boolean
  error: unknown
  onSubmit: (
    values: CreateRecurringTemplateRequest & { applyFromMonth?: string },
  ) => Promise<unknown>
  extra?: ReactNode
}) {
  const categoryList = categories.useList()
  const cardList = creditCards.useList()
  const accountList = accounts.useList()
  const editing = Boolean(initial)

  const [kind, setKind] = useState<Kind>(
    initial
      ? initial.type === 'income'
        ? 'income'
        : initial.nature === 'planned'
          ? 'planned'
          : 'fixed'
      : initialKind,
  )
  const type = kind === 'income' ? 'income' : 'expense'
  const [description, setDescription] = useState(initial?.description ?? '')
  const [amountCents, setAmountCents] = useState<number | null>(initial?.amountCents ?? null)
  const [categoryId, setCategoryId] = useState<string | null>(initial?.categoryId ?? null)
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod | null>(
    initial?.paymentMethod ?? null,
  )
  const [creditCardId, setCreditCardId] = useState(initial?.creditCardId ?? '')
  const [accountId, setAccountId] = useState(initial?.accountId ?? '')
  const [frequency, setFrequency] = useState(
    initial?.frequency ?? (kind === 'planned' ? 'yearly' : 'monthly'),
  )
  const [monthOfYear, setMonthOfYear] = useState(
    String(initial?.monthOfYear ?? new Date().getMonth() + 1),
  )
  const [day, setDay] = useState(String(initial?.dayOfMonth ?? 5))
  const [startMonth, setStartMonth] = useState<string>(
    initial?.startMonth ?? currentCompetenceMonth(),
  )
  const [endMonth, setEndMonth] = useState(initial?.endMonth ?? '')
  const [isActive, setIsActive] = useState(initial?.isActive ?? true)
  const [applyFromMonth, setApplyFromMonth] = useState<string>(currentCompetenceMonth())
  const [errors, setErrors] = useState<FieldErrors>({})

  const options = useMemo(
    () => categoryOptions(categoryList.data ?? [], type),
    [categoryList.data, type],
  )
  const isCredit = paymentMethod === 'credit'

  async function submit() {
    setErrors({})
    const values: CreateRecurringTemplateRequest = {
      type,
      nature: kind === 'planned' ? 'planned' : 'fixed',
      description: description.trim(),
      amountCents: amountCents ?? 0,
      categoryId,
      paymentMethod,
      creditCardId: isCredit ? creditCardId || null : null,
      accountId: accountId || null,
      frequency,
      monthOfYear: frequency === 'yearly' ? Number(monthOfYear) : null,
      dayOfMonth: Number(day),
      startMonth,
      endMonth: endMonth || null,
      isActive,
    }
    const check = createRecurringTemplateRequestSchema.safeParse(values)
    if (!check.success) return setErrors(zodFieldErrors(check.error))
    try {
      await onSubmit(editing ? { ...values, applyFromMonth } : values)
    } catch (err) {
      const fields = apiFieldErrors(err)
      if (fields) setErrors(fields)
    }
  }

  return (
    <form
      noValidate
      className="space-y-4"
      onSubmit={(event) => {
        event.preventDefault()
        void submit()
      }}
    >
      {!editing && (
        <SegmentedControl
          label="Tipo"
          value={kind}
          onChange={(next) => {
            setKind(next)
            setCategoryId(null)
            if (next === 'planned') setFrequency('yearly')
          }}
          options={[
            { value: 'income', label: 'Receita' },
            { value: 'fixed', label: 'Conta fixa' },
            { value: 'planned', label: 'Planejamento' },
          ]}
        />
      )}
      <SlideSwap index={['income', 'fixed', 'planned'].indexOf(kind)} className="space-y-4">
        <MoneyInput
          label={kind === 'income' ? 'Valor (média)' : 'Valor'}
          value={amountCents}
          onChange={setAmountCents}
          error={errors.amountCents}
          large
        />
        <TextField
          label="Descrição"
          placeholder={
            kind === 'income'
              ? 'Ex.: Salário'
              : kind === 'planned'
                ? 'Ex.: Aniversário'
                : 'Ex.: Aluguel'
          }
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          error={errors.description}
          autoComplete="off"
        />
        <SegmentedControl
          label="Frequência"
          value={frequency}
          onChange={setFrequency}
          options={[
            { value: 'monthly', label: 'Todo mês' },
            { value: 'yearly', label: 'Todo ano' },
          ]}
        />
        <SlideSwap index={frequency === 'monthly' ? 0 : 1} className="grid grid-cols-2 gap-3">
          {frequency === 'yearly' && (
            <SelectField
              label="Mês"
              value={monthOfYear}
              onChange={(event) => setMonthOfYear(event.target.value)}
              error={errors.monthOfYear}
            >
              {monthNames.map((name, index) => (
                <option key={name} value={index + 1}>
                  {name}
                </option>
              ))}
            </SelectField>
          )}
          <TextField
            label="Dia"
            type="number"
            inputMode="numeric"
            min={1}
            max={31}
            value={day}
            onChange={(event) => setDay(event.target.value)}
            error={errors.dayOfMonth}
          />
        </SlideSwap>
        <ChipGroup
          label="Categoria"
          allowClear
          value={categoryId}
          onChange={setCategoryId}
          error={errors.categoryId}
          options={options.map(({ category, label }) => ({
            value: category.id,
            label,
            icon: categoryIcons[category.icon],
            color: category.color,
          }))}
        />
        {type === 'expense' && (
          <ChipGroup
            label="Forma de pagamento"
            allowClear
            value={paymentMethod}
            onChange={setPaymentMethod}
            error={errors.paymentMethod}
            options={methods.map((method) => ({
              value: method,
              label: paymentMethodLabels[method],
            }))}
          />
        )}
        {isCredit ? (
          <SelectField
            label="Cartão"
            value={creditCardId}
            onChange={(event) => setCreditCardId(event.target.value)}
            error={errors.creditCardId}
          >
            <option value="">Escolha o cartão</option>
            {(cardList.data ?? []).map((card) => (
              <option key={card.id} value={card.id}>
                {card.name}
              </option>
            ))}
          </SelectField>
        ) : (
          <SelectField
            label={type === 'income' ? 'Conta onde entra' : 'Conta de onde sai'}
            value={accountId}
            onChange={(event) => setAccountId(event.target.value)}
            error={errors.accountId}
          >
            <option value="">Não informar</option>
            {(accountList.data ?? [])
              .filter((account) => !account.isArchived || account.id === accountId)
              .map((account) => (
                <option key={account.id} value={account.id}>
                  {account.name}
                </option>
              ))}
          </SelectField>
        )}
      </SlideSwap>
      <MonthField
        label="Começa em"
        value={startMonth}
        onChange={setStartMonth}
        error={errors.startMonth}
      />
      <MonthField
        label="Termina em (opcional)"
        value={endMonth}
        onChange={setEndMonth}
        error={errors.endMonth}
        clearable
        placeholder="Sem data para acabar"
      />
      {editing && (
        <>
          <label className="flex min-h-11 items-center justify-between gap-3 px-1 text-body">
            Ativo (gera lançamentos)
            <input
              type="checkbox"
              className="size-5 accent-[var(--accent)]"
              checked={isActive}
              onChange={(event) => setIsActive(event.target.checked)}
            />
          </label>
          <MonthField
            label="Aplicar a partir de"
            value={applyFromMonth}
            onChange={setApplyFromMonth}
            hint="Os lançamentos previstos desse mês em diante mudam; meses anteriores, valores já pagos/recebidos e valores editados à mão continuam como estão."
          />
        </>
      )}
      {error !== null && error !== undefined && !apiFieldErrors(error) && (
        <p role="alert" className="text-footnote text-negative">
          {errorMessage(error)}
        </p>
      )}
      <Button type="submit" block loading={submitting}>
        {editing ? 'Salvar' : 'Criar modelo'}
      </Button>
      {extra && <div className="flex flex-wrap justify-center gap-2">{extra}</div>}
    </form>
  )
}

/** /config/recorrentes — salário base, contas fixas e planejamentos anuais (docs/10). */
export function RecurringTemplatesPage() {
  const list = useRecurringTemplates()
  const { create, update, remove, restore } = useRecurringTemplateMutations()
  const categoryList = categories.useList()
  const toast = useToast()
  const [editing, setEditing] = useState<RecurringTemplate | 'new' | null>(null)
  const [deleting, setDeleting] = useState<RecurringTemplate | null>(null)
  const [removeFuture, setRemoveFuture] = useState(true)
  const current = editing !== 'new' ? editing : null
  const categoryById = new Map((categoryList.data ?? []).map((category) => [category.id, category]))

  const close = () => {
    setEditing(null)
    create.reset()
    update.reset()
  }

  const groups = [
    { title: 'Receitas', items: list.data?.filter((t) => t.type === 'income') ?? [] },
    {
      title: 'Contas fixas',
      items: list.data?.filter((t) => t.type === 'expense' && t.nature === 'fixed') ?? [],
    },
    { title: 'Planejamentos', items: list.data?.filter((t) => t.nature === 'planned') ?? [] },
  ]

  function confirmDelete(template: RecurringTemplate) {
    const fromMonth = removeFuture ? currentCompetenceMonth() : undefined
    remove.mutate(
      { id: template.id, removeFromMonth: fromMonth },
      {
        onSuccess: () => {
          setDeleting(null)
          close()
          toast({
            message: 'Modelo excluído',
            action: {
              label: 'Desfazer',
              onClick: () =>
                restore.mutate(template.id, {
                  onError: (error) => toast({ message: errorMessage(error), tone: 'error' }),
                }),
            },
          })
        },
        onError: (error) => toast({ message: errorMessage(error), tone: 'error' }),
      },
    )
  }

  return (
    <>
      <PageHeader
        title="Recorrentes"
        back={{ to: '/config', label: 'Ajustes' }}
        subtitle="Aparecem como previstos em todos os meses."
        actions={
          <Button
            variant="plain"
            className="px-3"
            aria-label="Novo modelo"
            onClick={() => setEditing('new')}
          >
            <Plus className="size-5" aria-hidden />
            <span className="hidden sm:inline">Novo modelo</span>
          </Button>
        }
      />

      {list.isPending ? (
        <Skeleton className="h-40 rounded-card" />
      ) : list.isError ? (
        <div className="rounded-card bg-surface p-4 shadow-card">
          <ErrorState description={errorMessage(list.error)} onRetry={() => void list.refetch()} />
        </div>
      ) : list.data.length === 0 ? (
        <div className="rounded-card bg-surface shadow-card">
          <EmptyState
            icon={Repeat}
            title="Nenhum modelo ainda"
            description="Cadastre o salário, o aluguel, as assinaturas e planejamentos anuais (como o seu aniversário). Eles entram sozinhos em cada mês."
            action={<Button onClick={() => setEditing('new')}>Criar modelo</Button>}
          />
        </div>
      ) : (
        <div className="space-y-6">
          {groups
            .filter((group) => group.items.length > 0)
            .map((group) => (
              <GroupedList key={group.title} title={group.title}>
                {group.items.map((template) => {
                  const category = template.categoryId
                    ? categoryById.get(template.categoryId)
                    : undefined
                  return (
                    <ListRow
                      key={template.id}
                      icon={category ? categoryIcons[category.icon] : Repeat}
                      iconColor={category?.color}
                      title={template.description}
                      subtitle={describe(template)}
                      value={formatBRL(template.amountCents)}
                      muted={!template.isActive}
                      onClick={() => setEditing(template)}
                    />
                  )
                })}
              </GroupedList>
            ))}
        </div>
      )}

      <Sheet
        open={editing !== null}
        onClose={close}
        title={current ? 'Editar modelo' : 'Novo modelo'}
      >
        {editing !== null && (
          <TemplateForm
            key={current?.id ?? 'new'}
            initial={current ?? undefined}
            submitting={create.isPending || update.isPending}
            error={current ? update.error : create.error}
            onSubmit={async ({ type: _type, ...values }) => {
              if (current) await update.mutateAsync({ id: current.id, ...values })
              else await create.mutateAsync({ type: _type, ...values })
              toast({ message: current ? 'Modelo atualizado' : 'Modelo criado' })
              close()
            }}
            extra={
              current && (
                <Button variant="destructive" onClick={() => setDeleting(current)}>
                  Excluir
                </Button>
              )
            }
          />
        )}
      </Sheet>

      <Sheet open={deleting !== null} onClose={() => setDeleting(null)} title="Excluir modelo">
        {deleting && (
          <div className="space-y-4">
            <p className="text-subhead text-text-2">
              "{deleting.description}" deixa de gerar lançamentos. O que já foi pago ou recebido
              continua no histórico.
            </p>
            <label className="flex min-h-11 items-center justify-between gap-3 text-body">
              Remover também os previstos a partir de {shortMonthLabel(currentCompetenceMonth())}
              <input
                type="checkbox"
                className="size-5 shrink-0 accent-[var(--accent)]"
                checked={removeFuture}
                onChange={(event) => setRemoveFuture(event.target.checked)}
              />
            </label>
            <Button
              block
              variant="destructive"
              className="bg-negative/10"
              loading={remove.isPending}
              onClick={() => confirmDelete(deleting)}
            >
              Excluir modelo
            </Button>
          </div>
        )}
      </Sheet>
    </>
  )
}
