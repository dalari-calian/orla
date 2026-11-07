import type { RequestHandler } from 'express'

/** RNF-23: cabeçalhos básicos de segurança (sem dependência extra). */
export const securityHeaders: RequestHandler = (_req, res, next) => {
  res.set({
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'X-Frame-Options': 'DENY',
    'Content-Security-Policy': "default-src 'none'; frame-ancestors 'none'",
  })
  next()
}
