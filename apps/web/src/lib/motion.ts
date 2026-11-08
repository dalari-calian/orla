import { useEffect, useRef, useState } from 'react'

function prefersReducedMotion(): boolean {
  return (
    typeof window !== 'undefined' &&
    window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true
  )
}

/** Mesma curva do `--ease-ios`, aproximada (sai rápido, assenta devagar). */
function easeOut(t: number): number {
  return 1 - Math.pow(1 - t, 3)
}

/**
 * _Count-up_ do número herói (doc 09 › Movimento): anima de onde estava até o novo valor
 * em `duration` ms; na primeira exibição, sobe a partir de zero. Trabalha com inteiros
 * (centavos), então o número mostrado é sempre um valor real em centavos.
 * Com `prefers-reduced-motion`, mostra o valor final direto.
 */
export function useCountUp(target: number, duration = 450): number {
  const [display, setDisplay] = useState(0)
  const fromRef = useRef(0)

  useEffect(() => {
    const from = fromRef.current
    const total = prefersReducedMotion() ? 0 : duration
    let frame = 0
    let start: number | null = null

    const step = (now: number) => {
      start ??= now
      const progress = total === 0 ? 1 : Math.min(1, (now - start) / total)
      const value = Math.round(from + (target - from) * easeOut(progress))
      fromRef.current = value
      setDisplay(value)
      if (progress < 1) frame = requestAnimationFrame(step)
    }
    frame = requestAnimationFrame(step)
    return () => cancelAnimationFrame(frame)
  }, [target, duration])

  return display
}
