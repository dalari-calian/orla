import { feedbackTransitions, isOpenFeedback } from '@orla/core'
import type {
  AdminFeedback,
  Feedback,
  FeedbackKindValue,
  FeedbackPriorityValue,
  FeedbackStatusValue,
} from '@orla/contracts'
import { Bug, Lightbulb, MessageSquarePlus } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { PageHeader } from '@/components/layout/PageHeader'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { ChipGroup } from '@/components/ui/Chips'
import { TextAreaField } from '@/components/ui/Field'
import { SegmentedControl } from '@/components/ui/SegmentedControl'
import { SelectField } from '@/components/ui/Select'
import { Sheet } from '@/components/ui/Sheet'
import { SlideSwap } from '@/components/ui/SlideSwap'
import { EmptyState, ErrorState, Skeleton } from '@/components/ui/States'
import { useToast } from '@/components/ui/Toast'
import { useMe } from '@/features/auth/api'
import { errorMessage } from '@/lib/api'
import { useAdminFeedback, useFeedbackMutations, useMyFeedback } from './api'
import { useFeedback } from './FeedbackSheet'
import {
  feedbackKindLabels,
  feedbackPriorityLabels,
  feedbackStatusColors,
  feedbackStatusHints,
  feedbackStatusLabels,
} from './labels'

const dateFormat = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'short' })
const dateTimeFormat = new Intl.DateTimeFormat('pt-BR', {
  day: '2-digit',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
})
const shortDate = (iso: string) => dateFormat.format(new Date(iso))

function StatusPill({ status }: { status: FeedbackStatusValue }) {
  const color = feedbackStatusColors[status]
  return (
    <span
      className="inline-flex shrink-0 items-center rounded-full px-2.5 py-0.5 text-caption font-semibold"
      style={{ color, backgroundColor: `color-mix(in srgb, ${color} 14%, transparent)` }}
    >
      {feedbackStatusLabels[status]}
    </span>
  )
}

function KindIcon({ kind }: { kind: FeedbackKindValue }) {
  const Icon = kind === 'bug' ? Bug : Lightbulb
  const color = kind === 'bug' ? 'var(--negative)' : 'var(--warning)'
  return (
    <span
      className="flex size-9 shrink-0 items-center justify-center rounded-full"
      style={{ color, backgroundColor: `color-mix(in srgb, ${color} 14%, transparent)` }}
      aria-label={feedbackKindLabels[kind]}
    >
      <Icon className="size-[18px]" aria-hidden />
    </span>
  )
}

// ─── Meus envios ─────────────────────────────────────────────────────────────

function MyItem({ item }: { item: Feedback }) {
  const { remove } = useFeedbackMutations()
  const toast = useToast()
  return (
    <li className="space-y-2 border-t border-separator px-4 py-3 first:border-t-0 md:px-5">
      <div className="flex items-start gap-3">
        <KindIcon kind={item.kind} />
        <div className="min-w-0 flex-1">
          <p className="text-body font-medium break-words">{item.title}</p>
          <p className="text-footnote text-text-2">
            {feedbackKindLabels[item.kind]} · enviado em {shortDate(item.createdAt)}
          </p>
        </div>
        <StatusPill status={item.status} />
      </div>
      <p className="pl-12 text-footnote text-text-2">{feedbackStatusHints[item.status]}</p>
      {item.ownerNote && (
        <p className="ml-12 rounded-field bg-surface-2 px-3 py-2 text-subhead break-words whitespace-pre-wrap">
          {item.ownerNote}
        </p>
      )}
      {item.status === 'pending' && (
        <div className="pl-10">
          <Button
            variant="destructive"
            className="min-h-9 px-2 text-footnote"
            loading={remove.isPending && remove.variables === item.id}
            onClick={() => {
              if (!window.confirm('Retirar este relato?')) return
              remove.mutate(item.id, {
                onSuccess: () => toast({ message: 'Relato retirado' }),
                onError: (error) => toast({ message: errorMessage(error), tone: 'error' }),
              })
            }}
          >
            Retirar
          </Button>
        </div>
      )}
    </li>
  )
}

function MyFeedback() {
  const query = useMyFeedback()
  const { openFeedback } = useFeedback()
  if (query.isPending) return <Skeleton className="h-48 rounded-card" />
  if (query.isError)
    return (
      <Card>
        <ErrorState description={errorMessage(query.error)} onRetry={() => void query.refetch()} />
      </Card>
    )
  if (query.data.length === 0)
    return (
      <Card>
        <EmptyState
          icon={MessageSquarePlus}
          title="Nada enviado ainda"
          description="Achou um problema ou teve uma ideia? Conte aqui e acompanhe o andamento."
          action={<Button onClick={() => openFeedback()}>Reportar ou sugerir</Button>}
        />
      </Card>
    )
  return (
    <Card className="p-0 md:p-0">
      <ul>
        {query.data.map((item) => (
          <MyItem key={item.id} item={item} />
        ))}
      </ul>
    </Card>
  )
}

// ─── Fila do dono ────────────────────────────────────────────────────────────

type StatusFilter = FeedbackStatusValue | 'open'
type KindFilter = FeedbackKindValue | 'all'

function TriageForm({ item, onDone }: { item: AdminFeedback; onDone: () => void }) {
  const { update } = useFeedbackMutations()
  const toast = useToast()
  const [status, setStatus] = useState<FeedbackStatusValue>(item.status)
  const [priority, setPriority] = useState<FeedbackPriorityValue | ''>(item.priority ?? '')
  const [note, setNote] = useState(item.ownerNote ?? '')
  const next = feedbackTransitions(item.status, 'owner')

  async function submit(event: FormEvent) {
    event.preventDefault()
    await update.mutateAsync({
      id: item.id,
      ...(status !== item.status && { status }),
      priority: priority || null,
      ownerNote: note.trim() || null,
    })
    toast({ message: 'Relato atualizado' })
    onDone()
  }

  return (
    <form
      noValidate
      className="space-y-4"
      onSubmit={(event) => void submit(event).catch(() => undefined)}
    >
      <div className="grid grid-cols-2 gap-3">
        <SelectField
          label="Status"
          value={status}
          onChange={(event) => setStatus(event.target.value as FeedbackStatusValue)}
        >
          <option value={item.status}>{feedbackStatusLabels[item.status]}</option>
          {next.map((value) => (
            <option key={value} value={value}>
              {feedbackStatusLabels[value]}
            </option>
          ))}
        </SelectField>
        <SelectField
          label="Prioridade"
          value={priority}
          onChange={(event) => setPriority(event.target.value as FeedbackPriorityValue | '')}
        >
          <option value="">Sem prioridade</option>
          {(['high', 'medium', 'low'] as const).map((value) => (
            <option key={value} value={value}>
              {feedbackPriorityLabels[value]}
            </option>
          ))}
        </SelectField>
      </div>
      <TextAreaField
        label="Nota para o agente e para quem enviou"
        value={note}
        maxLength={2000}
        onChange={(event) => setNote(event.target.value)}
        placeholder="Escopo, critério de aceite ou motivo da recusa."
        hint="Agentes só pegam itens Aprovados e seguem esta nota como limite do que fazer."
      />
      {update.error && (
        <p role="alert" className="text-footnote text-negative">
          {errorMessage(update.error)}
        </p>
      )}
      <Button type="submit" block loading={update.isPending}>
        Salvar
      </Button>
    </form>
  )
}

function Detail({ item, onDone }: { item: AdminFeedback; onDone: () => void }) {
  const context = item.context
  return (
    <div className="space-y-5">
      <div className="space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <StatusPill status={item.status} />
          <span className="text-footnote text-text-2">
            {feedbackKindLabels[item.kind]} · {item.user.displayName || item.user.username} ·{' '}
            {shortDate(item.createdAt)}
          </span>
        </div>
        <p className="text-headline font-semibold break-words">{item.title}</p>
        <p className="text-body break-words whitespace-pre-wrap">{item.description}</p>
        <p className="text-footnote text-text-2 break-all">
          {[
            item.page && `Tela ${item.page}`,
            context?.viewport,
            context?.theme && `tema ${context.theme}`,
            context?.appVersion,
          ]
            .filter(Boolean)
            .join(' · ')}
        </p>
        <p className="text-footnote text-text-2">
          Na fila de agentes:{' '}
          <code className="rounded bg-surface-2 px-1.5 py-0.5">
            pnpm feedback show {item.id.slice(0, 8)}
          </code>
        </p>
      </div>

      {(item.agentNotes || item.branch) && (
        <div className="space-y-1 rounded-field bg-surface-2 px-3 py-2">
          <p className="text-footnote font-medium text-text-2">Agente</p>
          {item.branch && (
            <p className="text-footnote break-all">
              Branch <code>{item.branch}</code>
              {item.commitSha && (
                <>
                  {' '}
                  · commit <code>{item.commitSha.slice(0, 7)}</code>
                </>
              )}
            </p>
          )}
          {item.agentNotes && (
            <p className="text-subhead break-words whitespace-pre-wrap">{item.agentNotes}</p>
          )}
        </div>
      )}

      <TriageForm item={item} onDone={onDone} />

      <div className="space-y-1.5">
        <p className="text-footnote font-medium text-text-2">Histórico</p>
        <ol className="space-y-1 text-footnote text-text-2">
          {item.events.map((event) => (
            <li key={event.id} className="break-words">
              {dateTimeFormat.format(new Date(event.createdAt))} ·{' '}
              {event.actor === 'owner' ? 'dono' : event.actor === 'agent' ? 'agente' : 'usuário'}
              {event.toStatus &&
                ` · ${event.fromStatus ? `${feedbackStatusLabels[event.fromStatus]} → ` : ''}${feedbackStatusLabels[event.toStatus]}`}
              {event.note && ` · ${event.note}`}
            </li>
          ))}
        </ol>
      </div>
    </div>
  )
}

function Queue() {
  const query = useAdminFeedback({ status: null, kind: null }, true)
  const [status, setStatus] = useState<StatusFilter>('open')
  const [kind, setKind] = useState<KindFilter>('all')
  const [selectedId, setSelectedId] = useState<string | null>(null)

  if (query.isPending) return <Skeleton className="h-64 rounded-card" />
  if (query.isError)
    return (
      <Card>
        <ErrorState description={errorMessage(query.error)} onRetry={() => void query.refetch()} />
      </Card>
    )

  const { data, counts } = query.data
  const openCount = counts.pending + counts.approved + counts.in_progress + counts.review
  const items = data.filter(
    (item) =>
      (status === 'open' ? isOpenFeedback(item.status) : item.status === status) &&
      (kind === 'all' || item.kind === kind),
  )
  const selected = data.find((item) => item.id === selectedId) ?? null
  const statusOptions = [
    { value: 'open' as const, label: `Abertos ${openCount}` },
    ...(['pending', 'approved', 'in_progress', 'review', 'done', 'rejected'] as const).map(
      (value) => ({ value, label: `${feedbackStatusLabels[value]} ${counts[value]}` }),
    ),
  ]

  return (
    <div className="space-y-4">
      <ChipGroup
        label="Status"
        options={statusOptions}
        value={status}
        onChange={(value) => setStatus(value ?? 'open')}
      />
      <SegmentedControl
        label="Tipo"
        options={[
          { value: 'all', label: 'Todos' },
          { value: 'bug', label: 'Bugs' },
          { value: 'improvement', label: 'Melhorias' },
        ]}
        value={kind}
        onChange={setKind}
      />
      {items.length === 0 ? (
        <Card>
          <EmptyState
            icon={MessageSquarePlus}
            title="Nada por aqui"
            description="Nenhum relato com esse filtro."
          />
        </Card>
      ) : (
        <Card className="p-0 md:p-0">
          <ul>
            {items.map((item) => (
              <li key={item.id} className="border-t border-separator first:border-t-0">
                <button
                  type="button"
                  onClick={() => setSelectedId(item.id)}
                  className="flex min-h-15 w-full items-center gap-3 px-4 py-2.5 text-left transition-colors hover:bg-surface-2 md:px-5"
                >
                  <KindIcon kind={item.kind} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-body">{item.title}</span>
                    <span className="block truncate text-footnote text-text-2">
                      {item.user.displayName || item.user.username} · {shortDate(item.createdAt)}
                      {item.priority && ` · prioridade ${feedbackPriorityLabels[item.priority]}`}
                      {item.page && ` · ${item.page}`}
                    </span>
                  </span>
                  <StatusPill status={item.status} />
                </button>
              </li>
            ))}
          </ul>
        </Card>
      )}
      <Sheet open={selected !== null} onClose={() => setSelectedId(null)} title="Relato">
        {selected && (
          <Detail
            key={`${selected.id}:${selected.updatedAt}`}
            item={selected}
            onDone={() => setSelectedId(null)}
          />
        )}
      </Sheet>
    </div>
  )
}

/** /config/feedback — relatos de bug e sugestões (docs/15). */
export function FeedbackPage() {
  const me = useMe()
  const { openFeedback } = useFeedback()
  const isAdmin = Boolean(me.data?.isAdmin)
  const [tab, setTab] = useState<'queue' | 'mine'>('queue')
  const current = isAdmin ? tab : 'mine'

  return (
    <>
      <PageHeader
        title="Bugs e melhorias"
        back={{ to: '/config', label: 'Ajustes' }}
        actions={
          <Button variant="plain" className="px-3" onClick={() => openFeedback()}>
            <MessageSquarePlus className="size-5" aria-hidden />
            <span className="hidden sm:inline">Reportar</span>
          </Button>
        }
      />
      <div className="max-w-3xl space-y-5">
        {isAdmin && (
          <SegmentedControl
            label="Visão"
            options={[
              { value: 'queue', label: 'Fila' },
              { value: 'mine', label: 'Meus envios' },
            ]}
            value={tab}
            onChange={setTab}
          />
        )}
        <SlideSwap index={current === 'queue' ? 0 : 1}>
          {current === 'queue' ? <Queue /> : <MyFeedback />}
        </SlideSwap>
      </div>
    </>
  )
}
