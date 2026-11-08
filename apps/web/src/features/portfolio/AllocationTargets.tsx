import { ASSET_CLASS_KINDS, PALETTE } from '@orla/core'
import type { AssetClass, AssetClassKindValue } from '@orla/contracts'
import { Pencil, Plus } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { Button } from '@/components/ui/Button'
import { Card, CardHeader } from '@/components/ui/Card'
import { TextField } from '@/components/ui/Field'
import { ColorPicker } from '@/components/ui/Pickers'
import { ProgressBar } from '@/components/ui/Progress'
import { SelectField } from '@/components/ui/Select'
import { Sheet } from '@/components/ui/Sheet'
import { ErrorState, Skeleton } from '@/components/ui/States'
import { useToast } from '@/components/ui/Toast'
import { errorMessage } from '@/lib/api'
import { cn } from '@/lib/cn'
import { useAssetClasses, useAssetClassMutations } from './api'
import { assetClassKindLabels } from './labels'

const toText = (value: string | null) =>
  value === null ? '' : String(Number(value)).replace('.', ',')
const toNumber = (value: string) => {
  const parsed = Number(value.replace(',', '.'))
  return value.trim() === '' ? 0 : parsed
}

/** Criar, renomear, trocar tipo/cor ou excluir uma classe (a API recusa excluir com ativos). */
function ClassForm({ initial, onDone }: { initial: AssetClass | null; onDone: () => void }) {
  const { create, update, remove } = useAssetClassMutations()
  const toast = useToast()
  const [name, setName] = useState(initial?.name ?? '')
  const [kind, setKind] = useState<AssetClassKindValue>(initial?.kind ?? 'other')
  const [color, setColor] = useState(initial?.color ?? PALETTE[0] ?? '#007AFF')
  const mutation = initial ? update : create
  const error = mutation.error ?? remove.error

  async function submit(event: FormEvent) {
    event.preventDefault()
    const values = { name: name.trim(), kind, color }
    if (initial) await update.mutateAsync({ id: initial.id, ...values })
    else await create.mutateAsync(values)
    toast({ message: initial ? 'Classe atualizada' : 'Classe criada' })
    onDone()
  }

  return (
    <form noValidate className="space-y-4" onSubmit={(event) => void submit(event).catch(() => {})}>
      <TextField
        label="Nome"
        value={name}
        onChange={(event) => setName(event.target.value)}
        placeholder="Ex.: Exterior"
        autoFocus={!initial}
      />
      <SelectField
        label="Tipo"
        value={kind}
        onChange={(event) => setKind(event.target.value as AssetClassKindValue)}
        hint="Renda fixa usa valor aplicado e saldo; os outros tipos usam quantidade e preço."
      >
        {ASSET_CLASS_KINDS.map((item) => (
          <option key={item} value={item}>
            {assetClassKindLabels[item]}
          </option>
        ))}
      </SelectField>
      <ColorPicker label="Cor" value={color} onChange={setColor} />
      {error && (
        <p role="alert" className="text-footnote text-negative">
          {errorMessage(error)}
        </p>
      )}
      <div className="flex flex-col gap-2 pt-2">
        <Button type="submit" block loading={mutation.isPending} disabled={!name.trim()}>
          {initial ? 'Salvar' : 'Criar classe'}
        </Button>
        {initial && (
          <Button
            variant="destructive"
            block
            loading={remove.isPending}
            onClick={() => {
              if (!window.confirm(`Excluir a classe ${initial.name}?`)) return
              remove.mutate(initial.id, {
                onSuccess: () => {
                  toast({ message: 'Classe excluída' })
                  onDone()
                },
              })
            }}
          >
            Excluir classe
          </Button>
        )}
      </div>
    </form>
  )
}

function Form({
  classes,
  onEditClass,
}: {
  classes: AssetClass[]
  onEditClass: (item: AssetClass | null) => void
}) {
  const { putTargets } = useAssetClassMutations()
  const toast = useToast()
  const [targets, setTargets] = useState<Record<string, string>>(
    Object.fromEntries(classes.map((item) => [item.id, toText(item.targetPct)])),
  )
  const [maxes, setMaxes] = useState<Record<string, string>>(
    Object.fromEntries(classes.map((item) => [item.id, toText(item.maxPct)])),
  )
  const total = classes.reduce((sum, item) => sum + toNumber(targets[item.id] ?? ''), 0)
  const invalid = classes.some((item) =>
    [targets[item.id] ?? '', maxes[item.id] ?? ''].some((value) => {
      const number = toNumber(value)
      return Number.isNaN(number) || number < 0 || number > 100
    }),
  )
  const rounded = Math.round(total * 100) / 100

  return (
    <Card className="space-y-4">
      <CardHeader
        title="Alocação por classe"
        action={
          <Button variant="plain" className="px-3" onClick={() => onEditClass(null)}>
            <Plus className="size-4" aria-hidden /> Classe
          </Button>
        }
      />
      <p className="text-subhead text-text-2">
        Quanto da carteira você quer em cada classe. A carteira mostra o desvio e o aporte usa essas
        metas. O teto é opcional (alerta de concentração).
      </p>
      <ul className="space-y-3">
        {classes.map((item) => (
          <li
            key={item.id}
            className="grid grid-cols-2 gap-x-2 gap-y-1 sm:grid-cols-[minmax(0,1fr)_6rem_6rem] sm:items-end"
          >
            <button
              type="button"
              onClick={() => onEditClass(item)}
              aria-label={`Editar classe ${item.name}`}
              className="group col-span-2 flex min-h-11 min-w-0 items-center gap-2 rounded-field text-left sm:col-span-1 sm:min-h-12 sm:pb-0.5"
            >
              <span
                className="size-2.5 shrink-0 rounded-full"
                style={{ backgroundColor: item.color }}
              />
              <span className="truncate text-body">{item.name}</span>
              <Pencil
                className="size-3.5 shrink-0 text-text-3 transition-colors group-hover:text-accent"
                aria-hidden
              />
            </button>
            <TextField
              label="Meta %"
              inputMode="decimal"
              value={targets[item.id] ?? ''}
              placeholder="0"
              onChange={(event) =>
                setTargets((current) => ({ ...current, [item.id]: event.target.value }))
              }
            />
            <TextField
              label="Teto %"
              inputMode="decimal"
              value={maxes[item.id] ?? ''}
              placeholder="—"
              onChange={(event) =>
                setMaxes((current) => ({ ...current, [item.id]: event.target.value }))
              }
            />
          </li>
        ))}
      </ul>
      <div className="space-y-1.5">
        <ProgressBar
          value={Math.min(total, 100) / 100}
          tone={rounded === 100 ? 'positive' : rounded > 100 ? 'negative' : 'accent'}
          label="Soma das metas"
        />
        <p
          className={cn('text-footnote tabular', rounded === 100 ? 'text-positive' : 'text-text-2')}
        >
          Soma: {String(rounded).replace('.', ',')}%{' '}
          {rounded === 100
            ? '· tudo certo'
            : rounded > 100
              ? `· passou ${String(rounded - 100).replace('.', ',')} p.p.`
              : `· faltam ${String(Math.round((100 - rounded) * 100) / 100).replace('.', ',')} p.p.`}
        </p>
      </div>
      {putTargets.error && (
        <p role="alert" className="text-footnote text-negative">
          {errorMessage(putTargets.error)}
        </p>
      )}
      <Button
        block
        loading={putTargets.isPending}
        disabled={invalid}
        onClick={() =>
          putTargets.mutate(
            {
              items: classes.map((item) => ({
                assetClassId: item.id,
                targetPct: String(toNumber(targets[item.id] ?? '')),
                maxPct: (maxes[item.id] ?? '').trim()
                  ? String(toNumber(maxes[item.id] ?? ''))
                  : null,
              })),
            },
            {
              onSuccess: () =>
                toast({
                  message:
                    rounded === 100 ? 'Metas salvas' : 'Metas salvas (a soma ainda não dá 100%)',
                }),
            },
          )
        }
      >
        Salvar alocação
      </Button>
    </Card>
  )
}

/** Configurações › Metas: alocação alvo por classe (docs/10), soma 100% como aviso. */
export function AllocationTargets() {
  const query = useAssetClasses()
  const [editing, setEditing] = useState<{ item: AssetClass | null } | null>(null)
  if (query.isPending) return <Skeleton className="h-72 rounded-card" />
  if (query.isError) {
    return (
      <Card>
        <ErrorState description={errorMessage(query.error)} onRetry={() => void query.refetch()} />
      </Card>
    )
  }
  return (
    <>
      <Form
        key={query.data.map((item) => `${item.id}:${item.targetPct}:${item.maxPct}`).join('|')}
        classes={query.data}
        onEditClass={(item) => setEditing({ item })}
      />
      <Sheet
        open={editing !== null}
        onClose={() => setEditing(null)}
        title={editing?.item ? 'Editar classe' : 'Nova classe'}
      >
        {editing && (
          <ClassForm
            key={editing.item?.id ?? 'new'}
            initial={editing.item}
            onDone={() => setEditing(null)}
          />
        )}
      </Sheet>
    </>
  )
}
