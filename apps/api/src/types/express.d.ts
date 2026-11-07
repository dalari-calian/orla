declare global {
  namespace Express {
    interface Request {
      /** ID do usuário da sessão, preenchido pelo middleware `requireAuth`. Nunca vem do cliente. */
      userId?: string
    }
  }
}

export {}
