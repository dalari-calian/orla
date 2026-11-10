/** Ícone do Orla: sol nascendo no horizonte, sobre a água. */
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" className={className} aria-hidden>
      <rect width="64" height="64" rx="15" fill="var(--accent)" />
      <path d="M20 35a12 12 0 0 1 24 0Z" fill="#fff" />
      <path d="M12 35h40" stroke="#fff" strokeWidth="4" strokeLinecap="round" />
      <path
        d="M16 45c4-3 8-3 12 0s8 3 12 0 6-2 8-1"
        fill="none"
        stroke="#fff"
        strokeWidth="4"
        strokeLinecap="round"
        opacity=".7"
      />
    </svg>
  )
}

const logoSizes = {
  /** Barra lateral e cabeçalhos. */
  md: { text: 'gap-2 text-title-2', mark: 'size-7' },
  /** Telas de entrada (login/cadastro): marca em destaque, maior que o título da página. */
  lg: { text: 'gap-3 text-[40px] leading-none', mark: 'size-12' },
} as const

/** Logotipo tipográfico: "orla" em minúsculas, semibold. */
export function Logo({
  className,
  size = 'md',
}: {
  className?: string
  size?: keyof typeof logoSizes
}) {
  const styles = logoSizes[size]
  return (
    <span
      className={`inline-flex items-center font-semibold tracking-tight ${styles.text} ${className ?? ''}`}
    >
      <LogoMark className={styles.mark} />
      orla
    </span>
  )
}
