import { useCallback, useEffect, useSyncExternalStore } from 'react'

export type ThemePreference = 'light' | 'dark' | 'system'

const STORAGE_KEY = 'orla.theme'
const THEME_COLOR = { light: '#F2F2F7', dark: '#1E1F23' } as const
const darkQuery = () => window.matchMedia('(prefers-color-scheme: dark)')

const listeners = new Set<() => void>()

function readPreference(): ThemePreference {
  try {
    const value = localStorage.getItem(STORAGE_KEY)
    if (value === 'light' || value === 'dark' || value === 'system') return value
  } catch {
    // localStorage indisponível (modo privado): segue com "system".
  }
  return 'system'
}

function applyTheme(preference: ThemePreference): void {
  const resolved = preference === 'system' ? (darkQuery().matches ? 'dark' : 'light') : preference
  document.documentElement.dataset.theme = resolved
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', THEME_COLOR[resolved])
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

/** Preferência de tema (claro / escuro / sistema), persistida no aparelho. */
export function useTheme(): [ThemePreference, (next: ThemePreference) => void] {
  const preference = useSyncExternalStore(subscribe, readPreference, () => 'system' as const)

  const setPreference = useCallback((next: ThemePreference) => {
    try {
      localStorage.setItem(STORAGE_KEY, next)
    } catch {
      // ignora: o tema vale só para esta sessão.
    }
    applyTheme(next)
    listeners.forEach((listener) => listener())
  }, [])

  // Acompanha a troca de tema do sistema enquanto a preferência for "system".
  useEffect(() => {
    applyTheme(preference)
    if (preference !== 'system') return
    const query = darkQuery()
    const onChange = () => applyTheme('system')
    query.addEventListener('change', onChange)
    return () => query.removeEventListener('change', onChange)
  }, [preference])

  return [preference, setPreference]
}
