import Link from "next/link";
import {
  Bell,
  CalendarDays,
  ChevronDown,
  Filter,
  Search,
  Settings2,
  Wallet,
} from "lucide-react";

const TABS = ["Visao geral", "Inbox", "CRM", "Pipeline", "Agenda", "Relatorios"];

const STAT_CARDS = [
  { title: "Leads qualificados", value: "950", growth: "+7%", tone: "accent" },
  { title: "Follow-ups hoje", value: "700", growth: "-5%", tone: "neutral" },
  { title: "Conversas abertas", value: "1,050", growth: "+1%", tone: "neutral" },
  { title: "Propostas abertas", value: "850", growth: "+4%", tone: "neutral" },
];

const ACTIVITIES = [
  { id: "OP_000076", activity: "Proposta enviada para Savio", price: "Impacto alto", status: "Concluido", date: "17 Apr, 2026 03:45 PM" },
  { id: "OP_000075", activity: "Follow-up executado no CRM", price: "Impacto medio", status: "Pendente", date: "15 Apr, 2026 11:30 AM" },
  { id: "OP_000074", activity: "Lead movido para proposta", price: "Impacto alto", status: "Concluido", date: "15 Apr, 2026 12:00 PM" },
  { id: "OP_000073", activity: "Convite de usuario reenviado", price: "Impacto baixo", status: "Em progresso", date: "10 Apr, 2026 06:00 AM" },
];

export default function PreviewB() {
  return (
    <main className="min-h-screen bg-[#F1F3F7] px-3 py-5 text-slate-900">
      <div className="mx-auto max-w-[1600px] rounded-[30px] border border-slate-200 bg-[#F7F8FA] p-4 shadow-[0_20px_60px_rgba(15,23,42,0.08)]">
        <div className="grid gap-4 lg:grid-cols-[56px_minmax(0,1fr)]">
          <aside className="rounded-2xl border border-slate-200 bg-white p-2">
            <div className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-orange-500/15 text-orange-600">
              <Wallet className="h-4 w-4" />
            </div>
            <div className="mt-4 space-y-2">
              {[Wallet, Settings2, Bell, CalendarDays, Filter].map((Icon, index) => (
                <button key={index} className={index === 0 ? "inline-flex h-9 w-9 items-center justify-center rounded-xl bg-slate-900 text-white" : "inline-flex h-9 w-9 items-center justify-center rounded-xl text-slate-500 hover:bg-slate-100"}>
                  <Icon className="h-4 w-4" />
                </button>
              ))}
            </div>
          </aside>

          <section className="space-y-4">
            <header className="rounded-2xl border border-slate-200 bg-white px-4 py-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="inline-flex flex-wrap items-center gap-1 rounded-xl bg-slate-100 p-1 text-xs text-slate-600">
                  {TABS.map((tab, index) => (
                    <button key={tab} className={index === 0 ? "rounded-lg bg-slate-900 px-3 py-1.5 text-white" : "rounded-lg px-3 py-1.5"}>
                      {tab}
                    </button>
                  ))}
                </div>

                <div className="flex items-center gap-2">
                  <button className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-slate-200 text-slate-500">
                    <Search className="h-4 w-4" />
                  </button>
                  <button className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-slate-200 text-slate-500">
                    <Bell className="h-4 w-4" />
                  </button>
                  <button className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-slate-200 text-slate-500">
                    <Settings2 className="h-4 w-4" />
                  </button>
                  <div className="ml-1 flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-2 py-1.5">
                    <div className="h-7 w-7 rounded-full bg-slate-300" />
                    <div>
                      <p className="text-xs font-medium">Savio Cipriano</p>
                      <p className="text-[11px] text-slate-500">admin@altumia.com.br</p>
                    </div>
                    <ChevronDown className="h-3.5 w-3.5 text-slate-500" />
                  </div>
                </div>
              </div>
            </header>

            <section>
              <h1 className="text-[40px] font-semibold leading-tight">Bom dia, Savio</h1>
              <p className="text-sm text-slate-500">Acompanhe metas, tarefas e status da operacao em tempo real.</p>
            </section>

            <section className="grid gap-4 xl:grid-cols-[1.1fr_0.9fr_0.9fr]">
              <article className="space-y-4 rounded-2xl border border-slate-200 bg-white p-4">
                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  <div className="flex items-center justify-between">
                    <p className="text-xs text-slate-500">Resumo operacional</p>
                    <button className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2 py-1 text-[11px] text-slate-600">Tenant 01 <ChevronDown className="h-3 w-3" /></button>
                  </div>
                  <p className="mt-2 text-3xl font-semibold">47 leads ativos</p>
                  <p className="text-xs text-emerald-600">+15% em relacao ao ultimo mes</p>
                  <div className="mt-3 grid grid-cols-2 gap-2">
                    <button className="rounded-xl bg-slate-900 px-3 py-2 text-sm text-white">Abrir Inbox</button>
                    <button className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700">Abrir CRM</button>
                  </div>
                </div>

                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
                  <p className="text-xs text-slate-500">Canais | Total 3 ativos</p>
                  <div className="mt-2 grid grid-cols-3 gap-2 text-xs">
                    <div className="rounded-xl border border-slate-200 bg-white p-2">
                      <p className="text-slate-500">WhatsApp</p>
                      <p className="mt-1 font-semibold">22 abertos</p>
                    </div>
                    <div className="rounded-xl border border-slate-200 bg-white p-2">
                      <p className="text-slate-500">Instagram</p>
                      <p className="mt-1 font-semibold">11 abertos</p>
                    </div>
                    <div className="rounded-xl border border-slate-200 bg-white p-2">
                      <p className="text-slate-500">Email</p>
                      <p className="mt-1 font-semibold">8 abertos</p>
                    </div>
                  </div>
                </div>
              </article>

              <article className="space-y-4 rounded-2xl border border-slate-200 bg-white p-4">
                <div className="grid gap-2 sm:grid-cols-2">
                  {STAT_CARDS.map((card) => (
                    <div key={card.title} className={card.tone === "accent" ? "rounded-2xl bg-gradient-to-br from-orange-400 to-orange-500 p-3 text-white" : "rounded-2xl border border-slate-200 bg-slate-50 p-3"}>
                      <p className={card.tone === "accent" ? "text-xs text-white/80" : "text-xs text-slate-500"}>{card.title}</p>
                      <p className="mt-1 text-3xl font-semibold">{card.value}</p>
                      <p className={card.tone === "accent" ? "text-xs text-white/80" : "text-xs text-slate-500"}>{card.growth} no mes</p>
                    </div>
                  ))}
                </div>
              </article>

              <article className="rounded-2xl border border-slate-200 bg-white p-4">
                <p className="text-xs text-slate-500">Performance mensal</p>
                <h2 className="mt-1 text-lg font-semibold">Visao consolidada de produtividade do time</h2>
                <div className="mt-4 grid h-40 grid-cols-7 items-end gap-2">
                  {[48, 62, 55, 70, 66, 78, 58].map((height, index) => (
                    <div key={`${height}-${index}`} className="grid grid-cols-2 gap-1">
                      <div className="rounded-t bg-orange-500" style={{ height: `${height}%` }} />
                      <div className="rounded-t bg-slate-900" style={{ height: `${Math.max(height - 18, 28)}%` }} />
                    </div>
                  ))}
                </div>
                <div className="mt-2 flex justify-between text-[11px] text-slate-500">
                  {['Jan','Feb','Mar','Apr','May','Jun','Jul'].map((m) => <span key={m}>{m}</span>)}
                </div>
              </article>
            </section>

            <section className="grid gap-4 xl:grid-cols-[0.75fr_1.25fr]">
              <article className="space-y-4 rounded-2xl border border-slate-200 bg-white p-4">
                <div>
                  <p className="text-xs text-slate-500">Meta de atendimento do mes</p>
                  <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-200">
                    <div className="h-full w-[62%] bg-orange-500" />
                  </div>
                  <div className="mt-1 flex justify-between text-[11px] text-slate-500">
                    <span>420 respostas concluidas</span>
                    <span>meta 680</span>
                  </div>
                </div>

                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
                  <div className="mb-2 flex items-center justify-between">
                    <p className="text-sm font-medium">Quadro rapido</p>
                    <button className="text-xs text-slate-600">+ Novo bloco</button>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div className="rounded-xl bg-slate-900 p-3 text-white">
                      <p>Inbox quente</p>
                      <p className="mt-6">4 sem owner</p>
                    </div>
                    <div className="rounded-xl bg-orange-500 p-3 text-black">
                      <p>CRM prioridade</p>
                      <p className="mt-6">2 propostas travadas</p>
                    </div>
                  </div>
                </div>
              </article>

              <article className="rounded-2xl border border-slate-200 bg-white p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="text-xs text-slate-500">Atividades recentes</p>
                    <h2 className="text-lg font-semibold">Fluxo operacional</h2>
                  </div>
                  <div className="flex gap-2">
                    <label className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs text-slate-500">
                      <Search className="h-3.5 w-3.5" />
                      <input className="w-32 bg-transparent outline-none" placeholder="Buscar" />
                    </label>
                    <button className="inline-flex items-center gap-1 rounded-xl border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs text-slate-600">
                      Filtrar
                      <ChevronDown className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>

                <div className="mt-3 overflow-hidden rounded-xl border border-slate-200">
                  <table className="w-full text-left text-sm">
                    <thead className="bg-slate-50 text-slate-500">
                      <tr>
                        <th className="px-3 py-2 font-medium">ID</th>
                        <th className="px-3 py-2 font-medium">Atividade</th>
                        <th className="px-3 py-2 font-medium">Impacto</th>
                        <th className="px-3 py-2 font-medium">Status</th>
                        <th className="px-3 py-2 font-medium">Data</th>
                      </tr>
                    </thead>
                    <tbody>
                      {ACTIVITIES.map((row) => (
                        <tr key={row.id} className="border-t border-slate-200">
                          <td className="px-3 py-2.5 text-slate-600">{row.id}</td>
                          <td className="px-3 py-2.5">{row.activity}</td>
                          <td className="px-3 py-2.5">{row.price}</td>
                          <td className="px-3 py-2.5">
                            <span className={row.status === "Concluido" ? "text-emerald-600" : row.status === "Pendente" ? "text-rose-600" : "text-amber-600"}>{row.status}</span>
                          </td>
                          <td className="px-3 py-2.5 text-slate-500">{row.date}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </article>
            </section>

            <div className="flex items-center gap-2 text-xs text-slate-500">
              <Link href="/preview/modelos" className="rounded-lg border border-slate-200 bg-white px-2 py-1 hover:text-cyan-700">Modelos</Link>
              <Link href="/preview/a" className="rounded-lg border border-slate-200 bg-white px-2 py-1 hover:text-cyan-700">Ver A</Link>
              <Link href="/preview/c" className="rounded-lg border border-slate-200 bg-white px-2 py-1 hover:text-cyan-700">Ver C</Link>
            </div>
          </section>
        </div>
      </div>
    </main>
  );
}
