# Índice da especificação

Projeto: **Orla** — gestão financeira pessoal e de investimentos, substituindo as planilhas atuais.

| #   | Arquivo                           | Conteúdo                                                                            | Quando ler                                  |
| --- | --------------------------------- | ----------------------------------------------------------------------------------- | ------------------------------------------- |
| 01  | `01-visao-e-escopo.md`            | Objetivo, usuários, módulos, escopo dentro/fora                                     | Sempre, uma vez                             |
| 02  | `02-arquitetura.md`               | Stack, monorepo, hospedagem gratuita, auth, decisões (ADRs)                         | Setup e infra                               |
| 03  | `03-modelo-de-dados.md`           | Tabelas, campos, índices, convenções de dinheiro/data                               | Qualquer coisa que toque banco              |
| 04  | `04-regras-financeiro.md`         | Receitas, salário base, despesas, cartão, parcelamentos, planejamento, sobra do mês | Módulo Finanças                             |
| 05  | `05-regras-carteira.md`           | Classes, ativos, operações, preço médio, proventos, cotações, notícias              | Módulo Carteira                             |
| 06  | `06-aportes-e-rebalanceamento.md` | Simulador de aporte, metas de alocação, subtotais, efetivação                       | Módulo Aporte                               |
| 07  | `07-balanco-e-rentabilidade.md`   | Balanço mensal, rentabilidade real descontando aportes, histórico de preços/DY/P/VP | Módulo Balanço                              |
| 08  | `08-importacao-exportacao.md`     | Importar planilhas/CSV, exportar, backup                                            | Migração de dados                           |
| 09  | `09-design-system.md`             | Estética estilo Apple, tokens, componentes, responsividade                          | Qualquer UI                                 |
| 10  | `10-telas-e-fluxos.md`            | Mapa de navegação, cada tela, cada dashboard                                        | Qualquer UI                                 |
| 11  | `11-api.md`                       | Endpoints REST                                                                      | Qualquer endpoint                           |
| 12  | `12-requisitos-nao-funcionais.md` | Performance, segurança, PWA, testes, observabilidade                                | Sempre                                      |
| 13  | `13-roadmap.md`                   | Fases de implementação com critérios de aceite                                      | Planejar o próximo passo                    |
| 14  | `14-ambiente-local.md`            | Pré-requisitos da máquina, portas, .env, script de verificação                      | Antes da Fase 0 e quando o ambiente quebrar |
| 15  | `15-bugs-e-melhorias.md`          | Relatos de bug/melhoria no app, status e a fila de agentes                          | Ao triar relatos ou rodar a fila            |
| 16  | `16-deploy-e-backup.md`           | Pipeline de deploy, backups 00h/12h/pre-deploy, como ligar e restaurar              | Deploy, backup ou restauração               |

## Como usar com o Claude Code

1. Coloque esta pasta na raiz do repositório (o `CLAUDE.md` fica na raiz).
2. Comece com: _"Leia o CLAUDE.md e o docs/00-INDICE.md. Implemente a Fase 0 do docs/13-roadmap.md."_
3. A cada fase: peça um plano primeiro, revise, depois peça a implementação.
4. Se uma regra estiver ambígua, o Claude Code deve **perguntar** em vez de inventar — e a decisão tomada deve ser registrada no documento correspondente (seção "Decisões em aberto" de cada arquivo).
5. Referências visuais: salve prints dos shots do Dribbble em `docs/referencias/` para o Claude Code poder olhar.
