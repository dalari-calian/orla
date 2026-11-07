import { CircleAlert, CircleCheck } from 'lucide-react'
import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { cn } from '@/lib/cn'

interface ToastOptions {
  message: string
  tone?: 'success' | 'error'
  /** Ação opcional, ex.: "Desfazer" depois de excluir. */
  action?: { label: string; onClick: () => void }
}

interface ToastItem extends ToastOptions {
  id: number
}

const ToastContext = createContext<(options: ToastOptions) => void>(() => {})

/** Mostra um aviso rápido no rodapé (acima da tab bar no celular). */
export function useToast() {
  return useContext(ToastContext)
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([])
  const nextId = useRef(0)

  const dismiss = useCallback((id: number) => {
    setToasts((current) => current.filter((toast) => toast.id !== id))
  }, [])

  const show = useCallback(
    (options: ToastOptions) => {
      const id = ++nextId.current
      setToasts((current) => [...current.slice(-2), { ...options, id }])
      window.setTimeout(() => dismiss(id), options.action ? 6000 : 3500)
    },
    [dismiss],
  )

  const value = useMemo(() => show, [show])

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div
        aria-live="polite"
        className="pointer-events-none fixed inset-x-0 bottom-[calc(76px+env(safe-area-inset-bottom))] z-50 flex flex-col items-center gap-2 px-4 lg:bottom-6 lg:left-60"
      >
        {toasts.map((toast) => {
          const Icon = toast.tone === 'error' ? CircleAlert : CircleCheck
          return (
            <div
              key={toast.id}
              role={toast.tone === 'error' ? 'alert' : 'status'}
              className="pointer-events-auto flex w-full max-w-sm items-center gap-3 rounded-field bg-text px-4 py-3 text-subhead text-bg shadow-card"
            >
              <Icon
                className={cn(
                  'size-5 shrink-0',
                  toast.tone === 'error' ? 'text-negative' : 'text-positive',
                )}
                aria-hidden
              />
              <span className="flex-1">{toast.message}</span>
              {toast.action && (
                <button
                  type="button"
                  className="-my-2 min-h-11 font-semibold text-accent"
                  onClick={() => {
                    toast.action?.onClick()
                    dismiss(toast.id)
                  }}
                >
                  {toast.action.label}
                </button>
              )}
            </div>
          )
        })}
      </div>
    </ToastContext.Provider>
  )
}
