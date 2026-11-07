# 09 — Design system

## Direção

Marca: **Orla**. O nome sugere calma, horizonte e equilíbrio — reforça a estética leve: muito respiro, cantos suaves, uma cor de destaque. Logotipo tipográfico ("orla" em minúsculas, peso semibold) + ícone simples para o PWA.

Minimalista, calmo, com cara de **app nativo da Apple** (Carteira, Saúde, Ações, Ajustes): fundo neutro levemente acinzentado, cartões brancos arredondados, tipografia grande e confiante para os números, uma cor de destaque, muito espaço em branco, movimento sutil. Referências do Dribbble enviadas pelo dono (salvar prints em `docs/referencias/`):

- https://dribbble.com/shots/26444376-Finance-App
- https://dribbble.com/shots/27824089-Personal-Finance-Budgeting-Mobile-App
- https://dribbble.com/shots/25501188-Finance-Mobile-App
- https://dribbble.com/shots/27836774-AI-Powered-Finance-Mobile-App

Traços a pegar dessas referências: **número herói** gigante no topo (saldo/patrimônio), cartões com cantos bem arredondados, chips/pílulas para filtros, gráficos limpos sem grade pesada, ícones lineares em círculos coloridos suaves, hierarquia por peso tipográfico em vez de bordas.

**Não fazer:** gradientes chamativos, sombras pesadas, bordas em tudo, tabelas densas no mobile, mais de uma cor de destaque, emojis como ícone.

## Tokens (CSS variables em `apps/web/src/styles/tokens.css`, consumidas pelo Tailwind v4 `@theme`)

### Cores

| token         | claro                | escuro                 | uso                               |
| ------------- | -------------------- | ---------------------- | --------------------------------- |
| `--bg`        | `#F2F2F7`            | `#000000`              | fundo da app (grouped background) |
| `--surface`   | `#FFFFFF`            | `#1C1C1E`              | cartões, sheets                   |
| `--surface-2` | `#F7F7FA`            | `#2C2C2E`              | campos, linhas alternadas         |
| `--separator` | `rgba(60,60,67,.12)` | `rgba(84,84,88,.6)`    | divisores finos (0.5px em retina) |
| `--text`      | `#000000`            | `#FFFFFF`              |                                   |
| `--text-2`    | `rgba(60,60,67,.6)`  | `rgba(235,235,245,.6)` | secundário                        |
| `--text-3`    | `rgba(60,60,67,.3)`  | `rgba(235,235,245,.3)` | placeholder                       |
| `--accent`    | `#007AFF`            | `#0A84FF`              | ação primária, links, seleção     |
| `--positive`  | `#34C759`            | `#30D158`              | ganho, receita, dentro da meta    |
| `--negative`  | `#FF3B30`            | `#FF453A`              | perda, estouro                    |
| `--warning`   | `#FF9500`            | `#FF9F0A`              | atenção (perto do teto)           |

Paleta de classes/categorias (gráficos): `#007AFF #34C759 #FF9500 #AF52DE #FF2D55 #5AC8FA #FFCC00 #8E8E93` (versões escuras do sistema iOS no tema escuro). Cada classe de ativo tem cor fixa; nunca depender só da cor — sempre rótulo ao lado.

> Receita/despesa **não** usam verde/vermelho em todo valor (cansa). Despesa em `--text`, receita com sinal `+` em `--positive`. Vermelho só para estado ruim (estouro, perda, sobra negativa).

### Tipografia

- Stack: `-apple-system, BlinkMacSystemFont, "SF Pro Text", "Inter", system-ui, sans-serif` (Inter via fonte local/variable para Android/Windows).
- **Todos os números**: `font-variant-numeric: tabular-nums` (colunas alinhadas, números não "pulam" ao animar).
- Escala: Large Title 34/41 bold · Title 1 28/34 bold · Title 2 22/28 semibold · Headline 17/22 semibold · Body 17/22 · Callout 16/21 · Subhead 15/20 · Footnote 13/18 · Caption 12/16.
- **Número herói:** 40–48px, semibold, com centavos menores (`R$ 12.480`<sup>,32</sup>) e tracking levemente negativo.

### Espaço, raio, sombra, movimento

- Grade de 4px; padding de tela 16px (mobile) / 24–32px (desktop).
- Raio: cartão 20px, campos/botões 12px, chips 999px, sheet 28px no topo.
- Sombra: só `0 1px 2px rgba(0,0,0,.04), 0 8px 24px rgba(0,0,0,.04)` em cartões flutuantes; no escuro, sem sombra (usar `--surface`).
- Blur: tab bar e cabeçalho com `backdrop-filter: saturate(180%) blur(20px)` e fundo `color-mix(--surface 72%, transparent)`.
- Movimento: 200–300 ms, curva `cubic-bezier(.32,.72,0,1)` (iOS sheet). Números do herói fazem _count-up_ curto. Respeitar `prefers-reduced-motion`.

## Componentes base (`apps/web/src/components/ui`)

| componente                             | notas                                                                                                            |
| -------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `AppShell`                             | mobile: header grande que colapsa ao rolar + tab bar inferior; desktop: sidebar                                  |
| `TabBar`                               | 5 itens: Início · Finanças · **+** · Carteira · Mais (Aporte, Balanço, Config) — o + é o botão central de lançar |
| `Sidebar`                              | desktop ≥1024px: logo, navegação, seletor de mês, usuário                                                        |
| `LargeTitle`                           | título estilo iOS que encolhe no scroll                                                                          |
| `MonthSwitcher`                        | ◀ Novembro 2026 ▶, swipe lateral, toque abre seletor                                                             |
| `Card`, `CardHeader`                   | superfície padrão                                                                                                |
| `GroupedList`, `ListRow`               | lista inset agrupada (ícone em círculo, título, subtítulo, valor à direita, chevron); swipe actions no mobile    |
| `Sheet`                                | bottom sheet no mobile (arrastável, Vaul), dialog central no desktop                                             |
| `MoneyInput`                           | máscara BRL, teclado `inputmode="decimal"`, valor grande                                                         |
| `SegmentedControl`                     | forma de pagamento, tipo, período                                                                                |
| `Chip` / `ChipGroup`                   | categorias, filtros                                                                                              |
| `ProgressBar`, `ProgressRing`          | meta, parcelas, orçamento                                                                                        |
| `StatTile`                             | rótulo pequeno + número + variação                                                                               |
| `DeltaBadge`                           | ▲ 2,3% verde / ▼ vermelho                                                                                        |
| `EmptyState`, `Skeleton`, `ErrorState` | obrigatórios em toda lista/tela                                                                                  |
| `Toast`                                | com "Desfazer"                                                                                                   |
| `Charts/*`                             | Donut, BarStack, Line, AllocationBars (atual × meta), Sparkline — eixos discretos, tooltip ao tocar              |

## Responsividade

| breakpoint               | layout                                                                                                                                        |
| ------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------- |
| `< 640` (base, 375 alvo) | 1 coluna, tab bar inferior, sheets de baixo, listas em vez de tabelas                                                                         |
| `≥ 640 sm`               | 1 coluna mais larga, cartões de stat 2 por linha                                                                                              |
| `≥ 768 md`               | 2 colunas nos dashboards                                                                                                                      |
| `≥ 1024 lg`              | sidebar fixa (240px) no lugar da tab bar, conteúdo até 1200px, tabelas com ordenação, sheets viram dialogs/painel lateral, atalhos de teclado |
| `≥ 1440 xl`              | dashboards em 3 colunas, painel de detalhe lateral (master-detail)                                                                            |

- Alvos de toque ≥ 44×44px. `safe-area-inset-*` respeitado (notch, home indicator).
- Formatação: `Intl.NumberFormat('pt-BR', {style:'currency', currency:'BRL'})`, datas `dd/MM/yyyy`, mês "nov. 2026".
- Acessibilidade: contraste AA, foco visível, rótulos em todos os ícones, gráficos com tabela alternativa acessível.
- Privacidade: botão "olho" no header que **oculta valores** (`R$ ••••`) — útil para abrir o app em público.

O app não precisa ficar parecido com uma planilha em formato mobile, eu quero ter o mesmo controle que tenho com a planilha mas algo inovador, difenteet, onde eu consiga controlar as mesmas informações de forma descomplicada.
