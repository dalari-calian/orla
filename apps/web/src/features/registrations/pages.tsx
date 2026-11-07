import { formatBRL } from '@orla/core/money'
import type { Account, Category, CreditCard, Payee } from '@orla/contracts'
import type { UseMutationResult, UseQueryResult } from '@tanstack/react-query'
import { CreditCard as CardIcon, Landmark, Plus, Search, Store, Tags } from 'lucide-react'
import { useMemo, useState, type ReactNode } from 'react'
import { Link } from 'react-router'
import { PageHeader } from '@/components/layout/PageHeader'
import { Button } from '@/components/ui/Button'
import { categoryIcons } from '@/components/ui/CategoryIcon'
import { inputClass } from '@/components/ui/Field'
import { GroupedList, ListRow } from '@/components/ui/GroupedList'
import { SegmentedControl } from '@/components/ui/SegmentedControl'
import { Sheet } from '@/components/ui/Sheet'
import { EmptyState, ErrorState, Skeleton } from '@/components/ui/States'
import { useToast } from '@/components/ui/Toast'
import { errorMessage } from '@/lib/api'
import { accounts, categories, creditCards, payees } from './api'
import { AccountForm, CategoryForm, CreditCardForm, PayeeForm } from './forms'
import { accountKindLabels, cardDaysLabel } from './labels'

const backToConfig = { to: '/config', label: 'Ajustes' }

// ─── Peças compartilhadas ────────────────────────────────────────────────────

/** Carregando / erro / vazio / lista — os quatro estados obrigatórios de toda lista. */
function ListStates<T>({
  query,
  items,
  empty,
  children,
}: {
  query: Pick<UseQueryResult<unknown>, 'isPending' | 'isError' | 'error' | 'refetch'>
  /** Itens já filtrados para exibir. */
  items: T[] | undefined
  empty: ReactNode
  children: (items: T[]) => ReactNode
}) {
  if (query.isPending) {
    return (
      <div className="space-y-px overflow-hidden rounded-card bg-surface shadow-card" aria-busy>
        {[0, 1, 2].map((index) => (
          <div key={index} className="flex items-center gap-3 px-4 py-3">
            <Skeleton className="size-9 rounded-full" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-4 w-2/5" />
              <Skeleton className="h-3 w-1/4" />
            </div>
          </div>
        ))}
      </div>
    )
  }
  if (query.isError) {
    return (
      <div className="rounded-card bg-surface p-4 shadow-card">
        <ErrorState description={errorMessage(query.error)} onRetry={() => void query.refetch()} />
      </div>
    )
  }
  if (!items || items.length === 0)
    return <div className="rounded-card bg-surface shadow-card">{empty}</div>
  return <>{children(items)}</>
}

function AddButton({ onClick, label }: { onClick: () => void; label: string }) {
  return (
    <Button variant="plain" onClick={onClick} aria-label={label} className="px-3">
      <Plus className="size-5" aria-hidden />
      <span className="hidden sm:inline">{label}</span>
    </Button>
  )
}

/** Excluir com "Desfazer" no toast (soft delete + restore). */
function useDeleteWithUndo(
  remove: UseMutationResult<undefined, Error, string>,
  restore: UseMutationResult<unknown, Error, string>,
) {
  const toast = useToast()
  return (id: string, label: string, onDone: () => void) => {
    remove.mutate(id, {
      onSuccess: () => {
        onDone()
        toast({
          message: `${label} excluído`,
          action: {
            label: 'Desfazer',
            onClick: () =>
              restore.mutate(id, {
                onError: (error) => toast({ message: errorMessage(error), tone: 'error' }),
              }),
          },
        })
      },
      onError: (error) => toast({ message: errorMessage(error), tone: 'error' }),
    })
  }
}

type Editing<T> = T | 'new' | null

// ─── Contas ──────────────────────────────────────────────────────────────────

export function AccountsPage() {
  const list = accounts.useList()
  const { create, update, remove, restore } = accounts.useMutations()
  const deleteWithUndo = useDeleteWithUndo(remove, restore)
  const toast = useToast()
  const [editing, setEditing] = useState<Editing<Account>>(null)
  const close = () => {
    setEditing(null)
    create.reset()
    update.reset()
  }
  const current = editing !== 'new' ? editing : null

  return (
    <>
      <PageHeader
        title="Contas"
        back={backToConfig}
        actions={<AddButton label="Nova conta" onClick={() => setEditing('new')} />}
      />
      <ListStates
        query={list}
        items={list.data}
        empty={
          <EmptyState
            icon={Landmark}
            title="Nenhuma conta ainda"
            description="Cadastre os bancos, corretoras e a carteira de onde seu dinheiro sai e entra."
            action={<Button onClick={() => setEditing('new')}>Adicionar conta</Button>}
          />
        }
      >
        {(items) => (
          <GroupedList footer="Contas arquivadas não aparecem para novos lançamentos.">
            {items.map((account) => (
              <ListRow
                key={account.id}
                icon={Landmark}
                iconColor={account.color}
                title={account.name}
                subtitle={
                  account.isArchived
                    ? `${accountKindLabels[account.kind]} · Arquivada`
                    : accountKindLabels[account.kind]
                }
                muted={account.isArchived}
                onClick={() => setEditing(account)}
              />
            ))}
          </GroupedList>
        )}
      </ListStates>

      <Sheet
        open={editing !== null}
        onClose={close}
        title={current ? 'Editar conta' : 'Nova conta'}
      >
        {editing !== null && (
          <AccountForm
            key={current?.id ?? 'new'}
            initial={current ?? undefined}
            error={current ? update.error : create.error}
            submitting={create.isPending || update.isPending}
            onSubmit={async (values) => {
              if (current) await update.mutateAsync({ id: current.id, ...values })
              else await create.mutateAsync(values)
              toast({ message: current ? 'Conta atualizada' : 'Conta criada' })
              close()
            }}
            extra={
              current && (
                <>
                  <Button
                    variant="plain"
                    onClick={() =>
                      update.mutate(
                        { id: current.id, isArchived: !current.isArchived },
                        { onSuccess: () => close() },
                      )
                    }
                  >
                    {current.isArchived ? 'Desarquivar' : 'Arquivar'}
                  </Button>
                  <Button
                    variant="destructive"
                    loading={remove.isPending}
                    onClick={() => deleteWithUndo(current.id, 'Conta', close)}
                  >
                    Excluir
                  </Button>
                </>
              )
            }
          />
        )}
      </Sheet>
    </>
  )
}

// ─── Cartões ─────────────────────────────────────────────────────────────────

export function CreditCardsPage() {
  const list = creditCards.useList()
  const accountList = accounts.useList()
  const { create, update, remove, restore } = creditCards.useMutations()
  const deleteWithUndo = useDeleteWithUndo(remove, restore)
  const toast = useToast()
  const [editing, setEditing] = useState<Editing<CreditCard>>(null)
  const close = () => {
    setEditing(null)
    create.reset()
    update.reset()
  }
  const current = editing !== 'new' ? editing : null
  const activeAccounts = (accountList.data ?? []).filter((account) => !account.isArchived)
  const accountById = new Map((accountList.data ?? []).map((account) => [account.id, account]))
  const noAccounts = accountList.isSuccess && activeAccounts.length === 0

  return (
    <>
      <PageHeader
        title="Cartões"
        back={backToConfig}
        actions={!noAccounts && <AddButton label="Novo cartão" onClick={() => setEditing('new')} />}
      />
      <ListStates
        query={list}
        items={list.data}
        empty={
          <EmptyState
            icon={CardIcon}
            title="Nenhum cartão ainda"
            description={
              noAccounts
                ? 'Primeiro cadastre a conta do banco que emite o cartão.'
                : 'Com o dia de fechamento, o Orla sabe em qual fatura cada compra cai.'
            }
            action={
              noAccounts ? (
                <Link
                  to="/config/contas"
                  className="inline-flex min-h-11 items-center font-semibold text-accent"
                >
                  Cadastrar conta
                </Link>
              ) : (
                <Button onClick={() => setEditing('new')}>Adicionar cartão</Button>
              )
            }
          />
        }
      >
        {(items) => (
          <GroupedList>
            {items.map((card) => {
              const account = accountById.get(card.accountId)
              return (
                <ListRow
                  key={card.id}
                  icon={CardIcon}
                  iconColor={account?.color ?? 'var(--accent)'}
                  title={card.name}
                  subtitle={cardDaysLabel(card.closingDay, card.dueDay)}
                  value={card.limitCents !== null ? formatBRL(card.limitCents) : undefined}
                  onClick={() => setEditing(card)}
                />
              )
            })}
          </GroupedList>
        )}
      </ListStates>

      <Sheet
        open={editing !== null}
        onClose={close}
        title={current ? 'Editar cartão' : 'Novo cartão'}
      >
        {editing !== null && (
          <CreditCardForm
            key={current?.id ?? 'new'}
            initial={current ?? undefined}
            accounts={(accountList.data ?? []).filter(
              (account) => !account.isArchived || account.id === current?.accountId,
            )}
            error={current ? update.error : create.error}
            submitting={create.isPending || update.isPending}
            onSubmit={async (values) => {
              if (current) await update.mutateAsync({ id: current.id, ...values })
              else await create.mutateAsync(values)
              toast({ message: current ? 'Cartão atualizado' : 'Cartão criado' })
              close()
            }}
            extra={
              current && (
                <Button
                  variant="destructive"
                  loading={remove.isPending}
                  onClick={() => deleteWithUndo(current.id, 'Cartão', close)}
                >
                  Excluir
                </Button>
              )
            }
          />
        )}
      </Sheet>
    </>
  )
}

// ─── Categorias ──────────────────────────────────────────────────────────────

export function CategoriesPage() {
  const list = categories.useList()
  const { create, update, remove, restore } = categories.useMutations()
  const deleteWithUndo = useDeleteWithUndo(remove, restore)
  const toast = useToast()
  const [kind, setKind] = useState<Category['kind']>('expense')
  const [editing, setEditing] = useState<Editing<Category>>(null)
  const close = () => {
    setEditing(null)
    create.reset()
    update.reset()
  }
  const current = editing !== 'new' ? editing : null

  const ofKind = useMemo(
    () => (list.data ?? []).filter((category) => category.kind === kind),
    [list.data, kind],
  )
  const topLevel = ofKind.filter((category) => !category.parentId)
  const childrenOf = (id: string) => ofKind.filter((category) => category.parentId === id)

  return (
    <>
      <PageHeader
        title="Categorias"
        back={backToConfig}
        actions={<AddButton label="Nova categoria" onClick={() => setEditing('new')} />}
      />
      <div className="mb-5">
        <SegmentedControl
          label="Tipo de categoria"
          value={kind}
          onChange={setKind}
          options={[
            { value: 'expense', label: 'Despesas' },
            { value: 'income', label: 'Receitas' },
          ]}
        />
      </div>
      <ListStates
        query={list}
        items={ofKind}
        empty={
          <EmptyState
            icon={Tags}
            title="Nenhuma categoria"
            description="Categorias organizam seus gastos e receitas nos gráficos."
            action={<Button onClick={() => setEditing('new')}>Adicionar categoria</Button>}
          />
        }
      >
        {() => (
          <GroupedList>
            {topLevel.flatMap((parent) => [
              <ListRow
                key={parent.id}
                icon={categoryIcons[parent.icon]}
                iconColor={parent.color}
                title={parent.name}
                value={
                  parent.monthlyBudgetCents !== null
                    ? `Teto ${formatBRL(parent.monthlyBudgetCents)}`
                    : undefined
                }
                onClick={() => setEditing(parent)}
              />,
              ...childrenOf(parent.id).map((child) => (
                <ListRow
                  key={child.id}
                  indent
                  icon={categoryIcons[child.icon]}
                  iconColor={child.color}
                  title={child.name}
                  value={
                    child.monthlyBudgetCents !== null
                      ? `Teto ${formatBRL(child.monthlyBudgetCents)}`
                      : undefined
                  }
                  onClick={() => setEditing(child)}
                />
              )),
            ])}
          </GroupedList>
        )}
      </ListStates>

      <Sheet
        open={editing !== null}
        onClose={close}
        title={current ? 'Editar categoria' : 'Nova categoria'}
      >
        {editing !== null && (
          <CategoryForm
            key={current?.id ?? `new-${kind}`}
            kind={current?.kind ?? kind}
            initial={current ?? undefined}
            parents={topLevel}
            hasChildren={current ? childrenOf(current.id).length > 0 : false}
            error={current ? update.error : create.error}
            submitting={create.isPending || update.isPending}
            onSubmit={async ({ kind: categoryKind, ...values }) => {
              if (current) await update.mutateAsync({ id: current.id, ...values })
              else await create.mutateAsync({ kind: categoryKind, ...values })
              toast({ message: current ? 'Categoria atualizada' : 'Categoria criada' })
              close()
            }}
            extra={
              current && (
                <Button
                  variant="destructive"
                  loading={remove.isPending}
                  onClick={() => deleteWithUndo(current.id, 'Categoria', close)}
                >
                  Excluir
                </Button>
              )
            }
          />
        )}
      </Sheet>
    </>
  )
}

// ─── Estabelecimentos ────────────────────────────────────────────────────────

export function PayeesPage() {
  const list = payees.useList()
  const categoryList = categories.useList()
  const { create, update, remove, restore } = payees.useMutations()
  const deleteWithUndo = useDeleteWithUndo(remove, restore)
  const toast = useToast()
  const [search, setSearch] = useState('')
  const [editing, setEditing] = useState<Editing<Payee>>(null)
  const close = () => {
    setEditing(null)
    create.reset()
    update.reset()
  }
  const current = editing !== 'new' ? editing : null
  const categoryById = new Map((categoryList.data ?? []).map((category) => [category.id, category]))

  const term = search.trim().toLocaleLowerCase('pt-BR')
  const filtered = term
    ? (list.data ?? []).filter((payee) => payee.name.toLocaleLowerCase('pt-BR').includes(term))
    : list.data

  return (
    <>
      <PageHeader
        title="Estabelecimentos"
        back={backToConfig}
        actions={<AddButton label="Novo estabelecimento" onClick={() => setEditing('new')} />}
      />
      {(list.data?.length ?? 0) > 0 && (
        <div className="relative mb-5">
          <Search
            className="pointer-events-none absolute top-1/2 left-4 size-4 -translate-y-1/2 text-text-2"
            aria-hidden
          />
          <input
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Buscar"
            aria-label="Buscar estabelecimento"
            className={`${inputClass} bg-surface pl-11 shadow-card`}
          />
        </div>
      )}
      <ListStates
        query={list}
        items={filtered}
        empty={
          term ? (
            <EmptyState
              icon={Search}
              title="Nada encontrado"
              description={`Nenhum estabelecimento com "${search}".`}
            />
          ) : (
            <EmptyState
              icon={Store}
              title="Nenhum estabelecimento ainda"
              description="Eles também são criados na hora em que você lança um gasto."
              action={<Button onClick={() => setEditing('new')}>Adicionar estabelecimento</Button>}
            />
          )
        }
      >
        {(items) => (
          <GroupedList>
            {items.map((payee) => {
              const category = payee.defaultCategoryId
                ? categoryById.get(payee.defaultCategoryId)
                : undefined
              return (
                <ListRow
                  key={payee.id}
                  icon={category ? categoryIcons[category.icon] : Store}
                  iconColor={category?.color ?? 'var(--chart-8)'}
                  title={payee.name}
                  subtitle={category?.name}
                  onClick={() => setEditing(payee)}
                />
              )
            })}
          </GroupedList>
        )}
      </ListStates>

      <Sheet
        open={editing !== null}
        onClose={close}
        title={current ? 'Editar estabelecimento' : 'Novo estabelecimento'}
      >
        {editing !== null && (
          <PayeeForm
            key={current?.id ?? 'new'}
            initial={current ?? undefined}
            categories={categoryList.data ?? []}
            error={current ? update.error : create.error}
            submitting={create.isPending || update.isPending}
            onSubmit={async (values) => {
              if (current) await update.mutateAsync({ id: current.id, ...values })
              else await create.mutateAsync(values)
              toast({ message: current ? 'Estabelecimento atualizado' : 'Estabelecimento criado' })
              close()
            }}
            extra={
              current && (
                <Button
                  variant="destructive"
                  loading={remove.isPending}
                  onClick={() => deleteWithUndo(current.id, 'Estabelecimento', close)}
                >
                  Excluir
                </Button>
              )
            }
          />
        )}
      </Sheet>
    </>
  )
}
