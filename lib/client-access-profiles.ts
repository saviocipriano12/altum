import type { TenantCapability } from "@/lib/server/tenant";

export type ClientAccessProfileId = "admin" | "manager" | "seller" | "support" | "analyst";

export type ClientAccessProfile = {
  id: ClientAccessProfileId;
  label: string;
  description: string;
  role: "client_admin" | "client_agent" | "client_viewer";
  capabilities: TenantCapability[];
};

export const CLIENT_ACCESS_PROFILES: ClientAccessProfile[] = [
  {
    id: "admin",
    label: "Administrador da empresa",
    description: "Configura a conta, canais, equipe, IA e toda a operação comercial.",
    role: "client_admin",
    capabilities: [
      "view_metrics", "view_team_records", "respond_inbox", "edit_leads", "manage_pipeline",
      "manage_commercial", "manage_ai", "manage_automations", "manage_channels", "manage_users", "manage_settings",
    ],
  },
  {
    id: "manager",
    label: "Gestor comercial",
    description: "Acompanha toda a equipe, distribui trabalho e gerencia vendas e resultados.",
    role: "client_agent",
    capabilities: [
      "view_metrics", "view_team_records", "respond_inbox", "edit_leads", "manage_pipeline", "manage_commercial",
    ],
  },
  {
    id: "seller",
    label: "Vendedor",
    description: "Atende e gerencia somente as conversas, clientes e oportunidades atribuídos a ele.",
    role: "client_agent",
    capabilities: ["view_metrics", "respond_inbox", "edit_leads", "manage_pipeline", "manage_commercial"],
  },
  {
    id: "support",
    label: "Atendimento",
    description: "Responde conversas atribuídas, atualiza clientes e registra a próxima ação.",
    role: "client_agent",
    capabilities: ["respond_inbox", "edit_leads"],
  },
  {
    id: "analyst",
    label: "Consulta e relatórios",
    description: "Consulta indicadores e resultados sem alterar a operação.",
    role: "client_viewer",
    capabilities: ["view_metrics"],
  },
];

export function getClientAccessProfile(value: unknown) {
  return CLIENT_ACCESS_PROFILES.find((profile) => profile.id === value) || CLIENT_ACCESS_PROFILES[4];
}

export function inferClientAccessProfile(input: { role?: string; capabilities?: string[]; accessProfile?: string }) {
  const explicit = CLIENT_ACCESS_PROFILES.find((profile) => profile.id === input.accessProfile);
  if (explicit) return explicit;
  if (input.role === "client_owner" || input.role === "client_admin") return CLIENT_ACCESS_PROFILES[0];
  const capabilities = new Set(input.capabilities || []);
  if (capabilities.has("view_team_records")) return CLIENT_ACCESS_PROFILES[1];
  if (capabilities.has("manage_commercial") || capabilities.has("manage_pipeline")) return CLIENT_ACCESS_PROFILES[2];
  if (capabilities.has("respond_inbox") || capabilities.has("edit_leads")) return CLIENT_ACCESS_PROFILES[3];
  return CLIENT_ACCESS_PROFILES[4];
}
