# 01 — Visão e escopo

## Nome

**Orla** — simples, suave e fácil de lembrar. Usar em: título da página, manifest do PWA (`name: "Orla"`, `short_name: "Orla"`), tela de login, ícone (letra "O" ou forma de onda minimalista), nome do repositório (`orla`) e prefixo dos pacotes (`@orla/core`, `@orla/contracts`, `@orla/db`, `@orla/web`, `@orla/api`).

## Problema

Hoje o controle é feito em duas planilhas:

- **Financeiro:** entradas do mês (salário médio + extras), gastos com forma de pagamento, instituição, quem recebeu, categoria, natureza (fixo/recorrente/planejamento/parcelado), parcelamentos com saldo para quitar, e a sobra do mês após a meta de investimento.
- **Investimentos:** ativos por classe, operações de compra, balanço mensal por ativo/corretora, proventos recebidos, simulador de aporte por categoria/ativo, histórico de preços observados (máximo/mínimo), DY e P/VP, e a rentabilidade **real** (descontando aportes).

Planilha não é boa no celular, não valida dados, não tem histórico consultável nem gráficos de evolução decentes.

## Objetivo

Um app web **mobile-first**, rápido, minimalista (estética de app Apple), que reproduz 100% da lógica das planilhas e acrescenta dashboards, notícias por ativo e importação dos dados atuais. Custo zero de hospedagem no início, sem precisar migrar quando crescer.

## Usuários

- Fase inicial: 2 usuários (dono + 1 testador), cada um com **seus próprios dados isolados**.
- Futuro: mais usuários, app nativo, bot de WhatsApp para lançar gastos por mensagem.

## Módulos

| Módulo            | Resumo                                                                                                        |
| ----------------- | ------------------------------------------------------------------------------------------------------------- |
| **Início**        | Resumo do mês financeiro + resumo do patrimônio                                                               |
| **Finanças**      | Mês de competência, receitas, despesas, cartões/faturas, parcelamentos, planejamento, sobra do mês, dashboard |
| **Carteira**      | Classes, ativos, operações, preço médio, posição, proventos, notícias por ativo, dashboard                    |
| **Aporte**        | Simulador de aporte com metas por classe e por ativo, subtotais em tempo real, efetivação em operações        |
| **Balanço**       | Fechamento mensal do patrimônio, rentabilidade real mês a mês e no ano, histórico de preços/DY/P/VP           |
| **Configurações** | Contas/instituições, cartões, categorias, salário base, metas, importar/exportar, perfil                      |

## Dentro do escopo (v1)

- Login/cadastro com **username + senha**.
- CRUD completo e editável de tudo (lançamentos, parcelamentos, ativos, operações, proventos, balanços).
- Importação via CSV/XLSX com mapeamento de colunas + templates oficiais.
- Exportação completa (CSV por entidade + JSON de backup).
- Cotações automáticas (com fallback manual) e notícias por ativo.
- PWA instalável na tela inicial do celular.
- Tema claro/escuro.

## Fora do escopo (v1) — preparado na arquitetura

- App nativo (React Native/Expo) — a API e o `packages/core` já são reutilizáveis.
- Bot de WhatsApp — a API já terá endpoint de "lançamento rápido" com parser de texto.
- Open Finance / sincronização bancária automática.
- Cálculo de imposto de renda (DARF, IR sobre vendas) — só guardamos os dados necessários.
- Multi-moeda real (ativos internacionais ficam com valor em BRL informado manualmente na v1).
