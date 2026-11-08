import { Check, ChevronDown } from 'lucide-react'
import {
  Children,
  forwardRef,
  Fragment,
  isValidElement,
  useEffect,
  useId,
  useRef,
  useState,
  type KeyboardEvent,
  type OptionHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
} from 'react'
import { cn } from '@/lib/cn'
import { FieldShell, inputClass } from './Field'
import { attachedCorners, attachedPanelClass, useAnchoredPopover } from './popover'

interface ParsedOption {
  value: string
  label: string
  disabled: boolean
}

function textOf(node: ReactNode): string {
  if (node === null || node === undefined || typeof node === 'boolean') return ''
  if (typeof node === 'string' || typeof node === 'number') return String(node)
  if (Array.isArray(node)) return node.map(textOf).join('')
  if (isValidElement<{ children?: ReactNode }>(node)) return textOf(node.props.children)
  return ''
}

/** Lê os `<option>` dos filhos (aceita arrays e fragments), como o <select> nativo faz. */
function collectOptions(children: ReactNode): ParsedOption[] {
  const out: ParsedOption[] = []
  Children.forEach(children, (child) => {
    if (!isValidElement(child)) return
    if (child.type === Fragment) {
      out.push(...collectOptions((child.props as { children?: ReactNode }).children))
      return
    }
    if (child.type !== 'option') return
    const props = child.props as OptionHTMLAttributes<HTMLOptionElement>
    const label = textOf(props.children)
    out.push({
      value: props.value === undefined ? label : String(props.value),
      label,
      disabled: Boolean(props.disabled),
    })
  })
  return out
}

/** Mantém a opção ativa visível dentro do painel sem rolar mais nada na tela. */
function reveal(panel: HTMLElement | null, index: number) {
  const item = panel?.children[index] as HTMLElement | undefined
  if (!panel || !item) return
  const top = item.offsetTop
  const bottom = top + item.offsetHeight
  if (top < panel.scrollTop) panel.scrollTop = top - 6
  else if (bottom > panel.scrollTop + panel.clientHeight)
    panel.scrollTop = bottom - panel.clientHeight + 6
}

type SelectFieldProps = Omit<SelectHTMLAttributes<HTMLSelectElement>, 'children'> & {
  label: string
  error?: string | undefined
  hint?: ReactNode
  children: ReactNode
}

/**
 * Seletor com a cara do app: o campo "abre" e a lista sai colada nele, com a mesma cor e
 * cantos arredondados só nas pontas (docs/09). Aceita os mesmos filhos e props de um
 * <select> (controlado, ou `register` do react-hook-form): um <select> escondido continua
 * guardando o valor e disparando `change`, então os formulários não mudam.
 * Teclado: ↑ ↓ Home End navegam, Enter/Espaço escolhem, Esc fecha, letras pulam.
 */
export const SelectField = forwardRef<HTMLSelectElement, SelectFieldProps>(function SelectField(
  {
    label,
    error,
    hint,
    className,
    id,
    children,
    value,
    defaultValue,
    onChange,
    onBlur,
    disabled,
    ...props
  },
  ref,
) {
  const generated = useId()
  const buttonId = id ?? generated
  const selectRef = useRef<HTMLSelectElement | null>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const options = collectOptions(children)
  const { panelId, anchorRef, panelRef, open, placement, show, hide } = useAnchoredPopover({
    contentHeight: options.length * 44 + 12,
  })
  const controlled = value !== undefined
  const [inner, setInner] = useState<string | null>(
    defaultValue === undefined ? null : String(defaultValue as string),
  )
  const current = controlled ? String(value as string) : (inner ?? options[0]?.value ?? '')
  const selectedIndex = options.findIndex((option) => option.value === current)
  const shown = options[selectedIndex] ?? options[0]
  const [active, setActive] = useState(-1)
  const optionId = (index: number) => `${panelId}-${index}`

  useEffect(() => {
    if (open) reveal(panelRef.current, active)
  }, [open, active, panelRef])

  function setRefs(element: HTMLSelectElement | null) {
    selectRef.current = element
    if (typeof ref === 'function') ref(element)
    else if (ref) ref.current = element
    // Sem `value`, quem define o valor inicial é o DOM (ex.: defaultValues do react-hook-form).
    if (element && !controlled && element.value !== inner) setInner(element.value)
  }

  function choose(index: number) {
    const option = options[index]
    const select = selectRef.current
    if (!option || option.disabled) return
    hide()
    buttonRef.current?.focus()
    if (!select || select.value === option.value) return
    select.value = option.value
    if (!controlled) setInner(option.value)
    select.dispatchEvent(new Event('change', { bubbles: true }))
  }

  function move(from: number, step: 1 | -1) {
    for (let i = from + step; i >= 0 && i < options.length; i += step) {
      if (!options[i]?.disabled) return setActive(i)
    }
  }

  function onKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    const { key } = event
    if (!open) {
      if (['ArrowDown', 'ArrowUp', 'Enter', ' '].includes(key)) {
        event.preventDefault()
        setActive(Math.max(0, selectedIndex))
        show()
      }
      return
    }
    if (key === 'ArrowDown' || key === 'ArrowUp') {
      event.preventDefault()
      move(active, key === 'ArrowDown' ? 1 : -1)
    } else if (key === 'Home' || key === 'End') {
      event.preventDefault()
      move(key === 'Home' ? -1 : options.length, key === 'Home' ? 1 : -1)
    } else if (key === 'Enter' || key === ' ') {
      event.preventDefault()
      choose(active)
    } else if (key === 'Tab') {
      hide()
    } else if (key.length === 1) {
      const letter = key.toLocaleLowerCase('pt-BR')
      for (let n = 1; n <= options.length; n++) {
        const i = (active + n) % options.length
        const text = options[i]?.label.replace(/^[\s↳]+/, '').toLocaleLowerCase('pt-BR') ?? ''
        if (text.startsWith(letter) && !options[i]?.disabled) return setActive(i)
      }
    }
  }

  return (
    <FieldShell label={label} error={error} hint={hint} htmlFor={buttonId} className={className}>
      <div ref={anchorRef} className="relative">
        <select
          ref={setRefs}
          tabIndex={-1}
          aria-hidden
          className="sr-only"
          value={value}
          defaultValue={defaultValue}
          disabled={disabled}
          onChange={(event) => {
            if (!controlled) setInner(event.target.value)
            onChange?.(event)
          }}
          onBlur={onBlur}
          // Foco vindo do formulário (ex.: primeiro campo com erro) vai para o botão visível.
          onFocus={() => buttonRef.current?.focus()}
          {...props}
        >
          {children}
        </select>
        <button
          ref={buttonRef}
          id={buttonId}
          type="button"
          role="combobox"
          aria-haspopup="listbox"
          aria-expanded={open}
          aria-controls={panelId}
          aria-activedescendant={open && active >= 0 ? optionId(active) : undefined}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `${buttonId}-error` : hint ? `${buttonId}-hint` : undefined}
          disabled={disabled}
          popoverTarget={panelId}
          onClick={() => setActive(Math.max(0, selectedIndex))}
          onKeyDown={onKeyDown}
          onKeyUp={(event) => {
            if (event.key === ' ') event.preventDefault()
          }}
          onBlur={(event) => {
            if (!onBlur || panelRef.current?.contains(event.relatedTarget)) return
            selectRef.current?.dispatchEvent(new FocusEvent('focusout', { bubbles: true }))
          }}
          className={cn(
            inputClass,
            'flex items-center justify-between gap-2 pr-3.5 text-left transition-[box-shadow,border-radius] duration-200',
            open && 'ring-0 focus:ring-0',
            attachedCorners(open, placement),
          )}
        >
          <span className="truncate whitespace-pre">{shown?.label ?? ''}</span>
          <ChevronDown
            className={cn(
              'size-4 shrink-0 text-text-2 transition-transform duration-200 ease-ios',
              open && 'rotate-180',
            )}
            aria-hidden
          />
        </button>

        <div
          ref={panelRef}
          id={panelId}
          popover="auto"
          role="listbox"
          aria-label={label}
          className={attachedPanelClass}
        >
          {options.map((option, index) => {
            const selected = index === selectedIndex
            return (
              <div
                key={`${option.value}-${index}`}
                id={optionId(index)}
                role="option"
                aria-selected={selected}
                aria-disabled={option.disabled || undefined}
                // Mantém o foco no campo (o leitor de tela acompanha pela activedescendant).
                onMouseDown={(event) => event.preventDefault()}
                onPointerMove={() => setActive(index)}
                onClick={() => choose(index)}
                className={cn(
                  'flex min-h-11 cursor-pointer items-center justify-between gap-3 rounded-[10px] px-3 text-body transition-colors duration-150',
                  index === active && 'bg-text/[0.06]',
                  selected && 'font-medium text-accent',
                  option.disabled && 'pointer-events-none opacity-40',
                )}
              >
                <span className="truncate whitespace-pre">{option.label}</span>
                {selected && <Check className="size-4 shrink-0" strokeWidth={2.5} aria-hidden />}
              </div>
            )
          })}
        </div>
      </div>
    </FieldShell>
  )
})
