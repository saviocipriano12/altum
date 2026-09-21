export type ClientRouteAccessRule = {
  capability: string;
  title: string;
  description: string;
};

const CLIENT_ROUTE_ACCESS_RULES: Array<{ prefix: string; rule: ClientRouteAccessRule }> = [
  { prefix: "/cliente/painel/configuracoes/meu-whatsapp", rule: { capability: "manage_personal_channel", title: "Meu WhatsApp restrito", description: "Este espaço permite conectar somente o seu número pessoal." } },
  { prefix: "/cliente/painel/configuracoes/usuarios", rule: { capability: "manage_users", title: "Gestão de acessos restrita", description: "Somente administradores da empresa podem convidar pessoas e alterar permissões." } },
  { prefix: "/cliente/painel/configuracoes/times", rule: { capability: "manage_users", title: "Gestão de equipes restrita", description: "Somente administradores da empresa podem criar times e definir seus membros." } },
  { prefix: "/cliente/painel/configuracoes/canais", rule: { capability: "manage_channels", title: "Gestão de canais restrita", description: "Seu perfil não pode conectar ou alterar os canais da empresa." } },
  { prefix: "/cliente/painel/configuracoes/integracoes", rule: { capability: "manage_channels", title: "Gestão de integrações restrita", description: "Seu perfil não pode conectar ou alterar integrações da empresa." } },
  { prefix: "/cliente/painel/configuracoes/mcp", rule: { capability: "manage_settings", title: "Configuração avançada restrita", description: "Somente administradores podem configurar o acesso MCP da empresa." } },
  { prefix: "/cliente/painel/configuracoes/empresa", rule: { capability: "manage_settings", title: "Configuração da empresa restrita", description: "Somente administradores podem alterar os dados gerais da empresa." } },
  { prefix: "/cliente/painel/configuracoes/operacao", rule: { capability: "manage_settings", title: "Configuração operacional restrita", description: "Somente administradores podem alterar regras gerais da operação." } },
  { prefix: "/cliente/painel/ia", rule: { capability: "manage_ai", title: "Assistente Altum restrito", description: "Seu perfil pode usar a operação liberada, mas não alterar o comportamento da IA." } },
  { prefix: "/cliente/painel/handoffs", rule: { capability: "manage_ai", title: "Escaladas da IA restritas", description: "Seu perfil não pode alterar regras de escalada para atendimento humano." } },
  { prefix: "/cliente/painel/automacoes", rule: { capability: "manage_automations", title: "Automações restritas", description: "Seu perfil não pode criar ou alterar automações da empresa." } },
  { prefix: "/cliente/painel/logs", rule: { capability: "manage_settings", title: "Área técnica restrita", description: "Logs operacionais ficam disponíveis apenas para administradores e suporte técnico." } },
  { prefix: "/cliente/painel/go-live", rule: { capability: "manage_settings", title: "Implantação restrita", description: "Somente administradores podem alterar a implantação da empresa." } },
];

export function getClientRouteAccessRule(pathname: string) {
  return CLIENT_ROUTE_ACCESS_RULES.find(({ prefix }) => pathname === prefix || pathname.startsWith(`${prefix}/`))?.rule || null;
}
