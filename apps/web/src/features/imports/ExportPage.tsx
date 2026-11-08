import { currentCompetenceMonth } from '@orla/core'
import { backupSchema, exportTableSchema, type ExportEntity } from '@orla/contracts'
import { DatabaseBackup, Download, FileSpreadsheet, FileText, Upload } from 'lucide-react'
import { useId, useState } from 'react'
import { PageHeader } from '@/components/layout/PageHeader'
import { Button } from '@/components/ui/Button'
import { Card, CardHeader } from '@/components/ui/Card'
import { MonthField } from '@/components/ui/MonthField'
import { SegmentedControl } from '@/components/ui/SegmentedControl'
import { useToast } from '@/components/ui/Toast'
import { api, errorMessage } from '@/lib/api'
import { useRestoreBackup } from './api'
import { downloadBlob, downloadXlsx } from './files'

type Format = 'csv' | 'xlsx'

/** Baixa um arquivo da API (mesma sessão/cookies), sem passar pelo parse de JSON. */
async function fetchFile(path: string): Promise<Blob> {
  const response = await fetch(`/api/v1${path}`, { credentials: 'same-origin' })
  if (!response.ok) throw new Error(`Erro ${response.status} ao exportar`)
  return response.blob()
}

/** /config/exportar — exportar (RE-01), backup e restauração (RE-02). */
export function ExportPage() {
  const toast = useToast()
  const [entity, setEntity] = useState<ExportEntity>('transactions')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState<string>(currentCompetenceMonth())
  const [busy, setBusy] = useState<string | null>(null)
  const [mode, setMode] = useState<'merge' | 'replace'>('merge')
  const restore = useRestoreBackup()
  const inputId = useId()

  async function exportAs(format: Format) {
    setBusy(format)
    try {
      const params = new URLSearchParams()
      if (entity === 'transactions') {
        if (from) params.set('from', from)
        if (to) params.set('to', to)
      }
      const base = entity === 'transactions' ? 'orla-lancamentos' : 'orla-parcelamentos'
      if (format === 'csv') {
        params.set('format', 'csv')
        downloadBlob(`${base}.csv`, await fetchFile(`/exports/${entity}?${params.toString()}`))
      } else {
        params.set('format', 'json')
        const table = await api.get(`/exports/${entity}?${params.toString()}`, exportTableSchema)
        await downloadXlsx(`${base}.xlsx`, [
          {
            name: entity === 'transactions' ? 'Lançamentos' : 'Parcelamentos',
            rows: [table.columns, ...table.rows],
          },
        ])
      }
    } catch (error) {
      toast({ message: errorMessage(error), tone: 'error' })
    } finally {
      setBusy(null)
    }
  }

  async function backup() {
    setBusy('backup')
    try {
      const date = new Date().toISOString().slice(0, 10)
      downloadBlob(`orla-backup-${date}.json`, await fetchFile('/backup'))
    } catch (error) {
      toast({ message: errorMessage(error), tone: 'error' })
    } finally {
      setBusy(null)
    }
  }

  async function onRestoreFile(file: File | undefined) {
    if (!file) return
    try {
      const parsed = backupSchema.safeParse(JSON.parse(await file.text()))
      if (!parsed.success) throw new Error('Este arquivo não é um backup do Orla')
      const question =
        mode === 'replace'
          ? 'Substituir tudo pelos dados do backup? O que não estiver no arquivo será removido.'
          : 'Acrescentar ao Orla o que está no backup e ainda não existe aqui?'
      if (!window.confirm(question)) return
      const result = await restore.mutateAsync({ mode, backup: parsed.data })
      toast({
        message: `Backup restaurado: ${result.created} criados, ${result.updated} atualizados${result.removed ? `, ${result.removed} removidos` : ''}`,
      })
    } catch (error) {
      toast({ message: errorMessage(error), tone: 'error' })
    }
  }

  return (
    <>
      <PageHeader
        title="Exportar e backup"
        subtitle="Leve seus dados para uma planilha ou guarde uma cópia completa."
        back={{ to: '/config', label: 'Ajustes' }}
      />
      <div className="grid max-w-5xl gap-5 lg:grid-cols-2 lg:items-start">
        <Card className="space-y-4">
          <CardHeader title="Exportar" />
          <SegmentedControl
            label="O que exportar"
            value={entity}
            onChange={setEntity}
            options={[
              { value: 'transactions', label: 'Lançamentos' },
              { value: 'installment-plans', label: 'Parcelamentos' },
            ]}
          />
          {entity === 'transactions' && (
            <div className="space-y-3">
              <MonthField
                label="De"
                value={from}
                onChange={setFrom}
                clearable
                placeholder="Desde o início"
              />
              <MonthField
                label="Até"
                value={to}
                onChange={setTo}
                clearable
                placeholder="Até o fim"
              />
            </div>
          )}
          <p className="text-footnote text-text-2">
            As colunas são as do template de importação: dá para editar na planilha e importar de
            volta.
          </p>
          <div className="grid grid-cols-2 gap-2">
            <Button
              variant="secondary"
              loading={busy === 'csv'}
              onClick={() => void exportAs('csv')}
            >
              <FileText className="size-4" aria-hidden /> CSV
            </Button>
            <Button
              variant="secondary"
              loading={busy === 'xlsx'}
              onClick={() => void exportAs('xlsx')}
            >
              <FileSpreadsheet className="size-4" aria-hidden /> Excel (.xlsx)
            </Button>
          </div>
        </Card>

        <Card className="space-y-4">
          <CardHeader title="Backup completo" />
          <p className="text-subhead text-text-2">
            Um arquivo JSON com tudo: contas, cartões, categorias, recorrentes, parcelamentos,
            lançamentos e metas. Guarde em um lugar seguro.
          </p>
          <Button block loading={busy === 'backup'} onClick={() => void backup()}>
            <DatabaseBackup className="size-4" aria-hidden /> Baixar backup
          </Button>
          <div className="space-y-3 border-t border-separator pt-4">
            <p className="text-headline font-semibold">Restaurar</p>
            <SegmentedControl
              label="Como restaurar"
              value={mode}
              onChange={setMode}
              options={[
                { value: 'merge', label: 'Acrescentar' },
                { value: 'replace', label: 'Substituir tudo' },
              ]}
            />
            <p className="text-footnote text-text-2">
              {mode === 'merge'
                ? 'Só entra o que ainda não existe aqui. Nada é apagado.'
                : 'Deixa o Orla igual ao backup: o que não estiver no arquivo é removido.'}
            </p>
            <label
              htmlFor={inputId}
              className="press flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-full bg-surface-2 px-4 text-subhead font-semibold text-text hover:bg-separator"
            >
              {restore.isPending ? (
                'Restaurando…'
              ) : (
                <>
                  <Upload className="size-4" aria-hidden /> Escolher arquivo de backup
                </>
              )}
              <input
                id={inputId}
                type="file"
                accept=".json,application/json"
                className="sr-only"
                disabled={restore.isPending}
                onChange={(event) => {
                  void onRestoreFile(event.target.files?.[0])
                  event.target.value = ''
                }}
              />
            </label>
          </div>
        </Card>
        <p className="flex items-center gap-1.5 text-footnote text-text-2 lg:col-span-2">
          <Download className="size-4" aria-hidden /> Os arquivos são gerados na hora e baixados
          direto no seu aparelho.
        </p>
      </div>
    </>
  )
}
