/**
 * Cotações (RC-30..33) com o máximo de cache — chamada ao provedor custa (plano grátis limitado):
 * 1. `quotes_cache` por ticker, compartilhado entre usuários; vale 30 min no pregão e, fora
 *    dele, até o próximo pregão (`quoteIsFresh` no core);
 * 2. chamadas em andamento são reaproveitadas (dois pedidos do mesmo ticker = 1 chamada);
 * 3. orçamento mensal com parada (`provider_usage`), limite de tickers por requisição;
 * 4. falha recente: espera 6 h antes de tentar o mesmo ticker;
 * 5. lista de tickers (autocomplete) guardada por 7 dias em `provider_cache` (1 chamada).
 * Sem token, o provedor fica desligado e nada sai para a internet.
 */
import { normalizeText, quoteIsFresh, usageMonth } from '@orla/core'
import type { Prisma, PrismaClient } from '@orla/db'

export interface ProviderQuote {
  ticker: string
  price: string
  changePct: number | null
  name: string | null
  quotedAt: Date | null
}

export interface QuoteProvider {
  readonly name: string
  readonly enabled: boolean
  fetchQuote(ticker: string): Promise<ProviderQuote>
  listTickers(): Promise<{ ticker: string; name: string | null }[]>
}

/** brapi.dev (plano grátis: 1 ticker por chamada). O token vai no header, nunca na URL. */
export class BrapiProvider implements QuoteProvider {
  readonly name = 'brapi'
  readonly enabled: boolean
  constructor(
    private readonly token: string | undefined,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {
    this.enabled = Boolean(token)
  }

  private async get(path: string): Promise<unknown> {
    const response = await this.fetchImpl(`https://brapi.dev/api${path}`, {
      headers: { Authorization: `Bearer ${this.token ?? ''}`, Accept: 'application/json' },
      signal: AbortSignal.timeout(8000),
    })
    if (!response.ok) throw new Error(`brapi respondeu ${response.status}`)
    return response.json()
  }

  async fetchQuote(ticker: string): Promise<ProviderQuote> {
    const body = (await this.get(`/quote/${encodeURIComponent(ticker)}`)) as {
      results?: {
        symbol?: string
        shortName?: string
        longName?: string
        regularMarketPrice?: number
        regularMarketChangePercent?: number
        regularMarketTime?: string
      }[]
    }
    const result = body.results?.[0]
    if (!result || typeof result.regularMarketPrice !== 'number') {
      throw new Error('Ticker sem cotação no provedor')
    }
    return {
      ticker,
      price: String(result.regularMarketPrice),
      changePct:
        typeof result.regularMarketChangePercent === 'number'
          ? result.regularMarketChangePercent
          : null,
      name: result.longName ?? result.shortName ?? null,
      quotedAt: result.regularMarketTime ? new Date(result.regularMarketTime) : null,
    }
  }

  async listTickers(): Promise<{ ticker: string; name: string | null }[]> {
    const body = (await this.get('/quote/list?limit=10000')) as {
      stocks?: { stock?: string; name?: string }[]
    }
    return (body.stocks ?? [])
      .filter((item) => typeof item.stock === 'string')
      .map((item) => ({ ticker: (item.stock as string).toUpperCase(), name: item.name ?? null }))
  }
}

export type QuoteRow = Prisma.QuoteCacheGetPayload<object>

const TICKERS_KEY = 'brapi:tickers'
const TICKERS_TTL_MS = 7 * 86_400_000

export class QuoteService {
  private readonly inflight = new Map<string, Promise<void>>()
  private tickersInflight: Promise<{ ticker: string; name: string | null }[] | null> | null = null

  constructor(
    private readonly prisma: PrismaClient,
    readonly provider: QuoteProvider,
    private readonly options: { monthlyBudget: number; now: () => Date },
  ) {}

  /** Cotações em cache (nunca chama o provedor). */
  async cached(tickers: readonly string[]): Promise<Map<string, QuoteRow>> {
    if (tickers.length === 0) return new Map()
    const rows = await this.prisma.quoteCache.findMany({
      where: { ticker: { in: [...new Set(tickers)] } },
    })
    return new Map(rows.map((row) => [row.ticker, row]))
  }

  /** Tickers que precisam de cotação nova agora. */
  async stale(tickers: readonly string[]): Promise<string[]> {
    const now = this.options.now()
    const cache = await this.cached(tickers)
    return [...new Set(tickers)].filter((ticker) => {
      const row = cache.get(ticker)
      return !quoteIsFresh(
        { fetchedAt: row?.price ? row.fetchedAt : null, errorAt: row?.errorAt ?? null },
        now,
      )
    })
  }

  async budgetLeft(): Promise<number> {
    const usage = await this.prisma.providerUsage.findUnique({
      where: {
        provider_month: { provider: this.provider.name, month: usageMonth(this.options.now()) },
      },
    })
    return Math.max(0, this.options.monthlyBudget - (usage?.calls ?? 0))
  }

  /** Reserva 1 chamada do orçamento do mês; `false` = orçamento acabou (para tudo). */
  private async spend(): Promise<boolean> {
    if ((await this.budgetLeft()) <= 0) return false
    await this.prisma.providerUsage.upsert({
      where: {
        provider_month: { provider: this.provider.name, month: usageMonth(this.options.now()) },
      },
      create: { provider: this.provider.name, month: usageMonth(this.options.now()), calls: 1 },
      update: { calls: { increment: 1 } },
    })
    return true
  }

  private fetchOne(ticker: string): Promise<void> {
    const running = this.inflight.get(ticker)
    if (running) return running
    const task = (async () => {
      if (!(await this.spend())) throw new BudgetExhausted()
      const now = this.options.now()
      try {
        const quote = await this.provider.fetchQuote(ticker)
        const data = {
          price: quote.price,
          changePct: quote.changePct,
          name: quote.name,
          quotedAt: quote.quotedAt,
          fetchedAt: now,
          source: this.provider.name,
          errorAt: null,
          error: null,
        }
        await this.prisma.quoteCache.upsert({
          where: { ticker },
          create: { ticker, ...data },
          update: data,
        })
      } catch (error) {
        const message = error instanceof Error ? error.message.slice(0, 200) : 'Falha no provedor'
        // Mantém o último preço conhecido; só marca a falha (RC-33).
        await this.prisma.quoteCache.upsert({
          where: { ticker },
          create: {
            ticker,
            fetchedAt: now,
            source: this.provider.name,
            errorAt: now,
            error: message,
          },
          update: { errorAt: now, error: message },
        })
      }
    })().finally(() => this.inflight.delete(ticker))
    this.inflight.set(ticker, task)
    return task
  }

  /**
   * Atualiza até `limit` tickers vencidos, um por vez (plano grátis). Devolve quantos ficaram
   * para depois (limite ou orçamento).
   */
  async refresh(
    tickers: readonly string[],
    limit: number,
  ): Promise<{ refreshed: number; pending: number }> {
    if (!this.provider.enabled) return { refreshed: 0, pending: 0 }
    const stale = await this.stale(tickers)
    let refreshed = 0
    for (const ticker of stale.slice(0, limit)) {
      try {
        await this.fetchOne(ticker)
        refreshed += 1
      } catch (error) {
        if (error instanceof BudgetExhausted) break
        throw error
      }
    }
    return { refreshed, pending: stale.length - refreshed }
  }

  /** Atualização em segundo plano (não segura a resposta; erros só vão para o log). */
  refreshInBackground(tickers: readonly string[], limit: number): void {
    if (!this.provider.enabled || tickers.length === 0) return
    void this.refresh(tickers, limit).catch((error: unknown) => {
      console.warn('[quotes] atualização em segundo plano falhou', error)
    })
  }

  /** Lista de tickers do provedor, guardada por 7 dias (1 chamada por semana, no máximo). */
  async tickerList(): Promise<{ ticker: string; name: string | null }[] | null> {
    const cached = await this.prisma.providerCache.findUnique({ where: { key: TICKERS_KEY } })
    const now = this.options.now()
    if (cached && now.getTime() - cached.fetchedAt.getTime() < TICKERS_TTL_MS) {
      return cached.payload as { ticker: string; name: string | null }[]
    }
    if (!this.provider.enabled)
      return (cached?.payload as { ticker: string; name: string | null }[]) ?? null
    this.tickersInflight ??= (async () => {
      try {
        if (!(await this.spend()))
          return (cached?.payload as { ticker: string; name: string | null }[]) ?? null
        const list = await this.provider.listTickers()
        await this.prisma.providerCache.upsert({
          where: { key: TICKERS_KEY },
          create: { key: TICKERS_KEY, payload: list, fetchedAt: now },
          update: { payload: list, fetchedAt: now },
        })
        return list
      } catch (error) {
        console.warn('[quotes] lista de tickers indisponível', error)
        return (cached?.payload as { ticker: string; name: string | null }[]) ?? null
      } finally {
        this.tickersInflight = null
      }
    })()
    return this.tickersInflight
  }

  /** Busca local na lista em cache (sem chamada por tecla). */
  async search(
    query: string,
    limit = 10,
  ): Promise<{ results: { ticker: string; name: string | null }[]; providerAvailable: boolean }> {
    const list = await this.tickerList()
    const text = normalizeText(query)
    if (!list) return { results: [], providerAvailable: false }
    const upper = query.trim().toUpperCase()
    const results = list
      .filter(
        (item) =>
          item.ticker.startsWith(upper) || (item.name && normalizeText(item.name).includes(text)),
      )
      .sort(
        (a, b) =>
          Number(b.ticker.startsWith(upper)) - Number(a.ticker.startsWith(upper)) ||
          a.ticker.localeCompare(b.ticker),
      )
      .slice(0, limit)
    return { results, providerAvailable: true }
  }
}

class BudgetExhausted extends Error {}
