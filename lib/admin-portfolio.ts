import { mergeAdminCompanies, type CompanyRecord } from "@/lib/admin-companies";
export type PortfolioInput = { clients: CompanyRecord[]; tenants: CompanyRecord[]; contracts: CompanyRecord[]; channels: CompanyRecord[]; projects: CompanyRecord[]; finance: CompanyRecord[]; alerts: CompanyRecord[]; usage: CompanyRecord[] };
const text = (value: unknown) => typeof value === "string" ? value.trim().slice(0, 200) : "";
const numeric = (value: unknown) => typeof value === "number" && Number.isFinite(value) ? value : 0;
const millis = (value: unknown) => value && typeof value === "object" && "toMillis" in value && typeof value.toMillis === "function" ? value.toMillis() : Date.parse(String(value || ""));
export function buildAdminPortfolio(input: PortfolioInput, now = new Date(), available = new Set(Object.keys(input))) {
  const companies = mergeAdminCompanies(input.clients, input.tenants);
  return companies.map(company => {
    const belongs = (row: CompanyRecord) => row.clientId === company.id || (company.tenantId && row.tenantId === company.tenantId);
    const contracts = input.contracts.filter(row => belongs(row) || row.id === company.id || row.id === company.tenantId);
    const channels = company.tenantId ? input.channels.filter(row => row.tenantId === company.tenantId) : [];
    const finance = input.finance.filter(belongs), projects = input.projects.filter(belongs);
    const alerts = company.tenantId ? input.alerts.filter(row => row.tenantId === company.tenantId && row.status !== "resolved") : [];
    const issues: Array<{ code: string; label: string; severity: number; href: string }> = [];
    const issue = (code: string, label: string, severity: number, href: string) => issues.push({ code, label, severity, href });
    const ficha = `/admin/clientes/${encodeURIComponent(company.id)}`;
    if (company.ambiguous) issue("ambiguous_company", "Mais de um workspace vinculado: revisar identidade", 3, ficha);
    else if (!company.tenantId && available.has("tenants")) issue("no_workspace", "Cadastro comercial sem workspace de operação", 1, ficha);
    if (contracts.some(row => row.platformAccessStatus === "blocked" || row.billingStatus === "blocked")) issue("blocked_contract", "Contrato com acesso bloqueado", 3, ficha);
    if (channels.some(row => ["error", "disconnected", "expired", "blocked"].includes(text(row.connectionStatus)) || row.status === "blocked")) issue("connection_problem", "Canal exige reconexão ou revisão", 3, ficha);
    if (channels.some(row => ["meta_ads", "google_ads"].includes(text(row.type)) && (!row.externalAccountId || !(row.type === "google_ads" ? row.refreshToken : row.accessToken)))) issue("ads_incomplete", "Conta de anúncios com configuração incompleta", 2, "/admin/midia");
    const ads = channels.filter(row => ["meta_ads", "google_ads"].includes(text(row.type)));
    if (ads.some(row => !Number.isFinite(millis(row.lastSyncAt)) || now.getTime() - millis(row.lastSyncAt) > 86400000)) issue("ads_stale", "Atualizar dados das contas de anúncios", 1, "/admin/midia");
    const overdue = finance.filter(row => row.tipo === "Receita" && !["pago", "cancelado"].includes(text(row.status).toLowerCase()) && /^\d{4}-\d{2}-\d{2}$/.test(text(row.vencimento)) && text(row.vencimento) < now.toISOString().slice(0, 10));
    if (overdue.length) issue("overdue_finance", `${overdue.length} lançamentos financeiros vencidos`, 2, "/admin/financeiro");
    if (alerts.length) issue("ai_alerts", `${alerts.length} alertas operacionais da IA em aberto`, alerts.some(row => row.severity === "high") ? 3 : 2, "/admin/ia");
    if (projects.some(row => row.status === "Onboarding")) issue("onboarding", "Projeto em implantação: acompanhar entrega", 1, "/admin/projetos");
    const monthlyUsage = input.usage.filter(row => row.tenantId === company.tenantId && row.monthRef === now.toISOString().slice(0, 7));
    return { id: company.id, name: company.name, tenantId: company.tenantId, status: company.status,
      issues: issues.sort((a, b) => b.severity - a.severity), priority: Math.max(0, ...issues.map(row => row.severity)),
      channelCount: channels.length, projectCount: projects.length, overdueCount: overdue.length,
      estimatedAiCostUsd: available.has("usage") && company.tenantId ? monthlyUsage.reduce((sum, row) => sum + numeric(row.estimatedCostUsd), 0) : null, href: ficha };
  }).sort((a, b) => b.priority - a.priority || a.name.localeCompare(b.name, "pt-BR"));
}
