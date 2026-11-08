import { CATEGORY_ICONS, PALETTE } from '@orla/core'
import {
  createAccountRequestSchema,
  createCategoryRequestSchema,
  createCreditCardRequestSchema,
  createPayeeRequestSchema,
  type Account,
  type Category,
  type CreateAccountRequest,
  type CreateCategoryRequest,
  type CreateCreditCardRequest,
  type CreatePayeeRequest,
  type CreditCard,
  type Payee,
} from '@orla/contracts'
import { Controller, useForm, useWatch } from 'react-hook-form'
import type { ReactNode } from 'react'
import { Button } from '@/components/ui/Button'
import { TextField } from '@/components/ui/Field'
import { SelectField } from '@/components/ui/Select'
import { MoneyInput } from '@/components/ui/MoneyInput'
import { ColorPicker, IconPicker } from '@/components/ui/Pickers'
import { errorMessage } from '@/lib/api'
import { applyApiFieldErrors, zodResolver } from '@/lib/form'
import { accountColors, accountKindLabels } from './labels'

/** Rodapé comum: erro geral, ações secundárias (arquivar/excluir) e salvar. */
function FormFooter({
  error,
  submitting,
  submitLabel,
  extra,
}: {
  error: unknown
  submitting: boolean
  submitLabel: string
  extra?: ReactNode
}) {
  return (
    <div className="space-y-3 pt-2">
      {error !== null && error !== undefined && (
        <p role="alert" className="text-footnote text-negative">
          {errorMessage(error)}
        </p>
      )}
      <Button type="submit" block loading={submitting}>
        {submitLabel}
      </Button>
      {extra && <div className="flex flex-wrap justify-center gap-2">{extra}</div>}
    </div>
  )
}

interface FormProps<TValues, TItem> {
  initial?: TItem | undefined
  onSubmit: (values: TValues) => Promise<unknown>
  error: unknown
  submitting: boolean
  submitLabel?: string
  extra?: ReactNode
}

// ─── Conta ───────────────────────────────────────────────────────────────────

export function AccountForm({
  initial,
  onSubmit,
  error,
  submitting,
  submitLabel = 'Salvar',
  extra,
}: FormProps<CreateAccountRequest, Account>) {
  const form = useForm<CreateAccountRequest>({
    resolver: zodResolver(createAccountRequestSchema),
    defaultValues: {
      name: initial?.name ?? '',
      kind: initial?.kind ?? 'checking',
      color: initial?.color ?? accountColors[0],
    },
  })
  const { errors } = form.formState

  return (
    <form
      noValidate
      className="space-y-4"
      onSubmit={form.handleSubmit((values) =>
        onSubmit(values).catch((err: unknown) =>
          applyApiFieldErrors(err, form.setError, ['name', 'kind', 'color']),
        ),
      )}
    >
      <TextField
        label="Nome"
        placeholder="Ex.: Nubank"
        error={errors.name?.message}
        {...form.register('name')}
      />
      <SelectField label="Tipo" error={errors.kind?.message} {...form.register('kind')}>
        {Object.entries(accountKindLabels).map(([value, label]) => (
          <option key={value} value={value}>
            {label}
          </option>
        ))}
      </SelectField>
      <Controller
        control={form.control}
        name="color"
        render={({ field }) => (
          <ColorPicker
            label="Cor"
            value={field.value}
            onChange={field.onChange}
            colors={accountColors}
          />
        )}
      />
      <FormFooter error={error} submitting={submitting} submitLabel={submitLabel} extra={extra} />
    </form>
  )
}

// ─── Cartão ──────────────────────────────────────────────────────────────────

export function CreditCardForm({
  initial,
  accounts,
  onSubmit,
  error,
  submitting,
  submitLabel = 'Salvar',
  extra,
}: FormProps<CreateCreditCardRequest, CreditCard> & { accounts: Account[] }) {
  const form = useForm<CreateCreditCardRequest>({
    resolver: zodResolver(createCreditCardRequestSchema),
    defaultValues: {
      name: initial?.name ?? '',
      accountId: initial?.accountId ?? accounts[0]?.id ?? '',
      closingDay: initial?.closingDay,
      dueDay: initial?.dueDay,
      limitCents: initial?.limitCents ?? null,
    },
  })
  const { errors } = form.formState
  const dayOptions = { valueAsNumber: true } as const

  return (
    <form
      noValidate
      className="space-y-4"
      onSubmit={form.handleSubmit((values) =>
        onSubmit(values).catch((err: unknown) =>
          applyApiFieldErrors(err, form.setError, [
            'name',
            'accountId',
            'closingDay',
            'dueDay',
            'limitCents',
          ]),
        ),
      )}
    >
      <TextField
        label="Nome do cartão"
        placeholder="Ex.: Nubank Roxinho"
        error={errors.name?.message}
        {...form.register('name')}
      />
      <SelectField
        label="Banco emissor"
        error={errors.accountId?.message}
        {...form.register('accountId')}
      >
        {accounts.map((account) => (
          <option key={account.id} value={account.id}>
            {account.name}
          </option>
        ))}
      </SelectField>
      <div className="grid grid-cols-2 gap-3">
        <TextField
          label="Dia do fechamento"
          type="number"
          inputMode="numeric"
          min={1}
          max={31}
          placeholder="Ex.: 3"
          error={errors.closingDay?.message}
          {...form.register('closingDay', dayOptions)}
        />
        <TextField
          label="Dia do vencimento"
          type="number"
          inputMode="numeric"
          min={1}
          max={31}
          placeholder="Ex.: 10"
          error={errors.dueDay?.message}
          {...form.register('dueDay', dayOptions)}
        />
      </div>
      <Controller
        control={form.control}
        name="limitCents"
        render={({ field }) => (
          <MoneyInput
            label="Limite (opcional)"
            value={field.value ?? null}
            onChange={field.onChange}
            onBlur={field.onBlur}
            error={errors.limitCents?.message}
          />
        )}
      />
      <FormFooter error={error} submitting={submitting} submitLabel={submitLabel} extra={extra} />
    </form>
  )
}

// ─── Categoria ───────────────────────────────────────────────────────────────

export function CategoryForm({
  initial,
  kind,
  parents,
  hasChildren = false,
  onSubmit,
  error,
  submitting,
  extra,
}: FormProps<CreateCategoryRequest, Category> & {
  kind: Category['kind']
  /** Categorias principais do mesmo tipo (candidatas a pai). */
  parents: Category[]
  /** Categoria com subcategorias não pode virar subcategoria (1 nível só). */
  hasChildren?: boolean
}) {
  const form = useForm<CreateCategoryRequest>({
    resolver: zodResolver(createCategoryRequestSchema),
    defaultValues: {
      kind,
      name: initial?.name ?? '',
      icon: initial?.icon ?? CATEGORY_ICONS[0],
      color: initial?.color ?? PALETTE[0],
      parentId: initial?.parentId ?? null,
      monthlyBudgetCents: initial?.monthlyBudgetCents ?? null,
    },
  })
  const { errors } = form.formState
  const color = useWatch({ control: form.control, name: 'color' })

  return (
    <form
      noValidate
      className="space-y-4"
      onSubmit={form.handleSubmit((values) =>
        onSubmit(values).catch((err: unknown) =>
          applyApiFieldErrors(err, form.setError, [
            'name',
            'parentId',
            'icon',
            'color',
            'monthlyBudgetCents',
          ]),
        ),
      )}
    >
      <TextField label="Nome" error={errors.name?.message} {...form.register('name')} />
      {!hasChildren && (
        <SelectField
          label="Dentro de"
          error={errors.parentId?.message}
          {...form.register('parentId', { setValueAs: (value: string) => value || null })}
        >
          <option value="">Nenhuma (categoria principal)</option>
          {parents
            .filter((parent) => parent.id !== initial?.id)
            .map((parent) => (
              <option key={parent.id} value={parent.id}>
                {parent.name}
              </option>
            ))}
        </SelectField>
      )}
      <Controller
        control={form.control}
        name="color"
        render={({ field }) => (
          <ColorPicker label="Cor" value={field.value} onChange={field.onChange} />
        )}
      />
      <Controller
        control={form.control}
        name="icon"
        render={({ field }) => (
          <IconPicker label="Ícone" value={field.value} onChange={field.onChange} color={color} />
        )}
      />
      {kind === 'expense' && (
        <Controller
          control={form.control}
          name="monthlyBudgetCents"
          render={({ field }) => (
            <MoneyInput
              label="Teto mensal (opcional)"
              hint="Avisamos quando os gastos chegarem a 80% e 100%."
              value={field.value ?? null}
              onChange={field.onChange}
              onBlur={field.onBlur}
              error={errors.monthlyBudgetCents?.message}
            />
          )}
        />
      )}
      <FormFooter error={error} submitting={submitting} submitLabel="Salvar" extra={extra} />
    </form>
  )
}

// ─── Estabelecimento ─────────────────────────────────────────────────────────

export function PayeeForm({
  initial,
  categories,
  onSubmit,
  error,
  submitting,
  extra,
}: FormProps<CreatePayeeRequest, Payee> & { categories: Category[] }) {
  const form = useForm<CreatePayeeRequest>({
    resolver: zodResolver(createPayeeRequestSchema),
    defaultValues: {
      name: initial?.name ?? '',
      defaultCategoryId: initial?.defaultCategoryId ?? null,
    },
  })
  const { errors } = form.formState

  return (
    <form
      noValidate
      className="space-y-4"
      onSubmit={form.handleSubmit((values) =>
        onSubmit(values).catch((err: unknown) =>
          applyApiFieldErrors(err, form.setError, ['name', 'defaultCategoryId']),
        ),
      )}
    >
      <TextField
        label="Nome"
        placeholder="Ex.: Zaffari, Uber, Netflix"
        error={errors.name?.message}
        {...form.register('name')}
      />
      <SelectField
        label="Categoria sugerida"
        hint="Já vem preenchida quando você lançar um gasto aqui."
        error={errors.defaultCategoryId?.message}
        {...form.register('defaultCategoryId', { setValueAs: (value: string) => value || null })}
      >
        <option value="">Nenhuma</option>
        {categories.map((category) => (
          <option key={category.id} value={category.id}>
            {category.parentId ? `  ↳ ${category.name}` : category.name}
          </option>
        ))}
      </SelectField>
      <FormFooter error={error} submitting={submitting} submitLabel="Salvar" extra={extra} />
    </form>
  )
}
