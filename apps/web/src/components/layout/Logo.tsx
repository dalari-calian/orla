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

/** Logotipo tipográfico: "orla" em minúsculas, semibold. */
export function Logo({ className }: { className?: string }) {
  return (
    <span
      className={`inline-flex items-center gap-2 text-title-2 font-semibold tracking-tight ${className ?? ''}`}
    >
      <LogoMark className="size-7" />
      orla
    </span>
  )
}
