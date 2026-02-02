// CAMINHO: lib/war-room.ts

// 1. Definição dos Tipos (Acaba com os erros de TS)
export interface DiagnosisData {
  hasGMB: boolean;
  gmbRatingGood: boolean;
  hasWebsite: boolean;
  websiteIsGood: boolean;
  hasAds: boolean;
  instagramActive: boolean;
  companySize: "pequeno" | "medio" | "grande";
  crmMaturity: "nenhum" | "planilha" | "software";
  salesTeamSize: number;
  score: number;
}

export interface FinancialScenario {
  ticketMedio: number;
  leadsGoal: number;
  conversionRate: number;
  investmentAds: number;
}

export interface ProposalItem {
  id: string;
  name: string;
  price: number;
  type: "setup" | "mensal";
  selected: boolean;
  category?: string;
  description?: string;
}

// O TIPO LEAD COMPLETO
export interface Lead {
  id: string;
  nome: string;
  // Campos obrigatórios que estavam faltando:
  telefone?: string;
  email?: string;
  endereco?: string;
  origem?: string;
  status: "novo" | "contatado" | "qualificado" | "negociacao" | "fechado" | "descartado";
  notes?: string;
  
  // Campos de Enriquecimento:
  instagram?: string;
  website?: string;
  ownerName?: string;
  niche?: string;
  projectedValue?: number;
  competitors?: string[];

  // Campos Avançados (War Room):
  diagnosis?: DiagnosisData;
  roiProjection?: FinancialScenario;
  activeProposal?: ProposalItem[];
  
  // Oferta (Legado/Compatibilidade):
  offer?: {
    id: string;
    title: string;
    priceFrom: number;
    priceTo: number;
    pitch: string;
    deliverables: string[];
    strategyType: "cash_flow" | "high_ticket";
  };

  createdAt?: any;
  updatedAt?: any;
}

export interface LeadEvent {
  id: string;
  type: "note" | "call" | "whatsapp" | "system" | "roi_calc" | "proposal";
  title: string;
  detail?: string;
  createdAt?: any;
}

// 2. Constantes e Dados
export const SERVICE_CATALOG: ProposalItem[] = [
  { id: "gmb_opt", name: "Otimização GMB", price: 800, type: "setup", selected: false, description: "SEO Local" },
  { id: "lp_dev", name: "Landing Page", price: 1500, type: "setup", selected: false, description: "Alta Conversão" },
  { id: "traffic", name: "Gestão Tráfego", price: 1500, type: "mensal", selected: false, description: "Ads Google/Meta" },
  { id: "social", name: "Social Media", price: 1200, type: "mensal", selected: false, description: "12 posts/mês" },
];

// 3. Funções Matemáticas
export function calculateROI(data: FinancialScenario) {
  const revenue = data.leadsGoal * (data.conversionRate / 100) * data.ticketMedio;
  const profit = revenue - data.investmentAds;
  const roas = data.investmentAds > 0 ? (revenue / data.investmentAds).toFixed(1) : "0";
  return { revenue, profit, roas, projectedSales: Math.floor(data.leadsGoal * (data.conversionRate / 100)) };
}