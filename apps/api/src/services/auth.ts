import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto'
import { DEFAULT_ASSET_CLASSES, DEFAULT_CATEGORIES } from '@orla/core'
import type { LoginRequest, MeResponse, RegisterRequest, SignupMode } from '@orla/contracts'
import type { PrismaClient } from '@orla/db'
import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import { AppError, conflict, forbidden, unauthorized } from '../lib/errors.ts'

export const ACCESS_TOKEN_TTL_SECONDS = 15 * 60
export const REFRESH_TOKEN_TTL_SECONDS = 30 * 24 * 60 * 60
/** Janela em que um refresh token recém-rotacionado ainda não é tratado como roubo (abas concorrentes). */
const ROTATION_GRACE_MS = 10_000
const BCRYPT_COST = 12

export interface AuthConfig {
  jwtSecret: string
  refreshPepper: string
  signupMode: SignupMode
  inviteCode: string | undefined
  /** Usuários donos do app (minúsculos): veem a fila de relatos. */
  adminUsernames?: readonly string[]
}

export interface SessionTokens {
  accessToken: string
  refreshToken: string
}

export interface ClientInfo {
  userAgent: string | undefined
  ip: string | undefined
}

/** Hash usado só quando o usuário não existe, para o login levar o mesmo tempo (evita enumerar usuários). */
const DUMMY_HASH = bcrypt.hashSync('orla-dummy-password', BCRYPT_COST)

function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a)
  const right = Buffer.from(b)
  return left.length === right.length && timingSafeEqual(left, right)
}

export class AuthService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly config: AuthConfig,
  ) {}

  // ─── Tokens ──────────────────────────────────────────────────────────────

  private hashRefreshToken(token: string): string {
    return createHmac('sha256', this.config.refreshPepper).update(token).digest('hex')
  }

  private signAccessToken(userId: string): string {
    return jwt.sign({}, this.config.jwtSecret, {
      algorithm: 'HS256',
      subject: userId,
      expiresIn: ACCESS_TOKEN_TTL_SECONDS,
    })
  }

  /** Devolve o userId de um access token válido, ou null. */
  verifyAccessToken(token: string): string | null {
    try {
      const payload = jwt.verify(token, this.config.jwtSecret, { algorithms: ['HS256'] })
      return typeof payload === 'object' && typeof payload.sub === 'string' ? payload.sub : null
    } catch {
      return null
    }
  }

  private async createSession(userId: string, client: ClientInfo): Promise<SessionTokens> {
    const refreshToken = randomBytes(32).toString('base64url')
    await this.prisma.session.create({
      data: {
        userId,
        refreshTokenHash: this.hashRefreshToken(refreshToken),
        userAgent: client.userAgent?.slice(0, 300) ?? null,
        ip: client.ip ?? null,
        expiresAt: new Date(Date.now() + REFRESH_TOKEN_TTL_SECONDS * 1000),
      },
    })
    return { accessToken: this.signAccessToken(userId), refreshToken }
  }

  // ─── Casos de uso ────────────────────────────────────────────────────────

  signupMode(): SignupMode {
    return this.config.signupMode
  }

  async register(
    input: RegisterRequest,
    client: ClientInfo,
  ): Promise<{ me: MeResponse; tokens: SessionTokens }> {
    if (this.config.signupMode === 'closed') throw forbidden('O cadastro está fechado.')
    if (this.config.signupMode === 'invite') {
      const expected = this.config.inviteCode ?? ''
      if (!input.inviteCode || !expected || !safeEqual(input.inviteCode, expected)) {
        throw forbidden('Código de convite inválido.')
      }
    }

    const existing = await this.prisma.user.findUnique({ where: { username: input.username } })
    if (existing) throw conflict('Esse nome de usuário já está em uso.')

    const passwordHash = await bcrypt.hash(input.password, BCRYPT_COST)
    const user = await this.prisma.$transaction(async (tx) => {
      const created = await tx.user.create({
        data: {
          username: input.username,
          passwordHash,
          displayName: input.displayName || null,
          lastLoginAt: new Date(),
        },
      })
      await tx.userSettings.create({ data: { userId: created.id } })
      // RF-60: categorias padrão no cadastro.
      await tx.category.createMany({
        data: DEFAULT_CATEGORIES.map((category, index) => ({
          userId: created.id,
          kind: category.kind,
          name: category.name,
          icon: category.icon,
          color: category.color,
          sortOrder: index,
        })),
      })
      // RC-01: classes de ativo padrão.
      await tx.assetClass.createMany({
        data: DEFAULT_ASSET_CLASSES.map((item, index) => ({
          userId: created.id,
          ...item,
          sortOrder: index,
        })),
      })
      return created
    })

    const tokens = await this.createSession(user.id, client)
    return {
      me: {
        id: user.id,
        username: user.username,
        displayName: user.displayName,
        onboardingCompleted: false,
        isAdmin: this.isAdminUsername(user.username),
      },
      tokens,
    }
  }

  async login(
    input: LoginRequest,
    client: ClientInfo,
  ): Promise<{ me: MeResponse; tokens: SessionTokens }> {
    const user = await this.prisma.user.findUnique({ where: { username: input.username } })
    const valid = await bcrypt.compare(input.password, user?.passwordHash ?? DUMMY_HASH)
    if (!user || !valid) throw unauthorized('Usuário ou senha incorretos.')

    await this.prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } })
    const tokens = await this.createSession(user.id, client)
    return { me: await this.me(user.id), tokens }
  }

  /**
   * Troca o refresh token por um novo par (rotação a cada uso). Reuso de um token já
   * rotacionado fora da janela de tolerância = possível roubo → revoga todas as sessões.
   */
  async refresh(
    refreshToken: string,
    client: ClientInfo,
  ): Promise<{ me: MeResponse; tokens: SessionTokens }> {
    const session = await this.prisma.session.findUnique({
      where: { refreshTokenHash: this.hashRefreshToken(refreshToken) },
    })
    if (!session) throw unauthorized('Sessão expirada. Faça login de novo.')

    if (session.revokedAt) {
      if (Date.now() - session.revokedAt.getTime() > ROTATION_GRACE_MS) {
        await this.prisma.session.updateMany({
          where: { userId: session.userId, revokedAt: null },
          data: { revokedAt: new Date() },
        })
      }
      throw unauthorized('Sessão expirada. Faça login de novo.')
    }
    if (session.expiresAt.getTime() <= Date.now())
      throw unauthorized('Sessão expirada. Faça login de novo.')

    // Revoga a atual só se ninguém revogou antes (corrida entre duas requisições).
    const { count } = await this.prisma.session.updateMany({
      where: { id: session.id, revokedAt: null },
      data: { revokedAt: new Date() },
    })
    if (count === 0) throw unauthorized('Sessão expirada. Faça login de novo.')

    const tokens = await this.createSession(session.userId, client)
    return { me: await this.me(session.userId), tokens }
  }

  async logout(refreshToken: string | undefined): Promise<void> {
    if (!refreshToken) return
    await this.prisma.session.updateMany({
      where: { refreshTokenHash: this.hashRefreshToken(refreshToken), revokedAt: null },
      data: { revokedAt: new Date() },
    })
  }

  isAdminUsername(username: string): boolean {
    return (this.config.adminUsernames ?? []).includes(username.toLowerCase())
  }

  async me(userId: string): Promise<MeResponse> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { settings: { select: { onboardingCompletedAt: true } } },
    })
    if (!user) throw new AppError(401, 'UNAUTHORIZED', 'Sessão inválida. Faça login de novo.')
    return {
      id: user.id,
      username: user.username,
      displayName: user.displayName,
      onboardingCompleted: Boolean(user.settings?.onboardingCompletedAt),
      isAdmin: this.isAdminUsername(user.username),
    }
  }
}
