import Link from "next/link";
import {
  ArrowUpRight,
  CalendarDays,
  ChevronDown,
  ChevronRight,
  Inbox,
  LayoutDashboard,
  ListChecks,
  Search,
  Settings2,
  Sparkles,
  UsersRound,
} from "lucide-react";

const NAV_MAIN = [
  { label: "Visao geral", icon: LayoutDashboard, active: true },
  { label: "Inbox", icon: Inbox },
  { label: "CRM", icon: UsersRound },
  { label: "Follow-ups", icon: ListChecks },
  { label: "Agenda", icon: CalendarDays },
  { label: "Pipeline", icon: ArrowUpRight },
];

const NAV_FEATURES = [
  { label: "Automacoes IA", icon: Sparkles },
  { label: "Campanhas", icon: ArrowUpRight },
];

const NAV_TOOLS = [
  { label: "Configuracoes", icon: Settings2 },
  { label: "Central de suporte", icon: Inbox },
];

const KPI = [
  { label: "Leads ativos", value: "47", growth: "+6 semana" },
  { label: "Conversas abertas", value: "18", growth: "4 sem owner" },
  { label: "Receita prevista", value: "R$ 142 mil", growth: "+14%" },
];

const TABLE = [
  { id: "LD-12345", user: "Savio Cipriano", amount: "R$ 7.800", date: "Enviar proposta curta", status: "Qualificado" },
  { id: "LD-98765", user: "Studio Prime", amount: "R$ 21.800", date: "Ligar decisor as 16h", status: "Sem owner" },
  { id: "LD-56789", user: "Lucilene Campos", amount: "R$ 18.200", date: "Confirmar condicoes finais", status: "Proposta enviada" },
];

export default function PreviewA() {
  return (
    <main className="min-h-screen bg-[#090B10] px-3 py-3 text-slate-100">
      <div className="mx-auto grid max-w-[1600px] gap-3 xl:grid-cols-[230px_minmax(0,1fr)_320px]">
        <aside className="flex min-h-[92vh] flex-col rounded-3xl border border-slate-800 bg-[#0C1017] p-4">
          <div className="mb-5 flex items-center justify-between">
            <div className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-slate-900 ring-1 ring-slate-700">
              <Sparkles className="h-4 w-4 text-slate-300" />
            </div>
            <button className="rounded-lg border border-slate-700 px-2 py-1 text-[11px] text-slate-400">ALTUM</button>
          </div>

          <p className="mb-2 text-[10px] uppercase tracking-[0.18em] text-slate-500">Operacao</p>
          <nav className="space-y-1.5">
            {NAV_MAIN.map((item) => (
              <button
                key={item.label}
                className={item.active ? "inline-flex w-full items-center gap-2 rounded-xl border border-orange-300/25 bg-orange-500/15 px-3 py-2 text-left text-sm text-orange-100" : "inline-flex w-full items-center gap-2 rounded-xl border border-transparent px-3 py-2 text-left text-sm text-slate-400 hover:border-slate-700 hover:bg-slate-900"}
              >
                <item.icon className="h-4 w-4" />
                {item.label}
              </button>
            ))}
          </nav>

          <p className="mb-2 mt-5 text-[10px] uppercase tracking-[0.18em] text-slate-500">Crescimento</p>
          <nav className="space-y-1.5">
            {NAV_FEATURES.map((item) => (
              <button key={item.label} className="inline-flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm text-slate-400 hover:bg-slate-900">
                <item.icon className="h-4 w-4" />
                {item.label}
              </button>
            ))}
          </nav>

          <p className="mb-2 mt-5 text-[10px] uppercase tracking-[0.18em] text-slate-500">Sistema</p>
          <nav className="space-y-1.5">
            {NAV_TOOLS.map((item) => (
              <button key={item.label} className="inline-flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm text-slate-400 hover:bg-slate-900">
                <item.icon className="h-4 w-4" />
                {item.label}
              </button>
            ))}
          </nav>

          <div className="mt-auto rounded-2xl border border-orange-300/25 bg-gradient-to-b from-orange-500/20 to-orange-500/5 p-3">
            <p className="text-sm font-medium text-orange-100">Modo avancado</p>
            <p className="mt-1 text-xs text-slate-300">Ative camada executiva para lideranca e metas do time.</p>
            <div className="mt-3 flex gap-2 text-[11px]">
              <button className="rounded-lg bg-orange-500 px-2.5 py-1.5 font-medium text-black">Ativar</button>
              <button className="rounded-lg border border-slate-700 px-2.5 py-1.5 text-slate-300">Ver plano</button>
            </div>
          </div>
        </aside>

        <section className="space-y-3">
          <header className="rounded-3xl border border-slate-800 bg-[#0C1017] p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="text-xs uppercase tracking-[0.16em] text-slate-500">Painel Altum</p>
                <h1 className="text-lg font-semibold">Operacao comercial</h1>
              </div>
              <div className="flex items-center gap-2">
                <button className="rounded-xl border border-slate-700 bg-slate-900 px-3 py-1.5 text-xs text-slate-300">Gerenciar operacao</button>
                <button className="rounded-xl border border-slate-700 bg-slate-900 px-3 py-1.5 text-xs text-slate-300">Exportar</button>
                <button className="rounded-xl bg-orange-500 px-3 py-1.5 text-xs font-medium text-black">+ Novo convite</button>
              </div>
            </div>
          </header>

          <section className="grid gap-3 lg:grid-cols-3">
            {KPI.map((item) => (
              <article key={item.label} className="rounded-2xl border border-slate-800 bg-[#0C1017] p-3">
                <p className="text-xs text-slate-500">{item.label}</p>
                <div className="mt-1 flex items-center justify-between">
                  <p className="text-2xl font-semibold">{item.value}</p>
                  <span className="rounded-full border border-slate-700 bg-slate-900 px-2 py-1 text-[11px] text-slate-300">{item.growth}</span>
                </div>
              </article>
            ))}
          </section>

          <section className="rounded-3xl border border-slate-800 bg-[#0C1017] p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="text-xs text-slate-500">Ritmo comercial</p>
                <p className="text-2xl font-semibold">R$ 621 mil em pipeline</p>
              </div>
              <button className="inline-flex items-center gap-1 rounded-xl border border-slate-700 bg-slate-900 px-3 py-1.5 text-xs text-slate-300">
                Semanal
                <ChevronDown className="h-3.5 w-3.5" />
              </button>
            </div>

            <div className="mt-3 flex gap-2 text-xs">
              <button className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-1.5 text-slate-300">Inbox</button>
              <button className="rounded-lg border border-slate-800 px-3 py-1.5 text-slate-500">CRM</button>
              <button className="rounded-lg border border-slate-800 px-3 py-1.5 text-slate-500">Pipeline</button>
            </div>

            <div className="mt-4 grid h-44 grid-cols-11 items-end gap-2">
              {[28, 34, 30, 48, 40, 32, 43, 35, 58, 72, 50].map((height, index) => (
                <div key={`${height}-${index}`} className={index === 9 ? "rounded-t-md bg-gradient-to-t from-orange-500 to-orange-300" : "rounded-t-md bg-slate-700/60"} style={{ height: `${height}%` }} />
              ))}
            </div>
          </section>

          <section className="rounded-3xl border border-slate-800 bg-[#0C1017] p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <label className="flex min-w-[220px] items-center gap-2 rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-400">
                <Search className="h-4 w-4" />
                <input className="w-full bg-transparent outline-none" placeholder="Buscar lead, conversa ou proposta..." />
              </label>
              <div className="flex gap-2 text-xs text-slate-400">
                <button className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-1.5">Exportar</button>
                <button className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-1.5">Atualizar</button>
              </div>
            </div>

            <div className="mt-3 overflow-hidden rounded-2xl border border-slate-800">
              <table className="w-full text-left text-sm">
                <thead className="bg-slate-900 text-slate-500">
                  <tr>
                    <th className="px-3 py-2 font-medium">Lead ID</th>
                    <th className="px-3 py-2 font-medium">Lead</th>
                    <th className="px-3 py-2 font-medium">Potencial</th>
                    <th className="px-3 py-2 font-medium">Proximo passo</th>
                    <th className="px-3 py-2 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {TABLE.map((row) => (
                    <tr key={row.id} className="border-t border-slate-800 text-slate-300">
                      <td className="px-3 py-2.5">{row.id}</td>
                      <td className="px-3 py-2.5">{row.user}</td>
                      <td className="px-3 py-2.5">{row.amount}</td>
                      <td className="px-3 py-2.5 text-slate-400">{row.date}</td>
                      <td className="px-3 py-2.5">
                        <span className={row.status === "Sem owner" ? "rounded-full border border-red-300/30 bg-red-500/10 px-2 py-1 text-xs text-red-200" : "rounded-full border border-emerald-300/30 bg-emerald-500/10 px-2 py-1 text-xs text-emerald-200"}>
                          {row.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </section>

        <aside className="space-y-3">
          <section className="rounded-3xl border border-slate-800 bg-[#0C1017] p-3">
            <div className="flex items-center justify-between">
              <label className="flex flex-1 items-center gap-2 rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-400">
                <Search className="h-4 w-4" />
                <input className="w-full bg-transparent outline-none" placeholder="Buscar no workspace..." />
              </label>
            </div>

            <div className="mt-3 flex gap-2 text-xs">
              <button className="rounded-lg bg-slate-100 px-3 py-1.5 text-black">Inbox</button>
              <button className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-1.5 text-slate-300">CRM</button>
              <button className="rounded-lg bg-orange-500 px-3 py-1.5 font-medium text-black">+ Nova acao</button>
            </div>

            <article className="mt-3 rounded-2xl border border-slate-700 bg-gradient-to-br from-slate-900 via-slate-800 to-slate-950 p-4">
              <p className="text-[11px] text-slate-400">Operacao em foco</p>
              <p className="mt-5 text-sm text-slate-400">Lead prioritario</p>
              <p className="text-base font-semibold">Savio Cipriano / WhatsApp</p>
              <div className="mt-4 flex items-center justify-between text-xs text-slate-400">
                <span>Owner: Maria</span>
                <span className="font-semibold tracking-[0.2em]">HOT</span>
              </div>
            </article>

            <div className="mt-3">
              <p className="text-xs uppercase tracking-[0.16em] text-slate-500">Quick Action</p>
              <div className="mt-2 grid grid-cols-4 gap-2 text-xs">
                {['Assumir', 'Responder', 'Follow-up', 'Mover etapa'].map((item) => (
                  <button key={item} className="rounded-lg border border-slate-700 bg-slate-900 px-2 py-1.5 text-slate-300">{item}</button>
                ))}
              </div>
            </div>
          </section>

          <section className="rounded-3xl border border-slate-800 bg-[#0C1017] p-3">
            <p className="text-xs uppercase tracking-[0.16em] text-slate-500">SLA de atendimento</p>
            <p className="mt-1 text-xl font-semibold">11 min <span className="text-sm font-normal text-slate-400">media / meta 15 min</span></p>
            <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-800">
              <div className="h-full w-3/5 bg-orange-400" />
            </div>
            <div className="mt-3 space-y-1.5 text-xs text-slate-400">
              <p>Sem owner (4)</p>
              <p>Atrasados (3)</p>
              <p>Qualificados (12)</p>
              <p>Resolvidos hoje (26)</p>
            </div>
          </section>

          <section className="rounded-3xl border border-slate-800 bg-[#0C1017] p-3">
            <p className="text-xs uppercase tracking-[0.16em] text-slate-500">Proximas tarefas</p>
            <div className="mt-3 rounded-xl border border-slate-700 bg-slate-900 p-3">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <p className="text-sm font-medium">Retornar proposta de alto ticket</p>
                  <p className="text-xs text-slate-400">Hoje, 16:00</p>
                </div>
                <ChevronRight className="h-4 w-4 text-slate-400" />
              </div>
              <div className="mt-3 flex items-center justify-between text-xs">
                <p>Owner: Carlos</p>
                <span className="rounded-full border border-slate-700 px-2 py-1 text-slate-400">Pendente</span>
              </div>
            </div>
            <button className="mt-3 w-full rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-xs text-slate-300">Ver todas</button>
          </section>

          <div className="flex items-center justify-between text-xs text-slate-500">
            <Link href="/preview/modelos" className="rounded-lg border border-slate-700 px-2 py-1 hover:text-cyan-300">Modelos</Link>
            <Link href="/preview/b" className="rounded-lg border border-slate-700 px-2 py-1 hover:text-cyan-300">Ver B</Link>
          </div>
        </aside>
      </div>
    </main>
  );
}
