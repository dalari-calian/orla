import { currentCompetenceMonth } from '@orla/core'
import {
  type BankMapping,
  buildMonthlyDrafts,
  type Cell,
  cellText,
  type ColumnMapping,
  distinctBanks,
  INSTALLMENT_FIELDS,
  installmentRowToDraft,
  normalizeText,
  type ParsedImportRow,
  pickFields,
  readMonthlySheet,
  suggestMapping,
  TRANSACTION_FIELDS,
  transactionRowToDraft,
} from '@orla/core/import'
import { formatBRL } from '@orla/core/money'
import type { ImportJob, ImportKind, ImportRowCheck } from '@orla/contracts'
import {
  CalendarRange,
  CircleAlert,
  CircleCheck,
  Copy,
  Download,
  FileSpreadsheet,
  ListChecks,
  ReceiptText,
  Upload,
  type LucideIcon,
} from 'lucide-react'
import { useId, useMemo, useState, type ReactNode } from 'react'
import { Link } from 'react-router'
import { PageHeader } from '@/components/layout/PageHeader'
import { Button } from '@/components/ui/Button'
import { Card, CardHeader } from '@/components/ui/Card'
import { ChipGroup } from '@/components/ui/Chips'
import { TextField } from '@/components/ui/Field'
import { SegmentedControl } from '@/components/ui/SegmentedControl'
import { SelectField } from '@/components/ui/Select'
import { SlideSwap } from '@/components/ui/SlideSwap'
import { useToast } from '@/components/ui/Toast'
import { monthLabel, shortMonthLabel } from '@/features/finances/labels'
import { accounts, creditCards } from '@/features/registrations/api'
import { errorMessage } from '@/lib/api'
import { cn } from '@/lib/cn'
import {
  createImport,
  sendImportRows,
  useCommitImport,
  useSavedMappings,
  useUndoImport,
} from './api'
import { ACCEPTED_FILES, downloadExample, type LoadedFile, readSpreadsheet } from './files'

type Step = 'kind' | 'file' | 'map' | 'preview' | 'done'
const STEPS: { key: Step; label: string }[] = [
  { key: 'kind', label: 'Tipo' },
  { key: 'file', label: 'Arquivo' },
  { key: 'map', label: 'Colunas' },
  { key: 'preview', label: 'Conferir' },
]

const KINDS: { kind: ImportKind; title: string; description: string; icon: LucideIcon }[] = [
  {
    kind: 'monthly_sheet',
    title: 'Minha planilha mensal',
    description:
      'Um bloco por mês (JANEIRO, FEVEREIRO...) com entradas, despesas, parcelas e "valor economizar".',
    icon: FileSpreadsheet,
  },
  {
    kind: 'transactions',
    title: 'Lançamentos',
    description: 'Uma linha por gasto ou receita (template do Orla, extrato ou outra planilha).',
    icon: ReceiptText,
  },
  {
    kind: 'installments',
    title: 'Parcelamentos',
    description: 'Uma linha por compra parcelada, com a parcela em que você está.',
    icon: CalendarRange,
  },
]

/** Progresso do wizard (passos curtos, docs/08). */
function Stepper({ step }: { step: Step }) {
  const index = STEPS.findIndex((item) => item.key === step)
  return (
    <ol className="mb-5 flex gap-1.5" aria-label="Passos da importação">
      {STEPS.map((item, i) => (
        <li key={item.key} className="flex-1" aria-current={i === index ? 'step' : undefined}>
          <span
            className={cn(
              'block h-1 rounded-full transition-colors duration-300',
              i <= index || step === 'done' ? 'bg-accent' : 'bg-separator',
            )}
          />
          <span
            className={cn(
              'mt-1.5 block text-caption',
              i === index ? 'font-medium text-text' : 'text-text-2',
            )}
          >
            {item.label}
          </span>
        </li>
      ))}
    </ol>
  )
}

/** Primeira linha com pelo menos 2 células preenchidas = cabeçalho. */
function headerRowIndex(rows: readonly Cell[][]): number {
  const index = rows.findIndex((row) => row.filter((cell) => cellText(cell) !== '').length >= 2)
  return Math.max(0, index)
}

function yearFromName(name: string): number {
  const match = /(20\d{2})/.exec(name)
  return match ? Number(match[1]) : new Date().getFullYear()
}

const kindLabel: Record<BankMapping['kind'], string> = {
  card: 'Cartão',
  account: 'Conta',
  payee: 'Pessoa/loja',
  ignore: 'Ignorar',
}

const titleCase = (value: string) =>
  value.toLocaleLowerCase('pt-BR').replace(/(^|\s)\S/g, (char) => char.toLocaleUpperCase('pt-BR'))

/** Rótulo curto de um item na pré-visualização. */
function describeRow(row: ParsedImportRow): { title: string; subtitle: string; amount: string } {
  const draft = row.draft
  if (!draft) {
    return {
      title: row.raw.descricao ?? row.raw.description ?? Object.values(row.raw)[0] ?? 'Linha',
      subtitle: row.errors[0] ?? row.skipped ?? '',
      amount: '',
    }
  }
  if (draft.kind === 'transaction') {
    const month = draft.competenceMonth ?? draft.date.slice(0, 7)
    return {
      title: draft.description,
      subtitle: `${shortMonthLabel(month)} · ${draft.type === 'income' ? 'receita' : 'despesa'} · ${draft.status === 'settled' ? (draft.type === 'income' ? 'recebido' : 'pago') : 'previsto'}`,
      amount: `${draft.type === 'income' ? '+' : '−'}${formatBRL(draft.amountCents)}`,
    }
  }
  if (draft.kind === 'installmentPlan') {
    return {
      title: draft.description,
      subtitle: `Parcelamento ${draft.installmentsCount}× · ${draft.firstCompetenceMonth ? `1ª em ${shortMonthLabel(draft.firstCompetenceMonth)} · ` : ''}${draft.settledCount ?? 0} pagas${draft.payoffMonth ? ' · quitado' : ''}`,
      amount: formatBRL(draft.totalCents),
    }
  }
  return {
    title: `Meta investida de ${monthLabel(draft.month)}`,
    subtitle: 'Vai para a aba Investimento do mês',
    amount: formatBRL(draft.investedCents),
  }
}

type RowStatus = ImportRowCheck['status'] | 'skipped'
const statusStyle: Record<RowStatus, { label: string; className: string }> = {
  ok: { label: 'Pronto', className: 'bg-positive/12 text-positive' },
  warning: { label: 'Conferir', className: 'bg-warning/15 text-warning' },
  duplicate: { label: 'Duplicado?', className: 'bg-accent/12 text-accent' },
  error: { label: 'Erro', className: 'bg-negative/12 text-negative' },
  skipped: { label: 'Ignorada', className: 'bg-surface-2 text-text-2' },
}

type Filter = 'all' | 'warning' | 'duplicate' | 'error' | 'skipped'

interface PreviewRow {
  parsed: ParsedImportRow
  status: RowStatus
  messages: string[]
  creates: string[]
}

/** /config/importar — wizard de importação (docs/08 › Fluxo). */
export function ImportPage() {
  const toast = useToast()
  const [step, setStep] = useState<Step>('kind')
  const [direction, setDirection] = useState(0)
  const [kind, setKind] = useState<ImportKind>('monthly_sheet')
  const [file, setFile] = useState<LoadedFile | null>(null)
  const [sheetName, setSheetName] = useState('')
  const [year, setYear] = useState(String(new Date().getFullYear()))
  const [reading, setReading] = useState(false)
  const [fileError, setFileError] = useState<string | null>(null)
  const [mapping, setMapping] = useState<ColumnMapping>({})
  const [banks, setBanks] = useState<Record<string, BankMapping>>({})
  const [jobId, setJobId] = useState<string | null>(null)
  const [preview, setPreview] = useState<PreviewRow[] | null>(null)
  const [checking, setChecking] = useState(false)
  const [checkError, setCheckError] = useState<string | null>(null)
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [createMissing, setCreateMissing] = useState(true)
  const [filter, setFilter] = useState<Filter>('all')
  const [result, setResult] = useState<ImportJob | null>(null)
  const saved = useSavedMappings()
  const cardList = creditCards.useList()
  const accountList = accounts.useList()
  const commit = useCommitImport()
  const undo = useUndoImport()
  const fileInputId = useId()

  const sheet = file?.sheets.find((item) => item.name === sheetName) ?? file?.sheets[0]
  const fields = kind === 'installments' ? INSTALLMENT_FIELDS : TRANSACTION_FIELDS
  const headerIndex = sheet ? headerRowIndex(sheet.rows) : 0
  const headers = useMemo(
    () => (sheet?.rows[headerIndex] ?? []).map((cell) => cellText(cell)),
    [sheet, headerIndex],
  )
  const monthly = useMemo(
    () =>
      kind === 'monthly_sheet' && sheet
        ? readMonthlySheet(sheet.rows, Number(year) || new Date().getFullYear())
        : null,
    [kind, sheet, year],
  )
  const bankValues = useMemo(() => (monthly ? distinctBanks(monthly.lines) : []), [monthly])

  function go(next: Step) {
    const order: Step[] = ['kind', 'file', 'map', 'preview', 'done']
    setDirection(order.indexOf(next))
    setStep(next)
    window.scrollTo({ top: 0 })
  }

  async function onFile(input: File | undefined) {
    if (!input) return
    setReading(true)
    setFileError(null)
    try {
      const loaded = await readSpreadsheet(input)
      const usable = loaded.sheets.filter((item) => item.rows.length > 0)
      if (usable.length === 0) throw new Error('O arquivo está vazio')
      setFile({ ...loaded, sheets: usable })
      const first = usable[0] as (typeof usable)[number]
      setSheetName(first.name)
      setYear(String(yearFromName(first.name)))
    } catch (error) {
      setFile(null)
      setFileError(error instanceof Error ? error.message : 'Não foi possível ler o arquivo')
    } finally {
      setReading(false)
    }
  }

  /** Passo 3: sugere o mapeamento (o salvo da última vez tem prioridade) e as associações. */
  function prepareMapping() {
    const last = saved.data?.[kind]
    if (kind === 'monthly_sheet') {
      const previous = (last?.banks ?? {}) as Record<string, BankMapping>
      const next: Record<string, BankMapping> = {}
      for (const { value } of bankValues) {
        const key = normalizeText(value)
        const card = cardList.data?.find((item) => normalizeText(item.name).startsWith(key))
        const account = accountList.data?.find((item) => normalizeText(item.name).startsWith(key))
        next[key] =
          previous[key] ??
          (card
            ? { kind: 'card', name: card.name }
            : account
              ? { kind: 'account', name: account.name }
              : { kind: 'payee', name: titleCase(value) })
      }
      setBanks(next)
    } else {
      const suggestion = suggestMapping(headers, fields)
      const previous = last as Record<string, string | null> | undefined
      if (previous) {
        for (const field of fields) {
          const name = previous[field.key]
          const index = name
            ? headers.findIndex((header) => normalizeText(header) === normalizeText(name))
            : -1
          if (index !== -1) suggestion[field.key] = index
        }
      }
      setMapping(suggestion)
    }
    go('map')
  }

  const missingRequired =
    kind !== 'monthly_sheet' && fields.some((field) => field.required && mapping[field.key] == null)

  function parseRows(): ParsedImportRow[] {
    if (!sheet) return []
    if (kind === 'monthly_sheet' && monthly) {
      return [
        ...buildMonthlyDrafts(monthly.lines, { banks, currentMonth: currentCompetenceMonth() }),
        ...monthly.ignored,
      ].sort((a, b) => a.rowNumber - b.rowNumber)
    }
    const month = currentCompetenceMonth()
    return sheet.rows.slice(headerIndex + 1).flatMap((row, i) => {
      const rowNumber = headerIndex + i + 2
      const values = pickFields(row, mapping)
      const parsed =
        kind === 'installments'
          ? installmentRowToDraft(rowNumber, values, month)
          : transactionRowToDraft(rowNumber, values)
      return parsed.skipped === 'Linha vazia' ? [] : [parsed]
    })
  }

  /** Passo 4: cria a importação, manda os rascunhos em lotes de 500 e junta a conferência. */
  async function check() {
    if (!file) return
    setChecking(true)
    setCheckError(null)
    try {
      const parsed = parseRows()
      const withDraft = parsed.filter((row) => row.draft && row.errors.length === 0)
      if (withDraft.length > 10_000) throw new Error('Máximo de 10 mil linhas por arquivo')
      const savedMapping =
        kind === 'monthly_sheet'
          ? { banks, year: Number(year) }
          : Object.fromEntries(
              fields.map((field) => [
                field.key,
                mapping[field.key] == null ? null : headers[mapping[field.key] as number],
              ]),
            )
      const job = await createImport({ kind, fileName: file.fileName, mapping: savedMapping })
      const checks = new Map<number, ImportRowCheck>()
      for (let i = 0; i < withDraft.length; i += 500) {
        const batch = withDraft.slice(i, i + 500)
        const response = await sendImportRows(job.id, {
          rows: batch.map((row) => ({
            rowNumber: row.rowNumber,
            sourceRows: row.sourceRows,
            raw: Object.fromEntries(
              Object.entries(row.raw).map(([key, value]) => [key, value.slice(0, 500)]),
            ),
            draft: row.draft as NonNullable<ParsedImportRow['draft']>,
          })),
        })
        for (const item of response.rows) checks.set(item.rowNumber, item)
      }
      const rows: PreviewRow[] = parsed.map((row) => {
        const server = checks.get(row.rowNumber)
        if (row.skipped)
          return { parsed: row, status: 'skipped', messages: [row.skipped], creates: [] }
        if (row.errors.length > 0 || !server) {
          return { parsed: row, status: 'error', messages: row.errors, creates: [] }
        }
        const messages = [...server.messages, ...row.warnings]
        const status: RowStatus =
          server.status === 'ok' && row.warnings.length > 0 ? 'warning' : server.status
        return { parsed: row, status, messages, creates: server.creates }
      })
      setJobId(job.id)
      setPreview(rows)
      setSelected(
        new Set(
          rows
            .filter((row) => row.status === 'ok' || row.status === 'warning')
            .map((row) => row.parsed.rowNumber),
        ),
      )
      setFilter('all')
      go('preview')
    } catch (error) {
      setCheckError(errorMessage(error))
    } finally {
      setChecking(false)
    }
  }

  async function confirm() {
    if (!jobId || !preview) return
    const skipRows = preview
      .filter((row) => row.parsed.draft && !selected.has(row.parsed.rowNumber))
      .map((row) => row.parsed.rowNumber)
    try {
      const job = await commit.mutateAsync({ id: jobId, skipRows, createMissing })
      setResult(job)
      go('done')
    } catch (error) {
      toast({ message: errorMessage(error), tone: 'error' })
    }
  }

  function restart() {
    setFile(null)
    setPreview(null)
    setJobId(null)
    setResult(null)
    commit.reset()
    go('kind')
  }

  const counts = useMemo(() => {
    const out: Record<RowStatus, number> = { ok: 0, warning: 0, duplicate: 0, error: 0, skipped: 0 }
    for (const row of preview ?? []) out[row.status] += 1
    return out
  }, [preview])
  const creates = useMemo(
    () => [
      ...new Set(
        (preview ?? [])
          .filter((row) => selected.has(row.parsed.rowNumber))
          .flatMap((row) => row.creates),
      ),
    ],
    [preview, selected],
  )
  const visible = (preview ?? []).filter((row) =>
    filter === 'all'
      ? true
      : filter === 'warning'
        ? row.status === 'warning'
        : row.status === filter,
  )

  return (
    <>
      <PageHeader
        title="Importar planilhas"
        subtitle="Traga o histórico das suas planilhas. Nada é gravado antes de você conferir."
        back={{ to: '/config', label: 'Ajustes' }}
        actions={
          <Link
            to="/config/importacoes"
            className="flex min-h-11 items-center gap-1.5 px-3 text-subhead font-medium text-accent"
          >
            <ListChecks className="size-5" aria-hidden />
            <span className="hidden sm:inline">Histórico</span>
          </Link>
        }
      />
      <div className="max-w-3xl">
        {step !== 'done' && <Stepper step={step} />}
        <SlideSwap index={direction}>
          {step === 'kind' && (
            <div className="space-y-3">
              {KINDS.map((item) => (
                <button
                  key={item.kind}
                  type="button"
                  onClick={() => {
                    setKind(item.kind)
                    go('file')
                  }}
                  className="press flex w-full items-start gap-3 rounded-card bg-surface p-4 text-left shadow-card transition-colors hover:bg-surface-2"
                >
                  <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-accent/12 text-accent">
                    <item.icon className="size-5" aria-hidden />
                  </span>
                  <span className="min-w-0">
                    <span className="block text-headline font-semibold">{item.title}</span>
                    <span className="block text-subhead text-text-2">{item.description}</span>
                  </span>
                </button>
              ))}
              <Card className="space-y-2">
                <CardHeader title="Planilhas de exemplo" />
                <p className="text-subhead text-text-2">
                  Veja como o Orla espera cada planilha: uma aba preenchida de exemplo e outra com
                  as instruções de cada coluna. Dá para preencher a própria planilha de exemplo e
                  importar.
                </p>
                <div className="flex flex-wrap gap-2">
                  {KINDS.map((item) => (
                    <ExampleButton key={item.kind} kind={item.kind} label={item.title} />
                  ))}
                </div>
              </Card>
            </div>
          )}

          {step === 'file' && (
            <Card className="space-y-4">
              <CardHeader title={KINDS.find((item) => item.kind === kind)?.title ?? 'Arquivo'} />
              <label
                htmlFor={fileInputId}
                className="flex min-h-36 cursor-pointer flex-col items-center justify-center gap-2 rounded-card border border-dashed border-separator bg-surface-2 p-5 text-center transition-colors hover:border-accent"
                onDragOver={(event) => event.preventDefault()}
                onDrop={(event) => {
                  event.preventDefault()
                  void onFile(event.dataTransfer.files[0])
                }}
              >
                <Upload className="size-6 text-accent" aria-hidden />
                <span className="text-body font-medium">
                  {reading ? 'Lendo o arquivo…' : file ? file.fileName : 'Escolher arquivo'}
                </span>
                <span className="text-footnote text-text-2">
                  .xlsx, .xls ou .csv · lido aqui no seu navegador
                </span>
                <input
                  id={fileInputId}
                  type="file"
                  accept={ACCEPTED_FILES}
                  className="sr-only"
                  onChange={(event) => void onFile(event.target.files?.[0])}
                />
              </label>
              {fileError && (
                <p role="alert" className="text-footnote text-negative">
                  {fileError}
                </p>
              )}
              <div className="flex flex-wrap items-center justify-between gap-2 rounded-field bg-surface-2 px-3 py-2">
                <span className="text-footnote text-text-2">
                  Não sabe o formato? Baixe o exemplo.
                </span>
                <ExampleButton kind={kind} label="Baixar planilha de exemplo" variant="plain" />
              </div>
              {file && file.sheets.length > 1 && (
                <SelectField
                  label="Aba"
                  value={sheet?.name ?? ''}
                  onChange={(event) => {
                    setSheetName(event.target.value)
                    setYear(String(yearFromName(event.target.value)))
                  }}
                >
                  {file.sheets.map((item) => (
                    <option key={item.name} value={item.name}>
                      {item.name}
                    </option>
                  ))}
                </SelectField>
              )}
              {file && kind === 'monthly_sheet' && (
                <TextField
                  label="Ano dos meses da aba"
                  inputMode="numeric"
                  value={year}
                  onChange={(event) => setYear(event.target.value.replace(/\D/g, '').slice(0, 4))}
                  hint={
                    monthly && monthly.months.length > 0
                      ? `Encontrei ${monthly.months.length} meses: ${shortMonthLabel(monthly.months[0] as string)} a ${shortMonthLabel(monthly.months[monthly.months.length - 1] as string)}.`
                      : 'Não encontrei blocos de mês (JANEIRO, FEVEREIRO...) nesta aba.'
                  }
                />
              )}
              {file && kind !== 'monthly_sheet' && sheet && (
                <p className="text-footnote text-text-2">
                  {Math.max(0, sheet.rows.length - headerIndex - 1)} linhas abaixo do cabeçalho.
                </p>
              )}
              <div className="flex gap-2">
                <Button variant="secondary" onClick={() => go('kind')}>
                  Voltar
                </Button>
                <Button
                  className="flex-1"
                  disabled={
                    !file || (kind === 'monthly_sheet' && (!monthly || monthly.months.length === 0))
                  }
                  onClick={prepareMapping}
                >
                  Continuar
                </Button>
              </div>
            </Card>
          )}

          {step === 'map' && kind !== 'monthly_sheet' && (
            <Card className="space-y-4">
              <CardHeader title="De qual coluna vem cada campo?" />
              <p className="text-subhead text-text-2">
                Sugeri pelo nome das colunas. Ajuste o que estiver errado; da próxima vez eu lembro.
              </p>
              <div className="grid gap-3 md:grid-cols-2">
                {fields.map((field) => (
                  <SelectField
                    key={field.key}
                    label={`${field.label}${field.required ? ' *' : ''}`}
                    value={mapping[field.key] == null ? '' : String(mapping[field.key])}
                    onChange={(event) =>
                      setMapping((current) => ({
                        ...current,
                        [field.key]: event.target.value === '' ? null : Number(event.target.value),
                      }))
                    }
                  >
                    <option value="">Não importar</option>
                    {headers.map((header, index) => (
                      <option key={`${header}-${index}`} value={index}>
                        {header || `Coluna ${index + 1}`}
                      </option>
                    ))}
                  </SelectField>
                ))}
              </div>
              <MapFooter
                onBack={() => go('file')}
                onNext={() => void check()}
                checking={checking}
                error={missingRequired ? 'Escolha as colunas obrigatórias (*).' : checkError}
                disabled={missingRequired}
              />
            </Card>
          )}

          {step === 'map' && kind === 'monthly_sheet' && (
            <Card className="space-y-4">
              <CardHeader title='Quem é cada "BANCO/QUEM"?' />
              <p className="text-subhead text-text-2">
                Diga o que cada nome da coluna BANCO/QUEM é no Orla. Cartão: compras no crédito e
                contas fixas entram na fatura dele.
              </p>
              {bankValues.length === 0 && (
                <p className="text-subhead text-text-2">Nenhum banco ou pessoa na planilha.</p>
              )}
              <ul className="space-y-4">
                {bankValues.map(({ value, count }) => {
                  const key = normalizeText(value)
                  const current = banks[key] ?? { kind: 'payee', name: titleCase(value) }
                  const set = (next: BankMapping) => setBanks((all) => ({ ...all, [key]: next }))
                  return (
                    <li
                      key={key}
                      className="space-y-2 border-t border-separator pt-4 first:border-0 first:pt-0"
                    >
                      <p className="text-body font-medium">
                        {value}{' '}
                        <span className="text-footnote font-normal text-text-2">
                          · {count} linhas
                        </span>
                      </p>
                      <SegmentedControl
                        label={`O que é ${value}`}
                        value={current.kind}
                        onChange={(next) =>
                          set({
                            kind: next,
                            name:
                              next === 'card'
                                ? (cardList.data?.find((card) =>
                                    normalizeText(card.name).startsWith(key),
                                  )?.name ??
                                  cardList.data?.[0]?.name ??
                                  '')
                                : next === 'ignore'
                                  ? ''
                                  : titleCase(value),
                          })
                        }
                        options={(Object.keys(kindLabel) as BankMapping['kind'][]).map(
                          (option) => ({
                            value: option,
                            label: kindLabel[option],
                          }),
                        )}
                      />
                      {current.kind === 'card' &&
                        ((cardList.data ?? []).length > 0 ? (
                          <SelectField
                            label="Cartão"
                            value={current.name}
                            onChange={(event) => set({ kind: 'card', name: event.target.value })}
                          >
                            {(cardList.data ?? []).map((card) => (
                              <option key={card.id} value={card.name}>
                                {card.name}
                              </option>
                            ))}
                          </SelectField>
                        ) : (
                          <p className="text-footnote text-negative">
                            Nenhum cartão cadastrado.{' '}
                            <Link to="/config/cartoes" className="font-medium text-accent">
                              Cadastrar cartão
                            </Link>
                          </p>
                        ))}
                      {(current.kind === 'account' || current.kind === 'payee') && (
                        <TextField
                          label={
                            current.kind === 'account' ? 'Nome da conta' : 'Nome da pessoa ou loja'
                          }
                          value={current.name}
                          onChange={(event) =>
                            set({ kind: current.kind, name: event.target.value })
                          }
                          hint={
                            (
                              current.kind === 'account'
                                ? accountList.data?.some(
                                    (item) =>
                                      normalizeText(item.name) === normalizeText(current.name),
                                  )
                                : false
                            )
                              ? 'Conta já cadastrada.'
                              : 'Se não existir, eu crio ao importar.'
                          }
                        />
                      )}
                    </li>
                  )
                })}
              </ul>
              <MapFooter
                onBack={() => go('file')}
                onNext={() => void check()}
                checking={checking}
                error={checkError}
              />
            </Card>
          )}

          {step === 'preview' && preview && (
            <div className="space-y-4">
              <Card className="space-y-3">
                <CardHeader title="Confira antes de gravar" />
                <dl className="grid grid-cols-2 gap-3 text-footnote sm:grid-cols-4">
                  <Stat label="Prontos" value={counts.ok} tone="text-positive" />
                  <Stat label="Para conferir" value={counts.warning} tone="text-warning" />
                  <Stat label="Duplicados?" value={counts.duplicate} tone="text-accent" />
                  <Stat label="Com erro" value={counts.error} tone="text-negative" />
                </dl>
                <p className="text-footnote text-text-2">
                  Duplicados prováveis (mesmo mês, valor e descrição de algo que já existe) começam
                  desmarcados. Linhas com erro não entram.
                </p>
                {creates.length > 0 && (
                  <label className="flex items-start gap-3 rounded-field bg-surface-2 p-3 text-subhead">
                    <input
                      type="checkbox"
                      className="mt-0.5 size-5 shrink-0 accent-[var(--accent)]"
                      checked={createMissing}
                      onChange={(event) => setCreateMissing(event.target.checked)}
                    />
                    <span>
                      Criar o que não existe: {creates.slice(0, 6).join(', ')}
                      {creates.length > 6 && ` e mais ${creates.length - 6}`}
                    </span>
                  </label>
                )}
              </Card>

              <ChipGroup
                label="Mostrar"
                value={filter}
                onChange={(value) => setFilter(value ?? 'all')}
                options={[
                  { value: 'all', label: `Todos (${preview.length})` },
                  { value: 'warning', label: `Conferir (${counts.warning})` },
                  { value: 'duplicate', label: `Duplicados (${counts.duplicate})` },
                  { value: 'error', label: `Erros (${counts.error})` },
                  { value: 'skipped', label: `Ignoradas (${counts.skipped})` },
                ]}
              />

              <SlideSwap
                index={['all', 'warning', 'duplicate', 'error', 'skipped'].indexOf(filter)}
              >
                <ul className="overflow-hidden rounded-card bg-surface shadow-card">
                  {visible.length === 0 && (
                    <li className="p-5 text-center text-subhead text-text-2">Nada neste filtro.</li>
                  )}
                  {visible.map((row) => (
                    <PreviewItem
                      key={row.parsed.rowNumber}
                      row={row}
                      checked={selected.has(row.parsed.rowNumber)}
                      onToggle={(checked) =>
                        setSelected((current) => {
                          const next = new Set(current)
                          if (checked) next.add(row.parsed.rowNumber)
                          else next.delete(row.parsed.rowNumber)
                          return next
                        })
                      }
                    />
                  ))}
                </ul>
              </SlideSwap>

              <div className="sticky bottom-[calc(88px+env(safe-area-inset-bottom))] z-10 flex gap-2 rounded-card bg-surface/90 p-3 shadow-card backdrop-blur lg:bottom-4">
                <Button variant="secondary" onClick={() => go('map')} disabled={commit.isPending}>
                  Voltar
                </Button>
                <Button
                  className="flex-1"
                  loading={commit.isPending}
                  disabled={selected.size === 0}
                  onClick={() => void confirm()}
                >
                  Importar {selected.size} {selected.size === 1 ? 'item' : 'itens'}
                </Button>
              </div>
            </div>
          )}

          {step === 'done' && result && (
            <Card className="space-y-4 text-center">
              <CircleCheck className="mx-auto size-12 text-positive" aria-hidden />
              <div>
                <p className="text-title-2 font-semibold">Importação concluída</p>
                <p className="mt-1 text-subhead text-text-2">
                  {[
                    result.stats.transactions > 0 && `${result.stats.transactions} lançamentos`,
                    result.stats.installmentPlans > 0 &&
                      `${result.stats.installmentPlans} parcelamentos`,
                    result.stats.monthGoals > 0 && `${result.stats.monthGoals} metas investidas`,
                  ]
                    .filter(Boolean)
                    .join(' · ') || 'Nada novo'}
                  {result.stats.skipped > 0 && ` · ${result.stats.skipped} não entraram`}
                </p>
                {result.stats.created.length > 0 && (
                  <p className="mt-1 text-footnote text-text-2">
                    Criados: {result.stats.created.join(', ')}
                  </p>
                )}
              </div>
              <div className="flex flex-col gap-2 sm:flex-row sm:justify-center">
                <Link
                  to="/financas"
                  className="press inline-flex min-h-11 items-center justify-center rounded-full bg-accent px-5 text-subhead font-semibold text-white"
                >
                  Ver em Finanças
                </Link>
                <Button variant="secondary" onClick={restart}>
                  Importar outro arquivo
                </Button>
                <Button
                  variant="destructive"
                  loading={undo.isPending}
                  onClick={() => {
                    if (
                      !window.confirm(
                        'Desfazer esta importação? Tudo o que ela criou será removido.',
                      )
                    )
                      return
                    undo.mutate(result.id, {
                      onSuccess: () => {
                        toast({ message: 'Importação desfeita' })
                        restart()
                      },
                      onError: (error) => toast({ message: errorMessage(error), tone: 'error' }),
                    })
                  }}
                >
                  Desfazer
                </Button>
              </div>
            </Card>
          )}
        </SlideSwap>
      </div>
    </>
  )
}

/** Gera e baixa a planilha de exemplo do tipo (o SheetJS carrega na hora). */
function ExampleButton({
  kind,
  label,
  variant = 'secondary',
}: {
  kind: ImportKind
  label: string
  variant?: 'secondary' | 'plain'
}) {
  const toast = useToast()
  const [busy, setBusy] = useState(false)
  return (
    <Button
      variant={variant}
      loading={busy}
      onClick={async () => {
        setBusy(true)
        try {
          await downloadExample(kind)
        } catch (error) {
          toast({ message: errorMessage(error), tone: 'error' })
        } finally {
          setBusy(false)
        }
      }}
    >
      {!busy && <Download className="size-4" aria-hidden />} {label}
    </Button>
  )
}

function Stat({ label, value, tone }: { label: string; value: number; tone: string }) {
  return (
    <div className="rounded-field bg-surface-2 p-3">
      <dt className="text-text-2">{label}</dt>
      <dd className={cn('text-title-2 font-semibold tabular', value > 0 ? tone : 'text-text-3')}>
        {value}
      </dd>
    </div>
  )
}

function MapFooter({
  onBack,
  onNext,
  checking,
  error,
  disabled,
}: {
  onBack: () => void
  onNext: () => void
  checking: boolean
  error: string | null
  disabled?: boolean
}) {
  return (
    <>
      {error && (
        <p role="alert" className="flex items-start gap-1.5 text-footnote text-negative">
          <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
          {error}
        </p>
      )}
      <div className="flex gap-2">
        <Button variant="secondary" onClick={onBack} disabled={checking}>
          Voltar
        </Button>
        <Button className="flex-1" loading={checking} disabled={disabled} onClick={onNext}>
          Conferir linhas
        </Button>
      </div>
    </>
  )
}

function PreviewItem({
  row,
  checked,
  onToggle,
}: {
  row: PreviewRow
  checked: boolean
  onToggle: (checked: boolean) => void
}) {
  const info = describeRow(row.parsed)
  const selectable = row.status !== 'error' && row.status !== 'skipped'
  const style = statusStyle[row.status]
  const lines =
    row.parsed.sourceRows.length > 1
      ? `linhas ${row.parsed.sourceRows.join(', ')}`
      : `linha ${row.parsed.rowNumber}`
  const body: ReactNode = (
    <>
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-2">
          <span className="truncate text-body">{info.title}</span>
          <span
            className={cn(
              'shrink-0 rounded-full px-2 py-0.5 text-caption font-medium',
              style.className,
            )}
          >
            {style.label}
          </span>
        </span>
        <span className="block truncate text-footnote text-text-2">
          {info.subtitle} · {lines}
        </span>
        {row.messages.length > 0 && row.status !== 'skipped' && (
          <span className="mt-1 block space-y-0.5 text-footnote">
            {row.messages.map((message) => (
              <span
                key={message}
                className={cn(
                  'flex items-start gap-1',
                  row.status === 'error' ? 'text-negative' : 'text-text-2',
                )}
              >
                {row.status === 'duplicate' ? (
                  <Copy className="mt-0.5 size-3.5 shrink-0" aria-hidden />
                ) : (
                  <CircleAlert className="mt-0.5 size-3.5 shrink-0" aria-hidden />
                )}
                {message}
              </span>
            ))}
          </span>
        )}
      </span>
      {info.amount && <span className="shrink-0 text-body font-medium tabular">{info.amount}</span>}
    </>
  )
  return (
    <li className="border-t border-separator first:border-0">
      {selectable ? (
        <label className="flex cursor-pointer items-start gap-3 px-4 py-3 transition-colors hover:bg-surface-2">
          <input
            type="checkbox"
            className="mt-1 size-5 shrink-0 accent-[var(--accent)]"
            checked={checked}
            onChange={(event) => onToggle(event.target.checked)}
            aria-label={`Importar ${info.title}`}
          />
          {body}
        </label>
      ) : (
        <div
          className={cn(
            'flex items-start gap-3 px-4 py-3',
            row.status === 'skipped' && 'opacity-70',
          )}
        >
          <span className="mt-1 size-5 shrink-0" aria-hidden />
          {body}
        </div>
      )}
    </li>
  )
}
