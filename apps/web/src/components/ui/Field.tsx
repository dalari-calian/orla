import { forwardRef, useId, type InputHTMLAttributes, type ReactNode } from 'react'
import { cn } from '@/lib/cn'

/** Classes de um campo de texto: ≥16px para o iOS não dar zoom (RNF-12). */
export const inputClass =
  'min-h-12 w-full rounded-field bg-surface-2 px-4 text-body text-text placeholder:text-text-3 outline-none transition-shadow focus:ring-2 focus:ring-accent/60 aria-invalid:ring-2 aria-invalid:ring-negative/70 disabled:opacity-60'

interface FieldShellProps {
  label: string
  error?: string | undefined
  hint?: ReactNode
  htmlFor: string
  children: ReactNode
  className?: string | undefined
}

/** Rótulo + controle + dica/erro, com ids ligados para leitores de tela. */
export function FieldShell({ label, error, hint, htmlFor, children, className }: FieldShellProps) {
  return (
    <div className={cn('space-y-1.5', className)}>
      <label htmlFor={htmlFor} className="block px-1 text-footnote font-medium text-text-2">
        {label}
      </label>
      {children}
      {error ? (
        <p id={`${htmlFor}-error`} role="alert" className="px-1 text-footnote text-negative">
          {error}
        </p>
      ) : (
        hint && (
          <p id={`${htmlFor}-hint`} className="px-1 text-footnote text-text-2">
            {hint}
          </p>
        )
      )}
    </div>
  )
}

type TextFieldProps = InputHTMLAttributes<HTMLInputElement> & {
  label: string
  error?: string | undefined
  hint?: ReactNode
  /** Elemento à direita dentro do campo (ex.: botão mostrar senha). */
  trailing?: ReactNode
}

export const TextField = forwardRef<HTMLInputElement, TextFieldProps>(function TextField(
  { label, error, hint, trailing, className, id, ...props },
  ref,
) {
  const generated = useId()
  const inputId = id ?? generated
  return (
    <FieldShell label={label} error={error} hint={hint} htmlFor={inputId} className={className}>
      <div className="relative">
        <input
          ref={ref}
          id={inputId}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `${inputId}-error` : hint ? `${inputId}-hint` : undefined}
          className={cn(inputClass, trailing ? 'pr-12' : undefined)}
          {...props}
        />
        {trailing && <div className="absolute inset-y-0 right-1 flex items-center">{trailing}</div>}
      </div>
    </FieldShell>
  )
})
