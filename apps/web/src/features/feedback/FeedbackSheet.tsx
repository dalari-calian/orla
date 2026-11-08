import type { FeedbackKindValue } from '@orla/contracts'
import { Bug, Lightbulb } from 'lucide-react'
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from 'react'
import { useLocation } from 'react-router'
import { Button } from '@/components/ui/Button'
import { TextAreaField, TextField } from '@/components/ui/Field'
import { SegmentedControl } from '@/components/ui/SegmentedControl'
import { Sheet } from '@/components/ui/Sheet'
import { useToast } from '@/components/ui/Toast'
import { errorMessage } from '@/lib/api'
import { CURRENT_PHASE } from '@/routes/screens'
import { useFeedbackMutations } from './api'

interface FeedbackContextValue {
  /** Abre o formulário de relato (bug por padrão). */
  openFeedback: (kind?: FeedbackKindValue) => void
}

const FeedbackContext = createContext<FeedbackContextValue>({ openFeedback: () => undefined })

export const useFeedback = () => useContext(FeedbackContext)

/** Telas que não dizem onde o problema aconteceu (o relato fica com a anterior). */
const NEUTRAL_PAGES = ['/mais', '/config', '/config/feedback']

const kindOptions = [
  { value: 'bug', label: 'Bug', icon: Bug },
  { value: 'improvement', label: 'Melhoria', icon: Lightbulb },
] as const

function themeOf(): string {
  return document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light'
}

function FeedbackForm({
  initialKind,
  page,
  onDone,
}: {
  initialKind: FeedbackKindValue
  page: string | null
  onDone: () => void
}) {
  const { create } = useFeedbackMutations()
  const toast = useToast()
  const [kind, setKind] = useState<FeedbackKindValue>(initialKind)
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [attachPage, setAttachPage] = useState(Boolean(page))
  const viewport = `${window.innerWidth}x${window.innerHeight}`

  async function submit(event: FormEvent) {
    event.preventDefault()
    await create.mutateAsync({
      kind,
      title,
      description,
      page: attachPage ? page : null,
      context: {
        appVersion: `fase-${CURRENT_PHASE}`,
        userAgent: navigator.userAgent.slice(0, 400),
        viewport,
        theme: themeOf(),
      },
    })
    toast({ message: 'Recebido, obrigado. Acompanhe em Bugs e melhorias.' })
    onDone()
  }

  return (
    <form
      noValidate
      className="space-y-4"
      onSubmit={(event) => void submit(event).catch(() => undefined)}
    >
      <SegmentedControl label="Tipo" options={kindOptions} value={kind} onChange={setKind} />
      <TextField
        label="Título"
        data-autofocus
        value={title}
        maxLength={120}
        onChange={(event) => setTitle(event.target.value)}
        placeholder={
          kind === 'bug'
            ? 'Ex.: Gráfico de proventos some no celular'
            : 'Ex.: Filtrar por corretora'
        }
      />
      <TextAreaField
        label={kind === 'bug' ? 'O que aconteceu?' : 'O que você gostaria?'}
        value={description}
        maxLength={4000}
        onChange={(event) => setDescription(event.target.value)}
        placeholder={
          kind === 'bug'
            ? 'O que você fez, o que esperava e o que apareceu.'
            : 'Como funcionaria e por que ajudaria no seu dia a dia.'
        }
      />
      {page && (
        <label className="flex min-h-11 cursor-pointer items-center gap-3 rounded-field bg-surface-2 px-3 py-2 text-subhead">
          <input
            type="checkbox"
            className="size-5 accent-[var(--accent)]"
            checked={attachPage}
            onChange={(event) => setAttachPage(event.target.checked)}
          />
          <span className="min-w-0">
            É sobre a tela <span className="font-medium break-all">{page}</span>
          </span>
        </label>
      )}
      <p className="text-footnote text-text-2">
        Vai junto, para ajudar no diagnóstico: tamanho da tela ({viewport}), tema e navegador.
      </p>
      {create.error && (
        <p role="alert" className="text-footnote text-negative">
          {errorMessage(create.error)}
        </p>
      )}
      <Button type="submit" block loading={create.isPending}>
        Enviar
      </Button>
    </form>
  )
}

/** Botão "Reportar bug ou sugerir melhoria" disponível em todo o app (docs/15). */
export function FeedbackProvider({ children }: { children: ReactNode }) {
  const { pathname } = useLocation()
  const lastPage = useRef<string | null>(null)
  const [open, setOpen] = useState<{ kind: FeedbackKindValue; page: string | null } | null>(null)

  useEffect(() => {
    if (!NEUTRAL_PAGES.includes(pathname)) lastPage.current = pathname
  }, [pathname])

  const openFeedback = useCallback((kind: FeedbackKindValue = 'bug') => {
    setOpen({ kind, page: lastPage.current })
  }, [])
  const value = useMemo(() => ({ openFeedback }), [openFeedback])

  return (
    <FeedbackContext.Provider value={value}>
      {children}
      <Sheet
        open={open !== null}
        onClose={() => setOpen(null)}
        title="Reportar bug ou sugerir melhoria"
      >
        {open && (
          <FeedbackForm initialKind={open.kind} page={open.page} onDone={() => setOpen(null)} />
        )}
      </Sheet>
    </FeedbackContext.Provider>
  )
}
