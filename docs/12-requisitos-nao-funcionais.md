# 12 — Requisitos não funcionais

## Performance

- **RNF-01** First load no 4G: LCP < 2,5 s; navegação entre telas < 200 ms (dados em cache do TanStack Query, prefetch ao passar/tocar).
- **RNF-02** Bundle inicial < 200 KB gzip; rotas e gráficos com code-splitting.
- **RNF-03** API p95 < 300 ms com banco acordado; cold start total (function + Neon acordando) < 1,5 s — mostrar skeleton, nunca tela branca.
- **RNF-04** Cálculos do simulador e do balanço rodam no cliente (instantâneos enquanto digita).
- **RNF-05** Updates otimistas para lançar/pagar/excluir.

## PWA / mobile

- **RNF-10** Manifest + ícones; instalável no iOS/Android; `display: standalone`; theme-color por tema.
- **RNF-11** Service worker cacheia o shell e os últimos dados lidos (modo leitura offline). Escrita offline: fila local que sincroniza ao voltar (fase 3).
- **RNF-12** Sem zoom indesejado em inputs no iOS (font-size ≥ 16px); safe areas.

## Segurança e privacidade

- **RNF-20** HTTPS sempre; cookies `httpOnly`, `Secure`, `SameSite=Lax`; CSRF via SameSite + checagem de `Origin` nas escritas.
- **RNF-21** Isolamento por `user_id` em toda query (teste automatizado: usuário B não lê nada do A em nenhum endpoint).
- **RNF-22** Rate limit: login, cadastro, quick-entry, import.
- **RNF-23** Headers: CSP restrita, `X-Content-Type-Options`, `Referrer-Policy: strict-origin-when-cross-origin`.
- **RNF-24** Segredos só em env da Vercel; nada de chave de provedor no front.
- **RNF-25** Sem dados sensíveis em logs (valores e descrições não vão para log).
- **RNF-26** LGPD básico: exportar tudo e excluir conta (hard delete) disponíveis ao usuário.

## Confiabilidade e dados

- **RNF-30** Operações compostas (gerar parcelas, efetivar aporte, commit de importação, fechar balanço) em **transação** de banco.
- **RNF-31** Migrations versionadas com `prisma migrate`; `prisma migrate deploy` roda no deploy (step de build) e nunca são editadas depois de aplicadas.
- **RNF-32** Backup semanal automático + backup JSON manual pelo usuário.
- **RNF-33** Falha de provedor externo (cotação/notícia) nunca quebra a tela.

## Qualidade

- **RNF-40** TypeScript `strict`, sem `any` (lint).
- **RNF-41** `packages/core` com cobertura ≥ 90% de linhas; todos os casos listados nos docs 04–07.
- **RNF-42** Testes de API com Postgres real (testcontainers ou o docker local) para cada rota.
- **RNF-43** E2E Playwright nos 7 fluxos críticos (doc 10), em viewport 375×812 e 1440×900.
- **RNF-44** CI no GitHub Actions: lint, typecheck, test, build em todo PR.

## Observabilidade

- **RNF-50** Logs estruturados na API (rota, status, duração, user hash).
- **RNF-51** Captura de erros no front e na API (Sentry free, opcional).
- **RNF-52** Contador de consumo da brapi por mês visível em Configurações.

## Escalabilidade e evolução

- **RNF-60** Trocar Neon por qualquer Postgres = trocar `DATABASE_URL`.
- **RNF-61** API Express roda sem mudanças na Vercel (function) ou em qualquer servidor Node/Docker (Render, Railway, Fly.io, VPS).
- **RNF-62** App nativo (Expo) reutiliza `core` e `contracts`; auth com os mesmos JWT via header `Authorization: Bearer`.
- **RNF-63** Bot WhatsApp = serviço separado que chama `/quick-entry` com token por usuário; nenhuma regra nova no bot.
- **RNF-64** Internacionalização preparada (strings em arquivo pt-BR), mesmo usando só pt-BR.
