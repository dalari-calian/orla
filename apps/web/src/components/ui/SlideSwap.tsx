import { useState, type ReactNode } from 'react'
import { cn } from '@/lib/cn'

/**
 * Conteúdo de uma aba (controle segmentado ou chips) que desliza ao trocar de aba:
 * aba à direita da anterior → entra pela direita; à esquerda → pela esquerda
 * (doc 09 › Movimento). Na primeira renderização não anima.
 * Atenção: troca de `index` remonta os filhos (o estado interno deles recomeça).
 */
export function SlideSwap({
  index,
  className,
  children,
}: {
  /** Posição da aba escolhida (0, 1, 2...). */
  index: number
  className?: string
  children: ReactNode
}) {
  const [state, setState] = useState<{ index: number; from: 'right' | 'left' | null }>({
    index,
    from: null,
  })
  // Guarda a direção a partir da aba anterior (padrão "estado derivado da renderização anterior").
  if (state.index !== index) setState({ index, from: index > state.index ? 'right' : 'left' })

  return (
    <div
      key={index}
      className={cn(
        state.from === 'right' && 'animate-slide-from-right',
        state.from === 'left' && 'animate-slide-from-left',
        className,
      )}
    >
      {children}
    </div>
  )
}
