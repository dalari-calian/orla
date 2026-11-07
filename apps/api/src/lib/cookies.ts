/** Lê o header Cookie em um objeto (sem dependência extra). */
export function parseCookies(header: string | undefined): Record<string, string> {
  const cookies: Record<string, string> = {}
  if (!header) return cookies
  for (const part of header.split(';')) {
    const index = part.indexOf('=')
    if (index === -1) continue
    const name = part.slice(0, index).trim()
    const raw = part.slice(index + 1).trim()
    if (!name || name in cookies) continue
    try {
      cookies[name] = decodeURIComponent(raw)
    } catch {
      cookies[name] = raw
    }
  }
  return cookies
}
