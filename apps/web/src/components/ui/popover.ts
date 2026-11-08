import { useCallback, useEffect, useId, useRef, useState } from 'react'

export type Placement = 'below' | 'above'

/**
 * Painel "colado" a um campo (seletor, calendário de mês), usando a Popover API nativa:
 * vai para a camada do topo (fica acima do <dialog> do Sheet e não é cortado pelo scroll
 * dele), fecha ao tocar fora e com Esc. Abre para baixo; se não couber, abre para cima.
 * Rolar a tela ou redimensionar fecha o painel (ele é `fixed`, não acompanharia o campo).
 */
export function useAnchoredPopover({
  maxHeight = 296,
  contentHeight = 220,
  width,
  gap = 0,
}: {
  maxHeight?: number
  /** Altura que o conteúdo precisa (estimativa): se não couber abaixo, abre para cima. */
  contentHeight?: number
  /** Largura fixa (centralizada na âncora); sem ela, o painel tem a largura do campo. */
  width?: number
  /** Respiro entre a âncora e o painel (0 = colado). */
  gap?: number
} = {}) {
  const panelId = useId()
  const anchorRef = useRef<HTMLDivElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const [open, setOpen] = useState(false)
  const [placement, setPlacement] = useState<Placement>('below')

  useEffect(() => {
    const panel = panelRef.current
    if (!panel) return
    function onBeforeToggle(event: Event) {
      const anchor = anchorRef.current
      if (!panel || !anchor || (event as ToggleEvent).newState !== 'open') return
      const rect = anchor.getBoundingClientRect()
      const below = window.innerHeight - rect.bottom - gap - 12
      const above = rect.top - gap - 12
      const next: Placement =
        below >= Math.min(maxHeight, contentHeight) || below >= above ? 'below' : 'above'
      // Posição escrita direto no DOM: precisa estar certa antes do primeiro quadro.
      panel.dataset.placement = next
      const w = width ? Math.min(width, rect.width) : rect.width
      panel.style.left = `${rect.left + (rect.width - w) / 2}px`
      panel.style.width = `${w}px`
      panel.style.maxHeight = `${Math.max(160, Math.min(maxHeight, next === 'below' ? below : above))}px`
      if (next === 'below') {
        panel.style.top = `${rect.bottom + gap}px`
        panel.style.bottom = 'auto'
      } else {
        panel.style.bottom = `${window.innerHeight - rect.top + gap}px`
        panel.style.top = 'auto'
      }
      setPlacement(next)
    }
    function onToggle(event: Event) {
      setOpen((event as ToggleEvent).newState === 'open')
    }
    panel.addEventListener('beforetoggle', onBeforeToggle)
    panel.addEventListener('toggle', onToggle)
    return () => {
      panel.removeEventListener('beforetoggle', onBeforeToggle)
      panel.removeEventListener('toggle', onToggle)
    }
  }, [maxHeight, contentHeight, width, gap])

  useEffect(() => {
    if (!open) return
    function hideOnScroll(event: Event) {
      if (event.target instanceof Node && panelRef.current?.contains(event.target)) return
      panelRef.current?.hidePopover()
    }
    function hide() {
      panelRef.current?.hidePopover()
    }
    document.addEventListener('scroll', hideOnScroll, true)
    window.addEventListener('resize', hide)
    return () => {
      document.removeEventListener('scroll', hideOnScroll, true)
      window.removeEventListener('resize', hide)
    }
  }, [open])

  const show = useCallback(() => {
    if (!panelRef.current?.matches(':popover-open')) panelRef.current?.showPopover()
  }, [])
  const hide = useCallback(() => {
    if (panelRef.current?.matches(':popover-open')) panelRef.current.hidePopover()
  }, [])

  return { panelId, anchorRef, panelRef, open, placement, show, hide }
}

/**
 * Campo enquanto o painel está aberto: fica com a mesma sombra do painel e a borda reta do
 * lado dele, e a sombra é cortada na emenda — campo + lista viram uma peça só.
 */
export function attachedCorners(open: boolean, placement: Placement): string | undefined {
  if (!open) return undefined
  return placement === 'below'
    ? 'rounded-b-none shadow-[0_0_28px_-8px_rgb(0_0_0/0.3)] [clip-path:inset(-48px_-48px_0_-48px)]'
    : 'rounded-t-none shadow-[0_0_28px_-8px_rgb(0_0_0/0.3)] [clip-path:inset(0_-48px_-48px_-48px)]'
}

/** Classes do painel colado (cor do campo, cantos arredondados só na ponta, sombra). */
export const attachedPanelClass =
  'attached-panel fixed m-0 overflow-y-auto overscroll-contain border-0 bg-surface-2 p-1.5 text-text'

/** Painel solto (com um respiro do campo), para âncoras que não são campos (ex.: troca de mês). */
export const floatingPanelClass =
  'floating-panel fixed m-0 overflow-y-auto overscroll-contain rounded-card border-0 bg-surface p-2 text-text shadow-[0_12px_40px_-8px_rgb(0_0_0/0.28)]'
