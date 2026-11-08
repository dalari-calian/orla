import { formatBRLParts, tryParseBRL } from '@orla/core/money'
import { useId, useState, type ReactNode } from 'react'
import { cn } from '@/lib/cn'
import { FieldShell, inputClass } from './Field'

/** Centavos → "1.234,56" (sem o "R$", que fica fixo à esquerda do campo). */
function toText(cents: number | null): string {
  if (cents === null) return ''
  const { sign, integer, fraction } = formatBRLParts(cents)
  return `${sign}${integer},${fraction}`
}

/**
 * Campo de valor em reais. Guarda o valor em **centavos inteiros** (regra 1) e aceita
 * digitar/colar no formato brasileiro ("1.234,56", "1234,5", "R$ 10"), com o mesmo
 * parser do core. Formata ao sair do campo.
 */
export function MoneyInput({
  label,
  value,
  onChange,
  onBlur,
  error,
  hint,
  allowEmpty = true,
  large = false,
  placeholder = '0,00',
  autoFocus,
  name,
}: {
  label: string
  value: number | null
  onChange: (cents: number | null) => void
  onBlur?: () => void
  error?: string | undefined
  hint?: ReactNode
  allowEmpty?: boolean
  /** Valor grande, para telas onde o número é o protagonista (onboarding, lançamento). */
  large?: boolean
  placeholder?: string
  autoFocus?: boolean
  name?: string
}) {
  const id = useId()
  // Enquanto edita, mostra exatamente o que foi digitado; fora do campo, o valor formatado
  // (assim um reset do formulário também atualiza o texto, sem useEffect).
  const [draft, setDraft] = useState<string | null>(null)
  const invalid = draft !== null && draft.trim() !== '' && tryParseBRL(draft) === null
  const text = draft ?? toText(value)

  return (
    <FieldShell
      label={label}
      error={error ?? (invalid ? 'Valor inválido. Ex.: 1.234,56' : undefined)}
      hint={hint}
      htmlFor={id}
    >
      <div className="relative">
        <span
          className={cn(
            'pointer-events-none absolute top-1/2 left-4 -translate-y-1/2 text-text-2',
            large ? 'text-title-2' : 'text-body',
          )}
          aria-hidden
        >
          R$
        </span>
        <input
          id={id}
          name={name}
          inputMode="decimal"
          autoComplete="off"
          autoFocus={autoFocus}
          data-autofocus={autoFocus ? true : undefined}
          placeholder={placeholder}
          value={text}
          aria-invalid={error || invalid ? true : undefined}
          className={cn(
            inputClass,
            'tabular',
            large ? 'min-h-16 pl-14 text-title-1 font-semibold' : 'pl-11',
          )}
          onFocus={() => setDraft(toText(value))}
          onChange={(event) => {
            const next = event.target.value
            setDraft(next)
            if (next.trim() === '') return onChange(allowEmpty ? null : 0)
            const cents = tryParseBRL(next)
            if (cents !== null) onChange(cents)
          }}
          onBlur={() => {
            // Texto inválido continua visível (com o erro) para o usuário corrigir.
            if (!invalid) setDraft(null)
            onBlur?.()
          }}
        />
      </div>
    </FieldShell>
  )
}
