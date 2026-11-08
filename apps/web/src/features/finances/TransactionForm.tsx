import {
  isIsoDate,
  isoDateToCompetenceMonth,
  statementCompetenceMonth,
  todayIsoDate,
} from '@orla/core'
import {
  createTransactionRequestSchema,
  updateTransactionRequestSchema,
  type CreateTransactionRequest,
  type PaymentMethod,
  type Transaction,
  type TransactionType,
} from '@orla/contracts'
import { useQueryClient } from '@tanstack/react-query'
import { ChevronDown } from 'lucide-react'
import { useId, useMemo, useState, type ReactNode } from 'react'
import { Button } from '@/components/ui/Button'
import { categoryIcons } from '@/components/ui/CategoryIcon'
import { ChipGroup } from '@/components/ui/Chips'
import { TextField } from '@/components/ui/Field'
import { MonthField } from '@/components/ui/MonthField'
import { SelectField } from '@/components/ui/Select'
import { MoneyInput } from '@/components/ui/MoneyInput'
import {
  accounts,
  categories,
  creditCards,
  payees,
  useSettings,
} from '@/features/registrations/api'
import { errorMessage } from '@/lib/api'
import { fetchPayeeSuggestion, useMonth } from './api'
import { apiFieldErrors, categoryOptions, zodFieldErrors, type FieldErrors } from './form-utils'
import { paymentMethodLabels } from './labels'

export type TransactionKind = 'expense' | 'income' | 'planned'

const methodOrder: PaymentMethod[] = [
  'pix',
  'credit',
  'debit',
  'cash',
  'boleto',
  'transfer',
  'other',
]

/** Valores que o formulário entrega: o request de criação (o PATCH usa o mesmo formato). */
export type TransactionFormValues = CreateTransactionRequest

interface Props {
  kind: TransactionKind
  /** Lançamento em edição (ou modelo para "lançar de novo"). */
  initial?: Transaction | undefined
  editing: boolean
  submitting: boolean
  error: unknown
  onSubmit: (values: TransactionFormValues) => Promise<unknown>
  extra?: ReactNode
}

/**
 * Formulário de despesa / receita / planejamento em uma tela (RM-02): valor grande no
 * topo, descrição, categoria em chips, forma de pagamento, conta/cartão, estabelecimento
 * com autocomplete (cria na hora se não existir) e data. Avançados recolhidos.
 */
export function TransactionForm({
  kind,
  initial,
  editing,
  submitting,
  error,
  onSubmit,
  extra,
}: Props) {
  const queryClient = useQueryClient()
  const categoryList = categories.useList()
  const cardList = creditCards.useList()
  const accountList = accounts.useList()
  const payeeList = payees.useList()
  const payeeMutations = payees.useMutations()
  const payeeListId = useId()

  const type: TransactionType = kind === 'income' ? 'income' : 'expense'
  const generated = Boolean(initial?.recurringTemplateId || initial?.installmentPlanId)
  const initialPayee = payeeList.data?.find((payee) => payee.id === initial?.payeeId)

  const [amountCents, setAmountCents] = useState<number | null>(initial?.amountCents ?? null)
  const [description, setDescription] = useState(initial?.description ?? '')
  const [categoryId, setCategoryId] = useState<string | null>(initial?.categoryId ?? null)
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod | null>(
    initial?.paymentMethod ?? (type === 'expense' && kind !== 'planned' ? 'pix' : null),
  )
  const [creditCardId, setCreditCardId] = useState<string>(initial?.creditCardId ?? '')
  const [accountId, setAccountId] = useState<string>(initial?.accountId ?? '')
  const [payeeName, setPayeeName] = useState<string | null>(null)
  const [date, setDate] = useState<string>(initial?.date && editing ? initial.date : todayIsoDate())
  // Só vai na requisição se o usuário escolher; senão a API calcula pela data/fatura.
  const [competenceMonth, setCompetenceMonth] = useState('')
  const [settled, setSettled] = useState<boolean | null>(
    editing ? initial?.status === 'settled' : null,
  )
  const [parentPlannedId, setParentPlannedId] = useState(initial?.parentPlannedId ?? '')
  const [notes, setNotes] = useState(initial?.notes ?? '')
  const [errors, setErrors] = useState<FieldErrors>({})
  const [touched, setTouched] = useState({ category: Boolean(initial), method: Boolean(initial) })

  const payeeText = payeeName ?? initialPayee?.name ?? ''
  // Planejamentos do mês da data, para vincular o gasto (RF-22). A consulta do mês fica em cache.
  const dateMonth = isIsoDate(date)
    ? isoDateToCompetenceMonth(date)
    : isoDateToCompetenceMonth(todayIsoDate())
  const monthQuery = useMonth(
    initial?.competenceMonth && editing ? initial.competenceMonth : dateMonth,
  )
  const plannedOptions = (monthQuery.data?.transactions ?? []).filter(
    (item) => item.nature === 'planned' && item.type === 'expense' && item.id !== initial?.id,
  )
  const options = useMemo(
    () => categoryOptions(categoryList.data ?? [], type),
    [categoryList.data, type],
  )
  const activeAccounts = (accountList.data ?? []).filter(
    (account) => !account.isArchived || account.id === accountId,
  )
  const cards = cardList.data ?? []
  const isCredit = paymentMethod === 'credit'
  const settings = useSettings()

  // Mês em que o lançamento entra quando o usuário não escolhe (mesma regra da API, RF-02/03).
  const selectedCard = cards.find((card) => card.id === creditCardId)
  const linkedPlanned = plannedOptions.find((option) => option.id === parentPlannedId)
  const automaticMonth = linkedPlanned
    ? { month: linkedPlanned.competenceMonth, note: 'Mesmo mês do planejamento vinculado.' }
    : editing && generated && initial
      ? { month: initial.competenceMonth, note: 'Mês em que o lançamento foi gerado.' }
      : isCredit && selectedCard && isIsoDate(date)
        ? {
            month: statementCompetenceMonth(
              date,
              selectedCard,
              settings.data?.cardCompetence ?? 'due_month',
            ),
            note: `Pela fatura do ${selectedCard.name}. Toque nas setas para mudar.`,
          }
        : { month: dateMonth, note: 'Pelo mês da data. Toque nas setas para mudar.' }

  /** RM-03: escolheu um estabelecimento conhecido → preenche o que o usuário ainda não mexeu. */
  async function onPayeeChange(text: string) {
    setPayeeName(text)
    const match = payeeList.data?.find(
      (payee) => payee.name.toLocaleLowerCase('pt-BR') === text.trim().toLocaleLowerCase('pt-BR'),
    )
    if (!match || editing) return
    try {
      const suggestion = await fetchPayeeSuggestion(queryClient, match.id)
      if (!touched.category && suggestion.categoryId) setCategoryId(suggestion.categoryId)
      if (!touched.method && suggestion.paymentMethod) {
        setPaymentMethod(suggestion.paymentMethod)
        if (suggestion.creditCardId) setCreditCardId(suggestion.creditCardId)
      }
      if (suggestion.accountId && !accountId) setAccountId(suggestion.accountId)
      if (!description.trim()) setDescription(match.name)
    } catch {
      // Sugestão é só conveniência: sem ela o formulário segue normal.
    }
  }

  /** Estabelecimento digitado: o existente, ou cria um novo na hora. */
  async function resolvePayeeId(): Promise<string | null> {
    const text = payeeText.trim()
    if (!text) return null
    const match = payeeList.data?.find(
      (payee) => payee.name.toLocaleLowerCase('pt-BR') === text.toLocaleLowerCase('pt-BR'),
    )
    if (match) return match.id
    const created = await payeeMutations.create.mutateAsync({
      name: text,
      defaultCategoryId: categoryId,
    })
    return created.id
  }

  async function submit() {
    setErrors({})
    const nature =
      initial?.nature ?? (kind === 'planned' ? 'planned' : kind === 'income' ? 'extra' : 'variable')
    const draft = {
      type,
      nature: nature === 'installment' ? 'variable' : nature,
      description: description.trim(),
      amountCents: amountCents ?? 0,
      date,
      categoryId,
      paymentMethod,
      creditCardId: isCredit ? creditCardId || null : null,
      accountId: accountId || null,
      parentPlannedId: parentPlannedId || null,
      notes: notes.trim() || null,
      ...(settled !== null && { status: settled ? ('settled' as const) : ('forecast' as const) }),
      ...(competenceMonth && { competenceMonth }),
    }
    const check = editing
      ? updateTransactionRequestSchema.safeParse(draft)
      : createTransactionRequestSchema.safeParse(draft)
    if (!check.success) return setErrors(zodFieldErrors(check.error))
    if (isCredit && !creditCardId) return setErrors({ creditCardId: 'Escolha o cartão' })

    try {
      const payeeId = await resolvePayeeId()
      const values: TransactionFormValues = { ...draft, payeeId }
      if (editing && initial) {
        // Só manda data/forma/cartão se mudaram: a API recalcula a competência quando mudam.
        const partial = values as Partial<TransactionFormValues>
        if (values.date === initial.date) delete partial.date
        if (values.paymentMethod === initial.paymentMethod) delete partial.paymentMethod
        if ((values.creditCardId ?? null) === initial.creditCardId) delete partial.creditCardId
      }
      if (editing && generated) {
        // Parcelas e lançamentos de modelo não mudam de tipo/natureza.
        delete (values as Partial<TransactionFormValues>).type
        delete (values as Partial<TransactionFormValues>).nature
      }
      await onSubmit(values)
    } catch (err) {
      const fields = apiFieldErrors(err)
      if (fields) setErrors(fields)
    }
  }

  const amountLabel =
    kind === 'income'
      ? 'Quanto você recebeu'
      : kind === 'planned'
        ? 'Quanto reservar'
        : 'Quanto você gastou'

  return (
    <form
      noValidate
      className="space-y-4"
      onSubmit={(event) => {
        event.preventDefault()
        void submit()
      }}
    >
      <MoneyInput
        label={amountLabel}
        value={amountCents}
        onChange={setAmountCents}
        error={errors.amountCents}
        large
        autoFocus={!editing}
      />

      <TextField
        label="Descrição"
        placeholder={
          kind === 'planned'
            ? 'Ex.: Meu aniversário'
            : kind === 'income'
              ? 'Ex.: Presente da vó'
              : 'Ex.: Mercado'
        }
        value={description}
        onChange={(event) => setDescription(event.target.value)}
        error={errors.description}
        autoComplete="off"
      />

      <ChipGroup
        label="Categoria"
        allowClear
        value={categoryId}
        onChange={(value) => {
          setCategoryId(value)
          setTouched((current) => ({ ...current, category: true }))
        }}
        error={errors.categoryId}
        options={options.map(({ category, label }) => ({
          value: category.id,
          label,
          icon: categoryIcons[category.icon],
          color: category.color,
        }))}
      />

      {kind !== 'planned' && (
        <ChipGroup
          label={type === 'income' ? 'Como recebeu' : 'Forma de pagamento'}
          value={paymentMethod}
          allowClear={type === 'income'}
          onChange={(value) => {
            setPaymentMethod(value)
            setTouched((current) => ({ ...current, method: true }))
          }}
          error={errors.paymentMethod}
          options={methodOrder
            .filter((method) => type === 'expense' || method !== 'credit')
            .map((method) => ({ value: method, label: paymentMethodLabels[method] }))}
        />
      )}

      {isCredit ? (
        cards.length > 0 ? (
          <SelectField
            label="Cartão"
            value={creditCardId}
            onChange={(event) => setCreditCardId(event.target.value)}
            error={errors.creditCardId}
            hint="A competência segue a fatura do cartão (fechamento)."
          >
            <option value="">Escolha o cartão</option>
            {cards.map((card) => (
              <option key={card.id} value={card.id}>
                {card.name}
              </option>
            ))}
          </SelectField>
        ) : (
          <p role="alert" className="px-1 text-footnote text-negative">
            Cadastre um cartão em Configurações › Cartões para lançar no crédito.
          </p>
        )
      ) : (
        activeAccounts.length > 0 && (
          <SelectField
            label={type === 'income' ? 'Conta onde entrou' : 'Conta de onde saiu'}
            value={accountId}
            onChange={(event) => setAccountId(event.target.value)}
            error={errors.accountId}
          >
            <option value="">Não informar</option>
            {activeAccounts.map((account) => (
              <option key={account.id} value={account.id}>
                {account.name}
              </option>
            ))}
          </SelectField>
        )
      )}

      {kind !== 'planned' && (
        <TextField
          label={type === 'income' ? 'De quem (opcional)' : 'Estabelecimento (opcional)'}
          placeholder={type === 'income' ? 'Ex.: Empresa' : 'Ex.: iFood'}
          list={payeeListId}
          value={payeeText}
          onChange={(event) => void onPayeeChange(event.target.value)}
          error={errors.payeeId}
          autoComplete="off"
          hint={
            payeeText.trim() &&
            !payeeList.data?.some(
              (payee) =>
                payee.name.toLocaleLowerCase('pt-BR') ===
                payeeText.trim().toLocaleLowerCase('pt-BR'),
            )
              ? 'Novo — será cadastrado ao salvar.'
              : undefined
          }
        />
      )}
      <datalist id={payeeListId}>
        {(payeeList.data ?? []).map((payee) => (
          <option key={payee.id} value={payee.name} />
        ))}
      </datalist>

      <TextField
        label={kind === 'planned' ? 'Quando' : 'Data'}
        type="date"
        value={date}
        onChange={(event) => setDate(event.target.value)}
        error={errors.date}
      />

      <details className="group rounded-field bg-surface-2/60 px-4 open:pb-4">
        <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between text-subhead font-medium text-text-2">
          Mais opções
          <ChevronDown className="size-4 transition-transform group-open:rotate-180" aria-hidden />
        </summary>
        <div className="space-y-4 pt-1">
          {kind !== 'planned' && (
            <label className="flex min-h-11 items-center justify-between gap-3 text-body">
              {type === 'income' ? 'Já recebi' : 'Já paguei'}
              <input
                type="checkbox"
                className="size-5 accent-[var(--accent)]"
                checked={settled ?? !(isCredit || generated)}
                onChange={(event) => setSettled(event.target.checked)}
              />
            </label>
          )}
          <MonthField
            label="Entra no resumo de"
            value={competenceMonth}
            onChange={setCompetenceMonth}
            automatic={automaticMonth}
            error={errors.competenceMonth}
          />
          {type === 'expense' &&
            kind !== 'planned' &&
            plannedOptions &&
            plannedOptions.length > 0 && (
              <SelectField
                label="Vincular a um planejamento"
                value={parentPlannedId}
                onChange={(event) => setParentPlannedId(event.target.value)}
                error={errors.parentPlannedId}
                hint="O gasto conta dentro do valor reservado no planejamento."
              >
                <option value="">Nenhum</option>
                {plannedOptions.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.description}
                  </option>
                ))}
              </SelectField>
            )}
          <TextField
            label="Observação"
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            error={errors.notes}
            autoComplete="off"
          />
        </div>
      </details>

      {error !== null && error !== undefined && !apiFieldErrors(error) && (
        <p role="alert" className="text-footnote text-negative">
          {errorMessage(error)}
        </p>
      )}
      <Button type="submit" block loading={submitting || payeeMutations.create.isPending}>
        {editing ? 'Salvar' : 'Lançar'}
      </Button>
      {extra && <div className="flex flex-wrap justify-center gap-2">{extra}</div>}
    </form>
  )
}
