import { formatBRL } from '@orla/core/money'
import { MAX_INSTALLMENTS, splitInstallments, todayIsoDate } from '@orla/core'
import {
  createInstallmentPlanRequestSchema,
  type CreateInstallmentPlanRequest,
  type InstallmentPlan,
  type UpdateInstallmentPlanRequest,
} from '@orla/contracts'
import { useMemo, useState, type ReactNode } from 'react'
import { Button } from '@/components/ui/Button'
import { categoryIcons } from '@/components/ui/CategoryIcon'
import { ChipGroup } from '@/components/ui/Chips'
import { TextField } from '@/components/ui/Field'
import { SelectField } from '@/components/ui/Select'
import { MoneyInput } from '@/components/ui/MoneyInput'
import { SlideSwap } from '@/components/ui/SlideSwap'
import { SegmentedControl } from '@/components/ui/SegmentedControl'
import { categories, creditCards, payees } from '@/features/registrations/api'
import { errorMessage } from '@/lib/api'
import type { PlanType } from './api'
import { apiFieldErrors, categoryOptions, zodFieldErrors, type FieldErrors } from './form-utils'

type AmountMode = 'total' | 'installment'

/** Valores sugeridos para um novo parcelamento (ex.: "Dividir com alguém"). */
export interface InstallmentPlanDefaults {
  description?: string
  totalCents?: number
  installmentsCount?: number
  /** Data da compra / do 1º recebimento. */
  purchaseDate?: string
  /** 1ª competência fixa (mantida enquanto a data sugerida não mudar). */
  firstCompetenceMonth?: string
}

/** Textos que mudam entre parcelado a pagar e a receber (RF-49). */
const copy = {
  expense: {
    descriptionPlaceholder: 'Ex.: Nintendo Switch',
    payeeLabel: 'Estabelecimento (opcional)',
    payeePlaceholder: 'Ex.: Amazon',
    dateLabel: 'Data da compra',
    currentHint:
      'Compra antiga? Informe em qual parcela você está neste mês: as anteriores entram como pagas.',
    editHint: 'Mudar o total ou o nº de parcelas recalcula só as parcelas ainda não pagas.',
    submit: 'Criar parcelamento',
  },
  income: {
    descriptionPlaceholder: 'Ex.: Ana — metade do presente',
    payeeLabel: 'Quem vai te pagar (opcional)',
    payeePlaceholder: 'Ex.: Ana',
    dateLabel: 'Data do 1º recebimento',
    currentHint:
      'Já começou? Informe em qual parcela está neste mês: as anteriores entram como recebidas.',
    editHint: 'Mudar o total ou o nº de parcelas recalcula só as parcelas ainda não recebidas.',
    submit: 'Criar parcelado a receber',
  },
} as const

/** Prévia "3× de R$ 33,34 (1ª) e R$ 33,33". */
function preview(totalCents: number | null, count: number): string | null {
  if (!totalCents || !Number.isInteger(count) || count < 1 || count > MAX_INSTALLMENTS) return null
  try {
    const parts = splitInstallments(totalCents, count)
    const first = parts[0] ?? 0
    const rest = parts[1]
    if (rest === undefined || rest === first) return `${count}× de ${formatBRL(first)}`
    return `${count}× — 1ª de ${formatBRL(first)} e as demais de ${formatBRL(rest)}`
  } catch {
    return null
  }
}

/**
 * Cadastro/edição de parcelamento (RF-40): total **ou** valor da parcela, nº de parcelas,
 * cartão e "já estou na parcela k" para compras antigas. Também o parcelado a receber
 * (RF-49): sem cartão, com categoria de receita e "quem vai te pagar".
 */
export function InstallmentPlanForm({
  initial,
  defaultType = 'expense',
  defaults,
  submitting,
  error,
  onCreate,
  onUpdate,
  extra,
}: {
  initial?: InstallmentPlan | undefined
  /** Tipo inicial de um novo parcelamento; na edição vale o do parcelamento. */
  defaultType?: PlanType | undefined
  defaults?: InstallmentPlanDefaults | undefined
  submitting: boolean
  error: unknown
  onCreate?: (values: CreateInstallmentPlanRequest) => Promise<unknown>
  onUpdate?: (values: UpdateInstallmentPlanRequest) => Promise<unknown>
  extra?: ReactNode
}) {
  const editing = Boolean(initial)
  const [planType, setPlanType] = useState<PlanType>(initial?.type ?? defaultType)
  const receivable = planType === 'income'
  const text = copy[planType]
  const categoryList = categories.useList()
  const cardList = creditCards.useList()
  const payeeList = payees.useList()
  const payeeMutations = payees.useMutations()

  const [description, setDescription] = useState(
    initial?.description ?? defaults?.description ?? '',
  )
  const [mode, setMode] = useState<AmountMode>('total')
  const [amountCents, setAmountCents] = useState<number | null>(
    initial?.totalCents ?? defaults?.totalCents ?? null,
  )
  const [count, setCount] = useState(
    String(initial?.installmentsCount ?? defaults?.installmentsCount ?? ''),
  )
  const [onCredit, setOnCredit] = useState(initial ? initial.paymentMethod === 'credit' : true)
  const [creditCardId, setCreditCardId] = useState(initial?.creditCardId ?? '')
  const [categoryId, setCategoryId] = useState<string | null>(initial?.categoryId ?? null)
  const [payeeName, setPayeeName] = useState<string | null>(null)
  const [purchaseDate, setPurchaseDate] = useState<string>(
    initial?.purchaseDate ?? defaults?.purchaseDate ?? todayIsoDate(),
  )
  const [currentInstallment, setCurrentInstallment] = useState('')
  const [errors, setErrors] = useState<FieldErrors>({})

  const cards = cardList.data ?? []
  const options = useMemo(
    () => categoryOptions(categoryList.data ?? [], planType),
    [categoryList.data, planType],
  )
  // A 1ª competência sugerida só vale enquanto a data sugerida não for trocada.
  const fixedFirstMonth =
    defaults?.firstCompetenceMonth && purchaseDate === defaults.purchaseDate
      ? defaults.firstCompetenceMonth
      : undefined
  const payeeText =
    payeeName ?? payeeList.data?.find((payee) => payee.id === initial?.payeeId)?.name ?? ''
  const countNumber = Number(count)
  const totalForPreview =
    mode === 'total' ? amountCents : amountCents && countNumber ? amountCents * countNumber : null

  async function resolvePayeeId(): Promise<string | null> {
    const text = payeeText.trim()
    if (!text) return null
    const match = payeeList.data?.find(
      (payee) => payee.name.toLocaleLowerCase('pt-BR') === text.toLocaleLowerCase('pt-BR'),
    )
    if (match) return match.id
    return (await payeeMutations.create.mutateAsync({ name: text, defaultCategoryId: categoryId }))
      .id
  }

  async function submit() {
    setErrors({})
    try {
      if (editing && onUpdate) {
        if (!amountCents) return setErrors({ totalCents: 'Informe o valor total' })
        if (!countNumber) return setErrors({ installmentsCount: 'Informe o nº de parcelas' })
        await onUpdate({
          description: description.trim(),
          categoryId,
          payeeId: await resolvePayeeId(),
          totalCents: amountCents,
          installmentsCount: countNumber,
          ...(!receivable && onCredit && creditCardId && { creditCardId }),
        })
        return
      }
      const draft: CreateInstallmentPlanRequest = {
        type: planType,
        description: description.trim(),
        categoryId,
        ...(receivable
          ? { paymentMethod: 'other', creditCardId: null }
          : {
              paymentMethod: onCredit ? 'credit' : 'boleto',
              creditCardId: onCredit ? creditCardId || null : null,
            }),
        purchaseDate,
        ...(fixedFirstMonth && !currentInstallment && { firstCompetenceMonth: fixedFirstMonth }),
        installmentsCount: countNumber,
        ...(mode === 'total'
          ? { totalCents: amountCents ?? 0 }
          : { installmentCents: amountCents ?? 0 }),
        ...(currentInstallment && { currentInstallment: Number(currentInstallment) }),
      }
      const check = createInstallmentPlanRequestSchema.safeParse(draft)
      if (!check.success) return setErrors(zodFieldErrors(check.error))
      await onCreate?.({ ...draft, payeeId: await resolvePayeeId() })
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
          label="Direção do parcelado"
          value={planType}
          onChange={(next) => {
            setPlanType(next)
            // Categoria de despesa não serve para receita (e vice-versa).
            setCategoryId(null)
            setErrors({})
          }}
          options={[
            { value: 'expense', label: 'A pagar' },
            { value: 'income', label: 'A receber' },
          ]}
        />
      )}
      {!editing && (
        <SegmentedControl
          label="Informar"
          value={mode}
          onChange={setMode}
          options={[
            { value: 'total', label: 'Valor total' },
            { value: 'installment', label: 'Valor da parcela' },
          ]}
        />
      )}
      <MoneyInput
        label={mode === 'total' ? 'Valor total' : 'Valor de cada parcela'}
        value={amountCents}
        onChange={setAmountCents}
        error={errors.totalCents ?? errors.installmentCents}
        large
        autoFocus={!editing}
      />
      <TextField
        label="Nº de parcelas"
        type="number"
        inputMode="numeric"
        min={1}
        max={MAX_INSTALLMENTS}
        placeholder="Ex.: 12"
        value={count}
        onChange={(event) => setCount(event.target.value)}
        error={errors.installmentsCount}
        hint={preview(totalForPreview, countNumber) ?? undefined}
      />
      <TextField
        label="Descrição"
        placeholder={text.descriptionPlaceholder}
        value={description}
        onChange={(event) => setDescription(event.target.value)}
        error={errors.description}
        autoComplete="off"
      />

      {!editing && !receivable && (
        <SegmentedControl
          label="Onde parcelou"
          value={onCredit ? 'credit' : 'boleto'}
          onChange={(value) => setOnCredit(value === 'credit')}
          options={[
            { value: 'credit', label: 'Cartão de crédito' },
            { value: 'boleto', label: 'Boleto / carnê' },
          ]}
        />
      )}
      <SlideSwap index={onCredit && !receivable ? 0 : 1}>
        {onCredit &&
          !receivable &&
          (cards.length > 0 ? (
            <SelectField
              label="Cartão"
              value={creditCardId}
              onChange={(event) => setCreditCardId(event.target.value)}
              error={errors.creditCardId}
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
              Cadastre um cartão em Configurações › Cartões, ou escolha boleto/carnê.
            </p>
          ))}
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
      <TextField
        label={text.payeeLabel}
        placeholder={text.payeePlaceholder}
        list="installment-payees"
        value={payeeText}
        onChange={(event) => setPayeeName(event.target.value)}
        autoComplete="off"
      />
      <datalist id="installment-payees">
        {(payeeList.data ?? []).map((payee) => (
          <option key={payee.id} value={payee.name} />
        ))}
      </datalist>

      {!editing && (
        <div className="grid grid-cols-2 gap-3">
          <TextField
            label={text.dateLabel}
            type="date"
            value={purchaseDate}
            onChange={(event) => setPurchaseDate(event.target.value)}
            error={errors.purchaseDate}
          />
          <TextField
            label="Já estou na parcela"
            type="number"
            inputMode="numeric"
            min={1}
            placeholder="Opcional"
            value={currentInstallment}
            onChange={(event) => setCurrentInstallment(event.target.value)}
            error={errors.currentInstallment}
          />
        </div>
      )}
      {!editing && <p className="px-1 text-footnote text-text-2">{text.currentHint}</p>}
      {editing && <p className="px-1 text-footnote text-text-2">{text.editHint}</p>}

      {error !== null && error !== undefined && !apiFieldErrors(error) && (
        <p role="alert" className="text-footnote text-negative">
          {errorMessage(error)}
        </p>
      )}
      <Button type="submit" block loading={submitting || payeeMutations.create.isPending}>
        {editing ? 'Salvar' : text.submit}
      </Button>
      {extra && <div className="flex flex-wrap justify-center gap-2">{extra}</div>}
    </form>
  )
}
