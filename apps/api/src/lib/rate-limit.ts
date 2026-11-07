/**
 * Rate limit em memória, janela fixa (RNF-22). Suficiente para 1 processo/instância;
 * em várias instâncias serverless cada uma conta separado — aceitável para v1
 * (o bcrypt já torna força bruta lenta). Trocar por Postgres/Redis se precisar.
 */
export class RateLimiter {
  private readonly hits = new Map<string, { count: number; resetAt: number }>()

  constructor(
    private readonly limit: number,
    private readonly windowMs: number,
    private readonly now: () => number = Date.now,
  ) {}

  /** Registra uma tentativa; devolve false se a chave estourou o limite na janela. */
  consume(key: string): boolean {
    const now = this.now()
    const entry = this.hits.get(key)
    if (!entry || entry.resetAt <= now) {
      this.hits.set(key, { count: 1, resetAt: now + this.windowMs })
      this.sweep(now)
      return true
    }
    entry.count += 1
    return entry.count <= this.limit
  }

  reset(key: string): void {
    this.hits.delete(key)
  }

  /** Limpa entradas vencidas de vez em quando para não crescer sem limite. */
  private sweep(now: number): void {
    if (this.hits.size < 1000) return
    for (const [key, entry] of this.hits) if (entry.resetAt <= now) this.hits.delete(key)
  }
}
