import {
  CalendarRange,
  ChartColumn,
  ChartLine,
  ChartPie,
  Coins,
  CreditCard,
  Download,
  HandCoins,
  House,
  Landmark,
  LayoutDashboard,
  ListChecks,
  MessageSquareWarning,
  PiggyBank,
  ReceiptText,
  Repeat,
  Scale,
  Settings,
  Store,
  Tags,
  Target,
  Upload,
  type LucideIcon,
} from 'lucide-react'

/** Fase do roadmap em andamento (docs/13): telas de fases futuras mostram "Fase N". */
export const CURRENT_PHASE = 6

/** Seções principais (sidebar no desktop; Início/Finanças/Carteira na tab bar). */
export interface Section {
  key: 'inicio' | 'financas' | 'carteira' | 'aporte' | 'balanco' | 'config'
  title: string
  path: string
  icon: LucideIcon
}

export const sections: readonly Section[] = [
  { key: 'inicio', title: 'Início', path: '/', icon: House },
  { key: 'financas', title: 'Finanças', path: '/financas', icon: ReceiptText },
  { key: 'carteira', title: 'Carteira', path: '/carteira', icon: ChartPie },
  { key: 'aporte', title: 'Aporte', path: '/aporte', icon: PiggyBank },
  { key: 'balanco', title: 'Balanço', path: '/balanco', icon: Scale },
  { key: 'config', title: 'Configurações', path: '/config', icon: Settings },
]

/** Uma tela do mapa de navegação (docs/10) e a fase do roadmap em que ela ganha vida. */
export interface Screen {
  path: string
  title: string
  description: string
  phase: number
  icon: LucideIcon
  section: Section['key']
  /** Exemplo navegável para rotas com parâmetro (ex.: /financas/parcelamentos/exemplo). */
  sampleHref?: string
}

export const screens: readonly Screen[] = [
  // Finanças
  {
    path: '/financas/dashboard',
    title: 'Dashboard financeiro',
    description: 'Gráficos do mês, do trimestre e do ano: para onde vai o dinheiro.',
    phase: 3,
    icon: LayoutDashboard,
    section: 'financas',
  },
  {
    path: '/financas/parcelamentos',
    title: 'Parcelamentos',
    description: 'Quanto falta para quitar tudo e quando você fica livre das parcelas.',
    phase: 2,
    icon: CalendarRange,
    section: 'financas',
  },
  {
    path: '/financas/parcelamentos/:id',
    title: 'Detalhe do parcelamento',
    description: 'Parcelas, valores pagos e ações de quitar ou cancelar.',
    phase: 2,
    icon: CalendarRange,
    section: 'financas',
    sampleHref: '/financas/parcelamentos/exemplo',
  },
  {
    path: '/financas/cartoes/:id/fatura',
    title: 'Fatura do cartão',
    description: 'Total da fatura, fechamento, vencimento e lançamentos do cartão.',
    phase: 2,
    icon: CreditCard,
    section: 'financas',
    sampleHref: '/financas/cartoes/exemplo/fatura',
  },
  {
    path: '/financas/projecao',
    title: 'Projeção 12 meses',
    description: 'Entradas, fixas, parcelas e sobra dos próximos 12 meses.',
    phase: 3,
    icon: ChartLine,
    section: 'financas',
  },
  // Carteira
  {
    path: '/carteira/dashboard',
    title: 'Dashboard da carteira',
    description: 'Patrimônio, alocação e rentabilidade em um só lugar.',
    phase: 7,
    icon: LayoutDashboard,
    section: 'carteira',
  },
  {
    path: '/carteira/ativos/:id',
    title: 'Detalhe do ativo',
    description: 'Posição, operações, proventos, preços e notícias do ativo.',
    phase: 5,
    icon: Coins,
    section: 'carteira',
    sampleHref: '/carteira/ativos/exemplo',
  },
  {
    path: '/carteira/proventos',
    title: 'Proventos',
    description: 'Dividendos, JCP e rendimentos recebidos mês a mês.',
    phase: 5,
    icon: HandCoins,
    section: 'carteira',
  },
  // Aporte
  {
    path: '/aporte/:planId',
    title: 'Simulação de aporte',
    description: 'Uma simulação salva: divisão por classe, compras e efetivação.',
    phase: 6,
    icon: PiggyBank,
    section: 'aporte',
    sampleHref: '/aporte/exemplo',
  },
  // Balanço
  {
    path: '/balanco/evolucao',
    title: 'Evolução',
    description: 'Rentabilidade real mês a mês, descontando os aportes.',
    phase: 7,
    icon: ChartColumn,
    section: 'balanco',
  },
  {
    path: '/balanco/precos',
    title: 'Preços observados',
    description: 'Histórico de preço, DY e P/VP anotados nos balanços.',
    phase: 7,
    icon: ChartLine,
    section: 'balanco',
  },
  {
    path: '/balanco/:mes',
    title: 'Balanço do mês',
    description: 'Formulário do balanço mensal com resumo ao vivo.',
    phase: 7,
    icon: Scale,
    section: 'balanco',
    sampleHref: '/balanco/2026-11',
  },
  // Configurações
  {
    path: '/config/contas',
    title: 'Contas',
    description: 'Bancos, corretoras e carteiras onde seu dinheiro está.',
    phase: 1,
    icon: Landmark,
    section: 'config',
  },
  {
    path: '/config/cartoes',
    title: 'Cartões',
    description: 'Cartões de crédito com dia de fechamento e vencimento.',
    phase: 1,
    icon: CreditCard,
    section: 'config',
  },
  {
    path: '/config/categorias',
    title: 'Categorias',
    description: 'Categorias de receita e despesa, com teto opcional.',
    phase: 1,
    icon: Tags,
    section: 'config',
  },
  {
    path: '/config/estabelecimentos',
    title: 'Estabelecimentos',
    description: 'Onde você gasta e de quem você recebe.',
    phase: 1,
    icon: Store,
    section: 'config',
  },
  {
    path: '/config/recorrentes',
    title: 'Recorrentes',
    description: 'Salário base, contas fixas e planejamentos anuais.',
    phase: 2,
    icon: Repeat,
    section: 'config',
  },
  {
    path: '/config/metas',
    title: 'Metas',
    description: 'Meta de investimento e alocação ideal por classe.',
    phase: 2,
    icon: Target,
    section: 'config',
  },
  {
    path: '/config/importar',
    title: 'Importar planilhas',
    description: 'Traga seu histórico de planilhas .xlsx e .csv.',
    phase: 4,
    icon: Upload,
    section: 'config',
  },
  {
    path: '/config/importacoes',
    title: 'Importações',
    description: 'Histórico de importações, com opção de desfazer.',
    phase: 4,
    icon: ListChecks,
    section: 'config',
  },
  {
    path: '/config/exportar',
    title: 'Exportar e backup',
    description: 'Exporte para CSV/XLSX ou faça um backup completo.',
    phase: 4,
    icon: Download,
    section: 'config',
  },
  {
    path: '/config/feedback',
    title: 'Bugs e melhorias',
    description: 'Reporte problemas, sugira melhorias e acompanhe o andamento.',
    phase: 5,
    icon: MessageSquareWarning,
    section: 'config',
  },
]

/** Telas-índice de cada seção (a própria rota da seção). */
export const sectionScreens: Record<Section['key'], { description: string; phase: number }> = {
  inicio: { description: 'Resumo do mês, patrimônio e próximos vencimentos.', phase: 3 },
  financas: {
    description: 'O mês atual: receitas, fixas, parcelas, planejamentos e variáveis.',
    phase: 2,
  },
  carteira: { description: 'Posição por classe, ativos, cotações e alocação.', phase: 5 },
  aporte: { description: 'Simule o aporte do mês e rebalanceie a carteira.', phase: 6 },
  balanco: { description: 'Balanços mensais e rentabilidade real.', phase: 7 },
  config: { description: 'Perfil, tema, contas, cartões e metas.', phase: 1 },
}

export function screensOf(section: Section['key']): Screen[] {
  return screens.filter((screen) => screen.section === section)
}
