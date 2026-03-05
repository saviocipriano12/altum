export default function ClienteConfiguracoesPage() {
  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-white/10 bg-[#101010] p-6">
        <h2 className="text-lg font-semibold">Configuracoes do Tenant</h2>
        <p className="text-sm text-white/60 mt-2">
          Central de ajustes de canais, horarios, regras operacionais e parametros do painel do cliente.
        </p>
      </div>

      <a
        href="/cliente/painel/configuracoes/canais"
        className="block rounded-2xl border border-blue-500/30 bg-blue-500/10 p-5 hover:bg-blue-500/15 transition"
      >
        <h3 className="text-base font-semibold text-blue-100">Canais WhatsApp</h3>
        <p className="text-sm text-blue-100/80 mt-1">
          Cadastre phoneNumberId, accessToken, verifyToken e appSecret para o tenant.
        </p>
      </a>
    </div>
  );
}
