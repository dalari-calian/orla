import type { Transaction } from '@orla/contracts'
import { CalendarRange, Copy, Repeat } from 'lucide-react'
import {
  createContext,
  lazy,
  Suspense,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import { Link, useNavigate } from 'react-router'
import { Button } from '@/components/ui/Button'
import { SegmentedControl } from '@/components/ui/SegmentedControl'
import { Sheet } from '@/components/ui/Sheet'
import { Skeleton } from '@/components/ui/States'
import { useToast } from '@/components/ui/Toast'
import { errorMessage } from '@/lib/api'
import { useInstallmentPlanMutations, useTransactionMutations } from './api'
import type { TransactionKind } from './TransactionForm'

// Os formulários só carregam quando o sheet abre (RNF-02: bundle inicial enxuto).
const TransactionForm = lazy(async () => ({
  default: (await import('./TransactionForm')).TransactionForm,
}))
const InstallmentPlanForm = lazy(async () => ({
  default: (await import('./InstallmentPlanForm')).InstallmentPlanForm,
}))

/** RM-01: tipos do sheet "+" nesta fase (ativo, provento e aporte chegam nas fases da carteira). */
export type EntryKind = TransactionKind | 'installment'

type EntryState =
  | { mode: 'new'; kind: EntryKind; template?: Transaction | undefined }
  | { mode: 'edit'; transaction: Transaction }
  | null

interface EntryContextValue {
  openNew: (kind?: EntryKind, template?: Transaction) => void
  openEdit: (transaction: Transaction) => void
}

const EntryContext = createContext<EntryContextValue | null>(null)

export function useEntrySheet(): EntryContextValue {
  const value = useContext(EntryContext)
  if (!value) throw new Error('useEntrySheet precisa do EntryProvider')
  return value
}

const kindOptions = [
  { value: 'expense', label: 'Despesa' },
  { value: 'income', label: 'Receita' },
  { value: 'installment', label: 'Parcelado' },
  { value: 'planned', label: 'Planejar' },
] as const satisfies readonly { value: EntryKind; label: string }[]

function kindOf(transaction: Transaction): TransactionKind {
  if (transaction.type === 'income') return 'income'
  return transaction.nature === 'planned' ? 'planned' : 'expense'
}

function FormSkeleton() {
  return (
    <div className="space-y-4" aria-busy aria-label="Carregando formulário">
      <Skeleton className="h-16" />
      <Skeleton className="h-12" />
      <Skeleton className="h-10 w-3/4" />
      <Skeleton className="h-12" />
    </div>
  )
}

const titles: Record<EntryKind, string> = {
  expense: 'Nova despesa',
  income: 'Nova receita',
  installment: 'Novo parcelamento',
  planned: 'Novo planejamento',
}

/** Sheet "+" de lançamento rápido (RM-01..04) e de edição, disponível no app inteiro. */
export function EntryProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<EntryState>(null)
  // Lado de onde o conteúdo entra ao trocar de aba: aba à direita → desliza da direita.
  const [slide, setSlide] = useState<'right' | 'left' | null>(null)
  const transactions = useTransactionMutations()
  const plans = useInstallmentPlanMutations()
  const toast = useToast()
  const navigate = useNavigate()

  const close = useCallback(() => {
    setState(null)
    transactions.create.reset()
    transactions.update.reset()
    plans.create.reset()
  }, [transactions.create, transactions.update, plans.create])

  const value = useMemo<EntryContextValue>(
    () => ({
      openNew: (kind = 'expense', template) => {
        setSlide(null)
        setState({ mode: 'new', kind, template })
      },
      openEdit: (transaction) => {
        setSlide(null)
        setState({ mode: 'edit', transaction })
      },
    }),
    [],
  )

  const editing = state?.mode === 'edit' ? state.transaction : null
  const kind: EntryKind = state
    ? state.mode === 'edit'
      ? kindOf(state.transaction)
      : state.kind
    : 'expense'
  const title = editing
    ? editing.type === 'income'
      ? 'Editar receita'
      : editing.nature === 'planned'
        ? 'Editar planejamento'
        : editing.nature === 'installment'
          ? `Parcela ${editing.installmentNumber ?? ''}/${editing.installmentsCount ?? ''}`
          : 'Editar despesa'
    : titles[kind]

  function remove(transaction: Transaction) {
    transactions.remove.mutate(transaction.id, {
      onSuccess: () => {
        close()
        toast({
          message: 'Lançamento excluído',
          action: {
            label: 'Desfazer',
            onClick: () =>
              transactions.restore.mutate(transaction.id, {
                onError: (error) => toast({ message: errorMessage(error), tone: 'error' }),
              }),
          },
        })
      },
      onError: (error) => toast({ message: errorMessage(error), tone: 'error' }),
    })
  }

  return (
    <EntryContext.Provider value={value}>
      {children}
      <Sheet open={state !== null} onClose={close} title={title}>
        {state?.mode === 'new' && (
          <div className="mb-4">
            <SegmentedControl
              label="Tipo de lançamento"
              value={state.kind}
              onChange={(next) => {
                const order = kindOptions.map((option) => option.value as EntryKind)
                setSlide(order.indexOf(next) > order.indexOf(state.kind) ? 'right' : 'left')
                setState({ mode: 'new', kind: next })
              }}
              options={kindOptions}
            />
          </div>
        )}

        {editing?.recurringTemplateId && (
          <p className="mb-4 flex items-start gap-2 rounded-field bg-accent/10 px-3 py-2.5 text-footnote text-text-2">
            <Repeat className="mt-0.5 size-4 shrink-0 text-accent" aria-hidden />
            <span>
              Gerado por um modelo recorrente. Editar aqui muda só este mês; para mudar os próximos,
              use{' '}
              <Link to="/config/recorrentes" className="font-medium text-accent" onClick={close}>
                Recorrentes
              </Link>
              .
            </span>
          </p>
        )}
        {editing?.installmentPlanId && (
          <p className="mb-4 flex items-start gap-2 rounded-field bg-accent/10 px-3 py-2.5 text-footnote text-text-2">
            <CalendarRange className="mt-0.5 size-4 shrink-0 text-accent" aria-hidden />
            <span>
              Parcela de um parcelamento. Para mudar o total, quitar ou cancelar,{' '}
              <Link
                to={`/financas/parcelamentos/${editing.installmentPlanId}`}
                className="font-medium text-accent"
                onClick={close}
              >
                abra o parcelamento
              </Link>
              .
            </span>
          </p>
        )}

        <div
          key={state?.mode === 'new' ? state.kind : 'edit'}
          className={
            slide === 'right'
              ? 'animate-slide-from-right'
              : slide === 'left'
                ? 'animate-slide-from-left'
                : undefined
          }
        >
          <Suspense fallback={<FormSkeleton />}>
            {state && kind === 'installment' && state.mode === 'new' && (
              <InstallmentPlanForm
                key="installment"
                submitting={plans.create.isPending}
                error={plans.create.error}
                onCreate={async (values) => {
                  const detail = await plans.create.mutateAsync(values)
                  close()
                  toast({
                    message: 'Parcelamento criado',
                    action: {
                      label: 'Ver',
                      onClick: () => void navigate(`/financas/parcelamentos/${detail.plan.id}`),
                    },
                  })
                }}
              />
            )}

            {state && kind !== 'installment' && (
              <TransactionForm
                key={
                  editing?.id ??
                  `new-${kind}-${state.mode === 'new' ? (state.template?.id ?? '') : ''}`
                }
                kind={kind}
                editing={Boolean(editing)}
                initial={editing ?? (state.mode === 'new' ? state.template : undefined)}
                submitting={transactions.create.isPending || transactions.update.isPending}
                error={editing ? transactions.update.error : transactions.create.error}
                onSubmit={async (values) => {
                  if (editing) {
                    await transactions.update.mutateAsync({ id: editing.id, ...values })
                    toast({ message: 'Lançamento atualizado' })
                  } else {
                    await transactions.create.mutateAsync(values)
                    toast({ message: values.type === 'income' ? 'Receita lançada' : 'Lançado' })
                  }
                  close()
                }}
                extra={
                  editing && (
                    <>
                      {!editing.installmentPlanId && (
                        <Button
                          variant="plain"
                          onClick={() =>
                            setState({ mode: 'new', kind: kindOf(editing), template: editing })
                          }
                        >
                          <Copy className="size-4" aria-hidden />
                          Duplicar
                        </Button>
                      )}
                      {!editing.installmentPlanId && (
                        <Button
                          variant="destructive"
                          loading={transactions.remove.isPending}
                          onClick={() => remove(editing)}
                        >
                          Excluir
                        </Button>
                      )}
                    </>
                  )
                }
              />
            )}
          </Suspense>
        </div>
      </Sheet>
    </EntryContext.Provider>
  )
}
