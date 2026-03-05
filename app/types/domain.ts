export type TimestampLike = {
  toDate?: () => Date;
};

export type LeadStatus =
  | "novo"
  | "contatado"
  | "respondido"
  | "qualificado"
  | "descartado";

export type LeadPriority = "low" | "medium" | "high";

export type LeadStageKey =
  | "INVISIVEL"
  | "PRESENTE_FRACO"
  | "SITE_RUIM"
  | "SITE_OK"
  | "TRAFEGO_ZERO"
  | "TRAFEGO_FRACO"
  | "TRAFEGO_OK"
  | "OPERACAO_ATIVA";

export interface LeadOffer {
  id: string;
  title: string;
  priceFrom: number;
  priceTo: number;
  pitch?: string;
  deliverables?: string[];
}

export interface AgencyLead {
  id: string;
  nome?: string;
  telefone?: string;
  email?: string;
  endereco?: string;
  origem?: string;
  sourceId?: string;
  sourceType?: string;
  placeId?: string;
  categoria?: string;
  website?: string;
  cnpj?: string;
  instagram?: string;
  linkedin?: string;
  stage?: LeadStageKey | string;
  stageTags?: string[];
  owner?: string;
  ownerId?: string;
  priority?: LeadPriority;
  score?: number;
  heat?: "quente" | "morno" | "frio" | string;
  reasons?: string[];
  foiResgatado?: boolean;
  rating?: number;
  userRatingsTotal?: number;
  lat?: number;
  lng?: number;
  priceLevel?: number;
  isOpenNow?: boolean;
  photos?: string[];
  notes?: string;
  nextStep?: string;
  status?: LeadStatus;
  pipelineStage?: string;
  kanbanIndex?: number;
  intelligence?: {
    status?: "pending" | "processing" | "ready" | "failed" | "disabled" | string;
    summary?: string;
    confidence?: number;
    legalName?: string;
    tradeName?: string;
    ownerName?: string;
    cnpjDetected?: string;
    segment?: string;
    city?: string;
    state?: string;
    website?: string;
    websiteTitle?: string;
    websiteDescription?: string;
    socialLinks?: string[];
    adSignals?: string[];
    adMaturity?: "none" | "basic" | "active" | string;
    sources?: string[];
    error?: string;
    updatedAt?: TimestampLike | number | null;
  };
  proposalDraft?: {
    headline?: string;
    whyNow?: string;
    firstContactMessage?: string;
    emailSubject?: string;
    suggestedServices?: string[];
    nextSteps?: string[];
    confidence?: number;
    model?: string;
    generatedAt?: TimestampLike | number | null;
  };
  offer?: LeadOffer;
  lastContactAt?: TimestampLike | number | null;
  updatedAt?: TimestampLike | number | null;
  createdAt?: TimestampLike | number | null;
}

export interface TeamMemberDoc {
  name?: string;
  role?: "admin" | "closer" | "sdr" | string;
  status?: "active" | "blocked" | string;
  commissionRate?: number;
  asaasWalletId?: string | null;
}

export type ClientStatus = "Ativo" | "Em implantação" | "Prospecção";

export interface AgencyClient {
  id: string;
  name: string;
  niche?: string;
  city?: string;
  status?: ClientStatus;
  contactName?: string;
  email?: string;
  phone?: string;
  site?: string;
  services?: string[];
  createdAt?: TimestampLike | number | null;
  updatedAt?: TimestampLike | number | null;
}

export type ProjectStatus = "Onboarding" | "Ativo" | "Pausado" | "Encerrado";

export interface AgencyProject {
  id: string;
  titulo: string;
  status: ProjectStatus;
  clientId: string;
  clientName: string;
  canalPrincipal?: string;
  servicos?: string[];
  valorMensal?: number;
  createdAt?: TimestampLike | number | null;
  updatedAt?: TimestampLike | number | null;
}

export type BudgetStatus = "rascunho" | "enviado" | "aprovado" | "recusado";

export interface AgencyBudget {
  id: string;
  title: string;
  clientId?: string;
  clientName?: string;
  status?: BudgetStatus;
  valorTotal?: number;
  validade?: string;
  resumo?: string;
  createdAt?: TimestampLike | number | null;
  updatedAt?: TimestampLike | number | null;
}

export type ActivityStatus = "pendente" | "concluida";

export interface AgencyActivity {
  id: string;
  descricao: string;
  data?: string | null;
  status: ActivityStatus;
  tipo?: string | null;
  leadId?: string | null;
  clienteNome?: string | null;
  createdAt?: TimestampLike | number | null;
}

export type FinanceStatus = "pago" | "pendente" | "atrasado" | "cancelado";
export type FinanceType = "Receita" | "Despesa";
export type FinanceCategory =
  | "Mensalidade"
  | "Projeto"
  | "Setup"
  | "Infra/API"
  | "Imposto"
  | "Marketing"
  | "Outros";
export type PayoutStatus = "pendente" | "liquidado";

export interface FinanceTransaction {
  id: string;
  descricao: string;
  valor: number;
  valorComissao?: number;
  vendedorId?: string;
  vendedorNome?: string;
  status: FinanceStatus;
  payoutStatus?: PayoutStatus;
  tipo: FinanceType;
  categoria: FinanceCategory;
  referencia?: string;
  vencimento?: string;
  createdAt?: TimestampLike | number | null;
}

export type AdPlatform = "meta_ads" | "google_ads" | "tiktok_ads" | "linkedin_ads";
export type AdAccountStatus = "draft" | "active" | "paused" | "error";

export interface AdAccountDoc {
  id: string;
  clientId: string;
  clientName: string;
  ownerId?: string;
  ownerName?: string;
  platform: AdPlatform;
  accountLabel: string;
  externalAccountId?: string;
  currency?: string;
  timezone?: string;
  status: AdAccountStatus;
  syncMode?: "api" | "manual" | "hybrid";
  credentialsRef?: string;
  lastSyncAt?: TimestampLike | number | null;
  createdAt?: TimestampLike | number | null;
  updatedAt?: TimestampLike | number | null;
}

export interface CampaignSnapshotDoc {
  id: string;
  adAccountId: string;
  clientId: string;
  dateRef: string;
  impressions: number;
  clicks: number;
  spend: number;
  leads: number;
  ctr: number;
  cpc: number;
  cpl: number;
  roas?: number;
  source?: "api" | "manual" | "import";
  createdAt?: TimestampLike | number | null;
  updatedAt?: TimestampLike | number | null;
}
