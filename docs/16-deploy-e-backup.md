# 16 — Deploy e backup

Como o Orla vai para produção (Vercel + Neon) e como os dados ficam protegidos fora do Neon. Complementa `02-arquitetura.md` (hospedagem) e `08-importacao-exportacao.md` (RE-02 backup JSON manual, RE-03 backup automático).

> **Estado atual:** os workflows estão prontos mas **desligados**. Nada roda até você criar as variáveis `DEPLOY_ENABLED` / `BACKUP_ENABLED` (ver "Como ligar").

## Visão geral

```
                    ┌──────────────── repositório orla (público) ────────────────┐
push/merge na main ─► CI (ci.yml) ──verde──► Deploy (deploy.yml)                    │
                    │                          1. backup "pre-deploy"  ──┐          │
                    │                          2. migrations no Neon     │          │
                    │                          3. vercel deploy --prod   │          │
                    │                          4. confere /api/v1/health │          │
                    │  backup.yml (reutilizável: pg_dump → age → gaveta) ◄┤         │
                    └────────────────────────────────────────────────────│─────────┘
                    ┌──────────── repositório orla-backups (PRIVADO) ─────│─────────┐
   00h e 12h ──────►│ backup-schedule.yml ──chama──► backup.yml ◄──────────┘         │
   (Brasília)       │ branch `data`: as 15 gavetas criptografadas, sem histórico      │
                    └────────────────────────────────────────────────────────────────┘
```

| Arquivo                                                     | Onde roda       | Quando                                            |
| ----------------------------------------------------------- | --------------- | ------------------------------------------------- |
| `.github/workflows/ci.yml`                                  | `orla`          | Todo push/PR (lint, testes, build) — já existia   |
| `.github/workflows/deploy.yml`                              | `orla`          | Depois do CI verde na `main`, ou manual           |
| `.github/workflows/backup.yml`                              | quem chamar     | Nunca sozinho — é chamado pelos outros dois       |
| `infra/orla-backups/.github/workflows/backup-schedule.yml`  | `orla-backups`  | 00h e 12h de Brasília, ou manual (é só um modelo aqui) |

## Backups

**Por que fora do Neon:** o código está no Git e se reconstrói; os dados existem só no banco. O restore do Neon Free cobre ~6 h — um erro percebido dias depois (bug numa feature, exclusão por engano) só se desfaz com uma cópia antiga guardada em outro lugar.

**Gavetas** (arquivos que se sobrescrevem, nunca acumulam):

| Gatilho                    | Gavetas                                                       |
| -------------------------- | ------------------------------------------------------------- |
| 00h de Brasília (03h UTC)  | `backup-segunda-00h` … `backup-domingo-00h` (7)               |
| 12h de Brasília (15h UTC)  | `backup-segunda-12h` … `backup-domingo-12h` (7)               |
| Antes de cada deploy       | `backup-pre-deploy` (1)                                       |

Cada gaveta é um `.dump.age` (dump do Postgres, criptografado) e um `.txt` com a data/hora UTC em que foi gerada. Dá para voltar a qualquer meio-dia/meia-noite da última semana ou ao instante antes do último deploy.

**Decisões:**

- Repositório **privado** separado (`orla-backups`): o `orla` é público, e artefatos de repositório público podem ser baixados por terceiros.
- **Criptografia com chave pública** (`age`): o GitHub só tem a chave pública — consegue criar backups, mas **não abrir**. A chave privada fica só com você (gerenciador de senhas). Perdeu a chave privada = backups inúteis.
- O branch `data` é refeito a cada rodada com um único commit: "sobrescrever" de verdade, sem o Git guardar as versões antigas.
- O agendamento mora no repositório privado: o GitHub desliga crons de repositórios **públicos** após 60 dias sem atividade.
- Dump menor que 2 KB = falha (não sobrescreve uma gaveta boa com um arquivo quebrado). Se o backup falhar, o GitHub manda e-mail; no deploy, a falha **impede** o deploy.

## Como ligar (checklist)

Faça na ordem. Segredos você cadastra direto no GitHub (nunca no chat nem no Git).

### 1. Chave de criptografia (uma vez)

```bash
# Windows: winget install FiloSottile.age   (ou, sem instalar nada, via Docker:)
docker run --rm alpine sh -c "apk add -q age && age-keygen"
```

Sai algo como:

```
# public key: age1qyz...          ← vai para o GitHub (BACKUP_AGE_RECIPIENT)
AGE-SECRET-KEY-1ABC...            ← SÓ no seu gerenciador de senhas. Nunca no GitHub.
```

Guarde as duas linhas (a pública e a `AGE-SECRET-KEY-…`) no gerenciador de senhas.

### 2. Repositório `orla-backups`

1. Crie o repositório **privado** `orla-backups` (pode ser vazio).
2. Copie `infra/orla-backups/.github/workflows/backup-schedule.yml` para ele, no mesmo caminho, e faça commit na branch padrão.
3. Em `orla-backups` › Settings › Secrets and variables › Actions:
   - Secret `BACKUP_DATABASE_URL` — URL **direta** do Neon (host **sem** `-pooler`), com `?sslmode=require`.
   - Secret `BACKUP_AGE_RECIPIENT` — a chave pública `age1…`.
   - Settings › Actions › General › Workflow permissions: **Read and write**.

### 3. Repositório `orla`

Settings › Secrets and variables › Actions:

| Tipo     | Nome                   | Valor                                                                                  |
| -------- | ---------------------- | -------------------------------------------------------------------------------------- |
| Secret   | `BACKUP_DATABASE_URL`  | A mesma URL direta do Neon (usada também para as migrations)                          |
| Secret   | `BACKUP_AGE_RECIPIENT` | A mesma chave pública `age1…`                                                          |
| Secret   | `BACKUPS_REPO_TOKEN`   | Fine-grained token: só o repositório `orla-backups`, permissão **Contents: Read and write** |
| Secret   | `VERCEL_TOKEN`         | Vercel › Account Settings › Tokens                                                     |
| Secret   | `VERCEL_ORG_ID`        | `.vercel/project.json` depois do `vercel link` (`orgId`)                               |
| Secret   | `VERCEL_PROJECT_ID`    | `.vercel/project.json` (`projectId`)                                                   |
| Variable | `BACKUPS_REPO`         | `dalari-calian/orla-backups`                                                           |
| Variable | `PRODUCTION_URL`       | `https://<seu-app>.vercel.app` (sem barra no fim)                                      |

E na Vercel: desligar o deploy automático de produção pela `main` (`vercel.json` › `"git": { "deploymentEnabled": { "main": false } }`), porque quem publica produção é o `deploy.yml` (depois do backup). Previews de PR continuam automáticos.

### 4. Ligar

- `orla-backups` › Variables › `BACKUP_ENABLED` = `true` → backups das 00h e 12h passam a rodar. Teste na hora com **Actions › Backup agendado › Run workflow** e confira o branch `data`.
- `orla` › Variables › `DEPLOY_ENABLED` = `true` → todo merge na `main` com CI verde faz backup + migrations + deploy.

Para pausar qualquer um, troque a variável para `false` (ou apague).

## Como restaurar

1. **Baixe a gaveta** (precisa estar logado no GitHub com acesso ao repositório privado):

   ```bash
   gh repo clone dalari-calian/orla-backups orla-backups -- --branch data --depth 1
   cat orla-backups/backup-terca-00h.txt   # confere de quando é
   ```

2. **Descriptografe** com a chave privada (cole a linha `AGE-SECRET-KEY-…` num arquivo `orla-backup.key` temporário e apague depois):

   ```bash
   age --decrypt -i orla-backup.key -o backup.dump orla-backups/backup-terca-00h.dump.age
   ```

3. **Restaure** num banco (o mesmo Neon, um banco novo ou o Postgres local):

   ```bash
   docker run --rm -i -e DATABASE_URL="<url-direta-do-destino>" postgres:17-alpine \
     sh -c 'pg_restore --clean --if-exists --no-owner --no-acl -d "$DATABASE_URL"' < backup.dump
   ```

   `--clean` apaga e recria as tabelas do destino: **tudo que estiver lá é substituído** pelo conteúdo do backup. Se for restaurar em produção, desligue o deploy (`DEPLOY_ENABLED=false`) antes.

4. Se trocou de banco, atualize a `DATABASE_URL` na Vercel e os secrets `BACKUP_DATABASE_URL`.

**Treino recomendado (1×/mês, 5 min):** restaure a gaveta mais recente no Postgres local (`pnpm db:up`, URL `postgresql://orla:orla@localhost:5433/orla`) e abra o app. Backup que nunca foi restaurado é só uma esperança.
