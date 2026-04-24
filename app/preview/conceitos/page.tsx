"use client";

import { useEffect, useMemo, useState } from "react";
import type { LucideIcon } from "lucide-react";
import {
  CalendarDays,
  ChevronRight,
  DollarSign,
  Funnel,
  Inbox,
  LayoutDashboard,
  ListTodo,
  Megaphone,
  MoonStar,
  Sparkles,
  WandSparkles,
  SunMedium,
  Target,
  Users,
  X,
} from "lucide-react";

type ConceptId = "fusion-altum" | "command-center" | "minimalismo-radical" | "neoglass-empresarial";
type UiMode = "dark" | "light";
type DensityMode = "comfortable" | "compact";
type ModuleId =
  | "visao-geral"
  | "inbox"
  | "crm"
  | "followups"
  | "agenda"
  | "pipeline"
  | "comercial"
  | "campanhas"
  | "captacao";

type ModuleItem = {
  id: ModuleId;
  label: string;
  icon: LucideIcon;
  summary: string;
  action: string;
};

type ModuleData = {
  title: string;
  summary: string;
  action: string;
  kpis: Array<{ label: string; value: string; note: string }>;
  rows: Array<{ c1: string; c2: string; c3: string; c4: string }>;
  rightPanel: string[];
};

type CommandAction = {
  id: string;
  label: string;
  hint: string;
  run: () => void;
};

const MODULES: ModuleItem[] = [
  { id: "visao-geral", label: "Visao geral", icon: LayoutDashboard, summary: "Resumo executivo da operacao.", action: "Revisar prioridades" },
  { id: "inbox", label: "Inbox", icon: Inbox, summary: "Fila de atendimento com contexto.", action: "Atender conversas" },
  { id: "crm", label: "CRM", icon: Users, summary: "Gestao de leads e proxima acao.", action: "Atualizar funil" },
  { id: "followups", label: "Follow-ups", icon: ListTodo, summary: "Cadencias e retornos do time.", action: "Executar follow-ups" },
  { id: "agenda", label: "Agenda", icon: CalendarDays, summary: "Compromissos e reunioes comerciais.", action: "Organizar agenda" },
  { id: "pipeline", label: "Pipeline", icon: Funnel, summary: "Conversao por etapa do funil.", action: "Analisar gargalos" },
  { id: "comercial", label: "Comercial", icon: DollarSign, summary: "Forecast e oportunidades abertas.", action: "Revisar oportunidades" },
  { id: "campanhas", label: "Campanhas", icon: Megaphone, summary: "Performance de canais e investimento.", action: "Otimizar campanhas" },
  { id: "captacao", label: "Captacao", icon: Target, summary: "Entrada de leads com qualidade.", action: "Validar novos leads" },
];

function getModuleData(module: ModuleItem): ModuleData {
  return {
    title: module.label,
    summary: module.summary,
    action: module.action,
    kpis: [
      { label: "Volume ativo", value: "34", note: "+4 hoje" },
      { label: "SLA medio", value: "11 min", note: "meta <= 15 min" },
      { label: "Taxa de conversao", value: "22%", note: "+3pp no mes" },
      { label: "Receita prevista", value: "R$ 142 mil", note: "projecao 30 dias" },
    ],
    rows: [
      { c1: "Savio Cipriano", c2: "Maria", c3: "Qualificacao", c4: "Hoje 14:00" },
      { c1: "Studio Prime", c2: "Diego", c3: "Proposta", c4: "Hoje 16:30" },
      { c1: "Atlas Med", c2: "Carlos", c3: "Novo", c4: "Amanha 09:15" },
      { c1: "Rota Sul", c2: "Maria", c3: "Fechamento", c4: "Amanha 11:00" },
    ],
    rightPanel: [
      "Priorizar leads sem retorno ha mais de 48h.",
      "Aplicar resumo automatico nas conversas longas.",
      "Revisar owner de 3 itens sem responsavel.",
    ],
  };
}

export default function ConceitosPreviewPage() {
  const [concept, setConcept] = useState<ConceptId>("fusion-altum");
  const [uiMode, setUiMode] = useState<UiMode>("dark");
  const [density, setDensity] = useState<DensityMode>("comfortable");
  const [activeModuleId, setActiveModuleId] = useState<ModuleId>("inbox");
  const [simulateEmptyState, setSimulateEmptyState] = useState(false);
  const [aiApplied, setAiApplied] = useState(false);
  const [commandOpen, setCommandOpen] = useState(false);
  const [commandQuery, setCommandQuery] = useState("");

  const activeModule = useMemo(
    () => MODULES.find((item) => item.id === activeModuleId) || MODULES[0],
    [activeModuleId]
  );
  const data = useMemo(() => getModuleData(activeModule), [activeModule]);

  const commandActions = useMemo<CommandAction[]>(
    () => [
      ...MODULES.map((module) => ({
        id: `module_${module.id}`,
        label: `Abrir ${module.label}`,
        hint: "Modulo",
        run: () => setActiveModuleId(module.id),
      })),
      {
        id: "toggle_theme",
        label: uiMode === "dark" ? "Trocar para modo claro" : "Trocar para modo escuro",
        hint: "Tema",
        run: () => setUiMode((current) => (current === "dark" ? "light" : "dark")),
      },
      {
        id: "toggle_density",
        label: density === "comfortable" ? "Usar densidade compacta" : "Usar densidade confortavel",
        hint: "Layout",
        run: () => setDensity((current) => (current === "comfortable" ? "compact" : "comfortable")),
      },
      {
        id: "toggle_empty",
        label: simulateEmptyState ? "Desativar estado vazio" : "Simular estado vazio",
        hint: "Teste",
        run: () => setSimulateEmptyState((current) => !current),
      },
      {
        id: "toggle_ai",
        label: aiApplied ? "Desfazer sugestao da IA" : "Aplicar sugestao da IA",
        hint: "IA",
        run: () => setAiApplied((current) => !current),
      },
    ],
    [aiApplied, density, simulateEmptyState, uiMode]
  );

  const filteredActions = useMemo(() => {
    const query = commandQuery.trim().toLowerCase();
    if (!query) return commandActions.slice(0, 12);
    return commandActions.filter((action) => `${action.label} ${action.hint}`.toLowerCase().includes(query)).slice(0, 12);
  }, [commandActions, commandQuery]);

  useEffect(() => {
    function handleKeydown(event: KeyboardEvent) {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setCommandOpen((current) => !current);
        return;
      }
      if (event.key === "Escape") {
        setCommandOpen(false);
      }
    }

    window.addEventListener("keydown", handleKeydown);
    return () => window.removeEventListener("keydown", handleKeydown);
  }, []);

  return (
    <div
      className={`[font-family:'Space_Grotesk','Sora','Manrope',sans-serif] min-h-screen ${
        uiMode === "dark" ? "bg-neutral-950 text-white" : "bg-[#F4F4F4] text-black"
      }`}
    >
      <header
        className={`sticky top-0 z-20 border-b backdrop-blur-xl ${
          uiMode === "dark" ? "border-white/10 bg-black/70" : "border-black/10 bg-white/80"
        }`}
      >
        <div className="mx-auto flex max-w-[1440px] flex-wrap items-center gap-3 px-4 py-3 lg:px-6">
          <div>
            <p className={`text-xs uppercase tracking-[0.2em] ${uiMode === "dark" ? "text-white/60" : "text-black/55"}`}>
              ALTUM Concept Lab
            </p>
            <h1 className="text-lg font-semibold">4 Direcoes Revolucionarias</h1>
          </div>

          <div className={`ml-auto inline-flex rounded-xl border p-1 ${uiMode === "dark" ? "border-white/10 bg-white/5" : "border-black/15 bg-black/[0.04]"}`}>
            <ConceptTab
              active={concept === "fusion-altum"}
              label="Fusion ALTUM"
              onClick={() => setConcept("fusion-altum")}
              uiMode={uiMode}
            />
            <ConceptTab
              active={concept === "command-center"}
              label="Command Center"
              onClick={() => setConcept("command-center")}
              uiMode={uiMode}
            />
            <ConceptTab
              active={concept === "minimalismo-radical"}
              label="Minimalismo Radical"
              onClick={() => setConcept("minimalismo-radical")}
              uiMode={uiMode}
            />
            <ConceptTab
              active={concept === "neoglass-empresarial"}
              label="NeoGlass Empresarial"
              onClick={() => setConcept("neoglass-empresarial")}
              uiMode={uiMode}
            />
          </div>

          <button
            type="button"
            onClick={() => setUiMode((current) => (current === "dark" ? "light" : "dark"))}
            className={`inline-flex items-center gap-2 rounded-lg border px-3 py-1.5 text-xs font-medium ${
              uiMode === "dark"
                ? "border-white/15 bg-white/5 text-white hover:bg-white/10"
                : "border-black/15 bg-white text-black hover:bg-black/[0.04]"
            }`}
          >
            {uiMode === "dark" ? <SunMedium className="h-4 w-4 text-[#E85002]" /> : <MoonStar className="h-4 w-4 text-[#E85002]" />}
            {uiMode === "dark" ? "Modo claro" : "Modo escuro"}
          </button>

          <button
            type="button"
            onClick={() => setDensity((current) => (current === "comfortable" ? "compact" : "comfortable"))}
            className={`inline-flex items-center gap-2 rounded-lg border px-3 py-1.5 text-xs font-medium ${
              uiMode === "dark"
                ? "border-white/15 bg-white/5 text-white hover:bg-white/10"
                : "border-black/15 bg-white text-black hover:bg-black/[0.04]"
            }`}
          >
            {density === "comfortable" ? "Compacto" : "Confortavel"}
          </button>

          <button
            type="button"
            onClick={() => setSimulateEmptyState((current) => !current)}
            className={`inline-flex items-center gap-2 rounded-lg border px-3 py-1.5 text-xs font-medium ${
              uiMode === "dark"
                ? "border-white/15 bg-white/5 text-white hover:bg-white/10"
                : "border-black/15 bg-white text-black hover:bg-black/[0.04]"
            }`}
          >
            {simulateEmptyState ? "Estado real" : "Simular vazio"}
          </button>

          <button
            type="button"
            onClick={() => setCommandOpen(true)}
            className={`inline-flex items-center gap-2 rounded-lg border px-3 py-1.5 text-xs font-medium ${
              uiMode === "dark"
                ? "border-white/15 bg-white/5 text-white hover:bg-white/10"
                : "border-black/15 bg-white text-black hover:bg-black/[0.04]"
            }`}
          >
            <WandSparkles className="h-4 w-4 text-[#E85002]" />
            Command Palette
            <span className={`rounded px-1.5 py-0.5 text-[10px] ${uiMode === "dark" ? "bg-white/10 text-white/70" : "bg-black/10 text-black/70"}`}>Ctrl+K</span>
          </button>
        </div>
      </header>

      <div className="mx-auto max-w-[1440px] px-4 pb-8 pt-4 lg:px-6">
        {concept === "fusion-altum" ? (
          <FusionAltum
            modules={MODULES}
            activeModuleId={activeModuleId}
            onSelectModule={setActiveModuleId}
            data={data}
            uiMode={uiMode}
            density={density}
            simulateEmptyState={simulateEmptyState}
            aiApplied={aiApplied}
            onToggleAi={() => setAiApplied((current) => !current)}
          />
        ) : concept === "command-center" ? (
          <CommandCenter
            modules={MODULES}
            activeModuleId={activeModuleId}
            onSelectModule={setActiveModuleId}
            data={data}
            uiMode={uiMode}
          />
        ) : concept === "minimalismo-radical" ? (
          <MinimalismoRadical
            modules={MODULES}
            activeModuleId={activeModuleId}
            onSelectModule={setActiveModuleId}
            data={data}
            uiMode={uiMode}
          />
        ) : (
          <NeoGlassEmpresarial
            modules={MODULES}
            activeModuleId={activeModuleId}
            onSelectModule={setActiveModuleId}
            data={data}
            uiMode={uiMode}
          />
        )}
      </div>

      {commandOpen ? (
        <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/45 px-4 pt-20 backdrop-blur-sm">
          <div
            className={`w-full max-w-2xl rounded-2xl border shadow-2xl ${
              uiMode === "dark" ? "border-white/15 bg-[#121212] text-white" : "border-black/15 bg-white text-black"
            }`}
          >
            <div className="flex items-center gap-2 border-b border-inherit px-3 py-2">
              <WandSparkles className="h-4 w-4 text-[#E85002]" />
              <input
                autoFocus
                value={commandQuery}
                onChange={(event) => setCommandQuery(event.target.value)}
                placeholder="Digite um comando... ex: abrir inbox, modo claro, compactar"
                className={`h-9 w-full bg-transparent text-sm outline-none ${
                  uiMode === "dark" ? "placeholder:text-white/40" : "placeholder:text-black/45"
                }`}
              />
              <button
                type="button"
                onClick={() => setCommandOpen(false)}
                className={`inline-flex h-8 w-8 items-center justify-center rounded-md ${
                  uiMode === "dark" ? "hover:bg-white/10" : "hover:bg-black/10"
                }`}
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="max-h-[55vh] overflow-auto p-2">
              {filteredActions.length === 0 ? (
                <p className={`rounded-lg px-3 py-2 text-sm ${uiMode === "dark" ? "text-white/60" : "text-black/55"}`}>
                  Nenhum comando encontrado.
                </p>
              ) : (
                filteredActions.map((action) => (
                  <button
                    key={action.id}
                    type="button"
                    onClick={() => {
                      action.run();
                      setCommandOpen(false);
                      setCommandQuery("");
                    }}
                    className={`mb-1 flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm ${
                      uiMode === "dark"
                        ? "hover:bg-white/10"
                        : "hover:bg-black/5"
                    }`}
                  >
                    <span>{action.label}</span>
                    <span className={`rounded px-2 py-0.5 text-[10px] ${uiMode === "dark" ? "bg-white/10 text-white/70" : "bg-black/10 text-black/65"}`}>
                      {action.hint}
                    </span>
                  </button>
                ))
              )}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function ConceptTab({
  active,
  label,
  onClick,
  uiMode,
}: {
  active: boolean;
  label: string;
  onClick: () => void;
  uiMode: UiMode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-lg px-3 py-1.5 text-xs font-medium ${
        active
          ? "bg-[#E85002] text-white"
          : uiMode === "dark"
            ? "text-white/70 hover:bg-white/10 hover:text-white"
            : "text-black/70 hover:bg-black/10 hover:text-black"
      }`}
    >
      {label}
    </button>
  );
}

function FusionAltum({
  modules,
  activeModuleId,
  onSelectModule,
  data,
  uiMode,
  density,
  simulateEmptyState,
  aiApplied,
  onToggleAi,
}: {
  modules: ModuleItem[];
  activeModuleId: ModuleId;
  onSelectModule: (id: ModuleId) => void;
  data: ModuleData;
  uiMode: UiMode;
  density: DensityMode;
  simulateEmptyState: boolean;
  aiApplied: boolean;
  onToggleAi: () => void;
}) {
  const dark = uiMode === "dark";

  return (
    <div
      className={`relative overflow-hidden rounded-2xl border ${
        dark
          ? "border-[#E85002]/35 bg-[#080808] text-white shadow-[0_0_0_1px_rgba(232,80,2,0.16),0_34px_90px_rgba(0,0,0,0.55)]"
          : "border-black/15 bg-white text-black shadow-[0_0_0_1px_rgba(0,0,0,0.06),0_24px_70px_rgba(0,0,0,0.12)]"
      } motion-safe:transition-all motion-safe:duration-200`}
    >
      <div
        className={`pointer-events-none absolute inset-0 ${
          dark
            ? "bg-[radial-gradient(circle_at_top_right,rgba(232,80,2,0.30),transparent_45%)]"
            : "bg-[radial-gradient(circle_at_top_right,rgba(232,80,2,0.14),transparent_48%)]"
        }`}
      />
      <div
        className={`pointer-events-none absolute inset-0 ${
          dark ? "opacity-45" : "opacity-25"
        } [background:repeating-linear-gradient(90deg,rgba(232,80,2,0.12)_0px,rgba(232,80,2,0.12)_1px,transparent_1px,transparent_10px)]`}
      />

      <div className={`relative ${density === "compact" ? "p-3" : "p-4"} motion-safe:transition-all motion-safe:duration-200`}>
        <div
          className={`mb-3 rounded-xl border backdrop-blur-xl ${density === "compact" ? "p-2.5" : "p-3"} ${
            dark ? "border-white/15 bg-white/10" : "border-black/12 bg-white/70"
          }`}
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className={`text-xs uppercase tracking-[0.2em] ${dark ? "text-white/60" : "text-black/55"}`}>Fusion ALTUM</p>
              <p className="text-xl font-semibold">NeoGlass + Command Center</p>
              <p className={`mt-1 text-sm ${dark ? "text-white/70" : "text-black/70"}`}>
                Experiencia futurista, sofisticada e operacional para uso diario.
              </p>
            </div>

            <span
              className={`inline-flex items-center gap-1 rounded-full border px-2 py-1 text-xs ${
                dark
                  ? "border-[#E85002]/40 bg-[#E85002]/12 text-[#FF7C45]"
                  : "border-[#E85002]/35 bg-[#E85002]/10 text-[#E85002]"
              }`}
            >
              <Sparkles className="h-3.5 w-3.5" />
              Designer oficial candidato
            </span>
          </div>
        </div>

        <div className={`grid ${density === "compact" ? "gap-2.5" : "gap-3"} xl:grid-cols-[230px_minmax(0,1fr)_320px]`}>
          <SidebarNav
            modules={modules}
            activeModuleId={activeModuleId}
            onSelectModule={onSelectModule}
            theme={dark ? "glass" : "light"}
          />

          <div className={`${density === "compact" ? "space-y-2.5" : "space-y-3"}`}>
            <HeroCard
              title={data.title}
              subtitle={data.summary}
              action={data.action}
              theme={dark ? "glass" : "light"}
              badge="Fusion"
              density={density}
            />
            <KpiGrid kpis={data.kpis} theme={dark ? "glass" : "light"} density={density} emptyState={simulateEmptyState} />
            <DataTable
              rows={data.rows}
              theme={dark ? "glass" : "light"}
              density={density}
              emptyState={simulateEmptyState}
              emptyTitle={`${data.title} ainda sem dados`}
              emptyDescription="Conecte canais ou importe registros para iniciar esse modulo."
              emptyActionLabel="Ver guia rapido"
            />
          </div>

          <RightPanel
            title={dark ? "Copiloto Estrategico" : "Copiloto Operacional"}
            items={data.rightPanel}
            theme={dark ? "glass" : "light"}
            density={density}
            aiExplain={{
              suggestion: "Mover Savio Cipriano para etapa Proposta.",
              reason: "Ultima conversa mostrou intencao alta e pedido de preco objetivo.",
              confidence: 87,
              applied: aiApplied,
              onToggleApplied: onToggleAi,
            }}
          />
        </div>
      </div>
    </div>
  );
}

function CommandCenter({
  modules,
  activeModuleId,
  onSelectModule,
  data,
  uiMode,
}: {
  modules: ModuleItem[];
  activeModuleId: ModuleId;
  onSelectModule: (id: ModuleId) => void;
  data: ModuleData;
  uiMode: UiMode;
}) {
  const dark = uiMode === "dark";
  return (
    <div
      className={`relative overflow-hidden rounded-2xl border ${
        dark
          ? "border-[#E85002]/35 bg-black shadow-[0_0_0_1px_rgba(232,80,2,0.15),0_30px_80px_rgba(0,0,0,0.45)]"
          : "border-black/15 bg-white shadow-[0_0_0_1px_rgba(0,0,0,0.06),0_24px_60px_rgba(0,0,0,0.12)]"
      }`}
    >
      <div
        className={`pointer-events-none absolute inset-0 ${
          dark
            ? "bg-[radial-gradient(circle_at_top_right,rgba(232,80,2,0.35),transparent_42%)]"
            : "bg-[radial-gradient(circle_at_top_right,rgba(232,80,2,0.18),transparent_45%)]"
        }`}
      />
      <div className={`pointer-events-none absolute inset-0 ${dark ? "opacity-50" : "opacity-22"} [background:repeating-linear-gradient(90deg,rgba(232,80,2,0.12)_0px,rgba(232,80,2,0.12)_1px,transparent_1px,transparent_9px)]`} />

      <div className="relative grid xl:grid-cols-[250px_minmax(0,1fr)_320px]">
        <SidebarNav
          modules={modules}
          activeModuleId={activeModuleId}
          onSelectModule={onSelectModule}
          theme={dark ? "dark" : "light"}
        />

        <div className={`space-y-3 border-x p-3 ${dark ? "border-[#E85002]/20" : "border-black/10"}`}>
          <HeroCard
            title={data.title}
            subtitle={data.summary}
            action={data.action}
            theme={dark ? "dark" : "light"}
            badge="Command Center"
          />
          <KpiGrid kpis={data.kpis} theme={dark ? "dark" : "light"} />
          <DataTable rows={data.rows} theme={dark ? "dark" : "light"} />
        </div>

        <RightPanel title="Painel de Decisao" items={data.rightPanel} theme={dark ? "dark" : "light"} />
      </div>
    </div>
  );
}

function MinimalismoRadical({
  modules,
  activeModuleId,
  onSelectModule,
  data,
  uiMode,
}: {
  modules: ModuleItem[];
  activeModuleId: ModuleId;
  onSelectModule: (id: ModuleId) => void;
  data: ModuleData;
  uiMode: UiMode;
}) {
  const dark = uiMode === "dark";
  return (
    <div
      className={`rounded-2xl border p-4 shadow-[0_20px_50px_rgba(0,0,0,0.08)] ${
        dark ? "border-white/15 bg-[#0D0D0D] text-white" : "border-[#333333]/25 bg-[#F9F9F9] text-black"
      }`}
    >
      <div className={`mb-4 flex flex-wrap items-center justify-between gap-2 border-b pb-3 ${dark ? "border-white/15" : "border-[#333333]/15"}`}>
        <div>
          <p className={`text-xs uppercase tracking-[0.2em] ${dark ? "text-white/60" : "text-[#646464]"}`}>Minimalismo Radical</p>
          <p className="text-2xl font-semibold">Clareza maxima com linguagem direta</p>
        </div>
        <button
          type="button"
          className={`inline-flex items-center gap-1 rounded-lg border px-3 py-2 text-sm ${dark ? "border-white/20 text-white/80 hover:border-[#E85002]" : "border-[#333333]/20 text-[#333333] hover:border-[#E85002]"}`}
        >
          Acao principal
          <ChevronRight className="h-4 w-4 text-[#E85002]" />
        </button>
      </div>

      <div className="grid gap-4 xl:grid-cols-[220px_minmax(0,1fr)]">
        <SidebarNav
          modules={modules}
          activeModuleId={activeModuleId}
          onSelectModule={onSelectModule}
          theme={dark ? "dark" : "light"}
        />

        <div className="space-y-4">
          <HeroCard
            title={data.title}
            subtitle={data.summary}
            action={data.action}
            theme={dark ? "dark" : "light"}
            badge="Minimal"
          />
          <KpiGrid kpis={data.kpis} theme={dark ? "dark" : "light"} />

          <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_290px]">
            <DataTable rows={data.rows} theme={dark ? "dark" : "light"} />
            <RightPanel title="Recomendacoes" items={data.rightPanel} theme={dark ? "dark" : "light"} />
          </div>
        </div>
      </div>
    </div>
  );
}

function NeoGlassEmpresarial({
  modules,
  activeModuleId,
  onSelectModule,
  data,
  uiMode,
}: {
  modules: ModuleItem[];
  activeModuleId: ModuleId;
  onSelectModule: (id: ModuleId) => void;
  data: ModuleData;
  uiMode: UiMode;
}) {
  const dark = uiMode === "dark";
  return (
    <div
      className={`relative overflow-hidden rounded-2xl border ${
        dark
          ? "border-white/15 bg-[#0D0D0D] shadow-[0_30px_90px_rgba(0,0,0,0.5)]"
          : "border-black/15 bg-[#FAFAFA] shadow-[0_24px_70px_rgba(0,0,0,0.12)]"
      }`}
    >
      <div className={`pointer-events-none absolute inset-0 ${dark ? "bg-[radial-gradient(circle_at_top_left,rgba(232,80,2,0.22),transparent_45%)]" : "bg-[radial-gradient(circle_at_top_left,rgba(232,80,2,0.12),transparent_45%)]"}`} />

      <div className="relative p-4">
        <div className={`mb-3 rounded-xl border p-3 backdrop-blur-xl ${dark ? "border-white/15 bg-white/10" : "border-black/12 bg-white/70"}`}>
          <p className={`text-xs uppercase tracking-[0.2em] ${dark ? "text-white/60" : "text-black/55"}`}>NeoGlass Empresarial</p>
          <p className="text-xl font-semibold">Inovador, premium e pronto para uso diario</p>
        </div>

        <div className="grid gap-3 xl:grid-cols-[220px_minmax(0,1fr)_310px]">
          <SidebarNav
            modules={modules}
            activeModuleId={activeModuleId}
            onSelectModule={onSelectModule}
            theme={dark ? "glass" : "light"}
          />

          <div className="space-y-3">
            <HeroCard
              title={data.title}
              subtitle={data.summary}
              action={data.action}
              theme={dark ? "glass" : "light"}
              badge="NeoGlass"
            />
            <KpiGrid kpis={data.kpis} theme={dark ? "glass" : "light"} />
            <DataTable rows={data.rows} theme={dark ? "glass" : "light"} />
          </div>

          <RightPanel title="Copiloto Operacional" items={data.rightPanel} theme={dark ? "glass" : "light"} />
        </div>
      </div>
    </div>
  );
}

function SidebarNav({
  modules,
  activeModuleId,
  onSelectModule,
  theme,
}: {
  modules: ModuleItem[];
  activeModuleId: ModuleId;
  onSelectModule: (id: ModuleId) => void;
  theme: "dark" | "light" | "glass";
}) {
  const wrapClass =
    theme === "light"
      ? "rounded-xl border border-[#333333]/15 bg-white p-2"
      : theme === "glass"
        ? "rounded-xl border border-white/15 bg-white/10 p-2 backdrop-blur-xl"
        : "rounded-xl border border-[#E85002]/25 bg-black/60 p-2";

  return (
    <aside className={wrapClass}>
      <p className={`mb-2 px-2 text-[11px] uppercase tracking-[0.16em] ${theme === "light" ? "text-[#646464]" : "text-white/60"}`}>
        Modulos
      </p>
      <div className="space-y-1">
        {modules.map((module) => {
          const Icon = module.icon;
          const active = module.id === activeModuleId;
          const activeClass =
            theme === "light"
              ? "bg-[#E85002]/12 text-black border-[#E85002]/40"
              : "bg-[#E85002]/20 text-white border-[#E85002]/50";
          const idleClass =
            theme === "light"
              ? "text-[#333333] border-transparent hover:border-[#333333]/15 hover:bg-[#F3F3F3]"
              : "text-white/80 border-transparent hover:border-white/20 hover:bg-white/10";

          return (
            <button
              key={module.id}
              type="button"
              onClick={() => onSelectModule(module.id)}
              className={`flex w-full items-center justify-between rounded-lg border px-2.5 py-2 text-left text-sm ${active ? activeClass : idleClass}`}
            >
              <span className="inline-flex items-center gap-2">
                <Icon className={`h-4 w-4 ${active ? "text-[#E85002]" : ""}`} />
                {module.label}
              </span>
              <ChevronRight className="h-4 w-4 opacity-70" />
            </button>
          );
        })}
      </div>
    </aside>
  );
}

function HeroCard({
  title,
  subtitle,
  action,
  theme,
  badge,
  density = "comfortable",
}: {
  title: string;
  subtitle: string;
  action: string;
  theme: "dark" | "light" | "glass";
  badge: string;
  density?: DensityMode;
}) {
  const wrapClass =
    theme === "light"
      ? `rounded-xl border border-[#333333]/15 bg-white ${density === "compact" ? "p-3" : "p-4"}`
      : theme === "glass"
        ? `rounded-xl border border-white/15 bg-white/10 ${density === "compact" ? "p-3" : "p-4"} backdrop-blur-xl`
        : `rounded-xl border border-[#E85002]/25 bg-black/70 ${density === "compact" ? "p-3" : "p-4"}`;

  const textSoft = theme === "light" ? "text-[#646464]" : "text-white/70";

  return (
    <section className={`${wrapClass} motion-safe:transition-all motion-safe:duration-200`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <span className="inline-flex items-center gap-1 rounded-full border border-[#E85002]/35 bg-[#E85002]/10 px-2 py-0.5 text-[11px] text-[#E85002]">
            <Sparkles className="h-3.5 w-3.5" />
            {badge}
          </span>
          <h2 className="mt-2 text-2xl font-semibold">{title}</h2>
          <p className={`mt-1 text-sm ${textSoft}`}>{subtitle}</p>
        </div>
        <button
          type="button"
          className="inline-flex items-center gap-2 rounded-lg border border-[#E85002]/50 bg-[#E85002] px-3 py-2 text-sm font-medium text-white hover:brightness-110"
        >
          {action}
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>
    </section>
  );
}

function KpiGrid({
  kpis,
  theme,
  density = "comfortable",
  emptyState = false,
}: {
  kpis: Array<{ label: string; value: string; note: string }>;
  theme: "dark" | "light" | "glass";
  density?: DensityMode;
  emptyState?: boolean;
}) {
  const cardClass =
    theme === "light"
      ? `rounded-xl border border-[#333333]/15 bg-white ${density === "compact" ? "p-2.5" : "p-3"}`
      : theme === "glass"
        ? `rounded-xl border border-white/15 bg-white/10 ${density === "compact" ? "p-2.5" : "p-3"} backdrop-blur-xl`
        : `rounded-xl border border-[#E85002]/25 bg-black/70 ${density === "compact" ? "p-2.5" : "p-3"}`;
  const muted = theme === "light" ? "text-[#646464]" : "text-white/65";

  return (
    <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {kpis.map((kpi) => (
        <div key={kpi.label} className={`${cardClass} motion-safe:transition-all motion-safe:duration-200`}>
          <p className={`text-xs uppercase tracking-[0.12em] ${muted}`}>{kpi.label}</p>
          <p className="mt-2 text-2xl font-semibold">{emptyState ? "—" : kpi.value}</p>
          <p className="mt-1 text-xs text-[#E85002]">{emptyState ? "Sem dados conectados" : kpi.note}</p>
        </div>
      ))}
    </section>
  );
}

function DataTable({
  rows,
  theme,
  density = "comfortable",
  emptyState = false,
  emptyTitle = "Ainda sem dados",
  emptyDescription = "Conecte suas fontes para começar.",
  emptyActionLabel = "Configurar agora",
}: {
  rows: Array<{ c1: string; c2: string; c3: string; c4: string }>;
  theme: "dark" | "light" | "glass";
  density?: DensityMode;
  emptyState?: boolean;
  emptyTitle?: string;
  emptyDescription?: string;
  emptyActionLabel?: string;
}) {
  const wrapClass =
    theme === "light"
      ? "rounded-xl border border-[#333333]/15 bg-white"
      : theme === "glass"
        ? "rounded-xl border border-white/15 bg-white/10 backdrop-blur-xl"
        : "rounded-xl border border-[#E85002]/25 bg-black/70";

  const headClass = theme === "light" ? "bg-[#F3F3F3] text-[#646464]" : "bg-white/5 text-white/60";
  const rowClass = theme === "light" ? "border-t border-[#333333]/12 hover:bg-[#F3F3F3]" : "border-t border-white/10 hover:bg-white/5";
  const textClass = theme === "light" ? "text-[#333333]" : "text-white/80";

  return (
    <section className={`${wrapClass} motion-safe:transition-all motion-safe:duration-200`}>
      <div className="border-b border-white/10 px-3 py-2 text-sm font-semibold">Operacao diaria</div>
      {emptyState ? (
        <div className={`${density === "compact" ? "p-4" : "p-6"} text-center`}>
          <p className={`text-base font-semibold ${textClass}`}>{emptyTitle}</p>
          <p className={`mx-auto mt-1 max-w-lg text-sm ${theme === "light" ? "text-[#646464]" : "text-white/70"}`}>{emptyDescription}</p>
          <button
            type="button"
            className="mt-3 inline-flex items-center gap-1 rounded-lg border border-[#E85002]/50 bg-[#E85002] px-3 py-2 text-sm font-medium text-white hover:brightness-110"
          >
            {emptyActionLabel}
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className={`text-left text-xs uppercase tracking-[0.12em] ${headClass}`}>
              <tr>
                <th className={`${density === "compact" ? "px-2.5 py-2" : "px-3 py-2"}`}>Item</th>
                <th className={`${density === "compact" ? "px-2.5 py-2" : "px-3 py-2"}`}>Owner</th>
                <th className={`${density === "compact" ? "px-2.5 py-2" : "px-3 py-2"}`}>Etapa</th>
                <th className={`${density === "compact" ? "px-2.5 py-2" : "px-3 py-2"}`}>Prazo</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={`${row.c1}_${row.c4}`} className={rowClass}>
                  <td className={`${density === "compact" ? "px-2.5 py-2" : "px-3 py-2"} ${textClass}`}>{row.c1}</td>
                  <td className={`${density === "compact" ? "px-2.5 py-2" : "px-3 py-2"} ${textClass}`}>{row.c2}</td>
                  <td className={`${density === "compact" ? "px-2.5 py-2" : "px-3 py-2"} ${textClass}`}>
                    <span className="rounded-md border border-[#E85002]/35 bg-[#E85002]/10 px-2 py-0.5 text-xs text-[#E85002]">
                      {row.c3}
                    </span>
                  </td>
                  <td className={`${density === "compact" ? "px-2.5 py-2" : "px-3 py-2"} ${textClass}`}>{row.c4}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function RightPanel({
  title,
  items,
  theme,
  density = "comfortable",
  aiExplain,
}: {
  title: string;
  items: string[];
  theme: "dark" | "light" | "glass";
  density?: DensityMode;
  aiExplain?: {
    suggestion: string;
    reason: string;
    confidence: number;
    applied: boolean;
    onToggleApplied: () => void;
  };
}) {
  const wrapClass =
    theme === "light"
      ? `rounded-xl border border-[#333333]/15 bg-white ${density === "compact" ? "p-2.5" : "p-3"}`
      : theme === "glass"
        ? `rounded-xl border border-white/15 bg-white/10 ${density === "compact" ? "p-2.5" : "p-3"} backdrop-blur-xl`
        : `rounded-xl border border-[#E85002]/25 bg-black/65 ${density === "compact" ? "p-2.5" : "p-3"}`;
  const textClass = theme === "light" ? "text-[#333333]" : "text-white/80";

  return (
    <aside className={`${density === "compact" ? "space-y-2.5" : "space-y-3"}`}>
      <div className={`${wrapClass} motion-safe:transition-all motion-safe:duration-200`}>
        <h3 className="text-sm font-semibold">{title}</h3>
        <div className="mt-2 space-y-2">
          {items.map((item) => (
            <p key={item} className={`rounded-lg border border-[#E85002]/20 bg-[#E85002]/10 px-2.5 py-2 text-sm ${textClass}`}>
              {item}
            </p>
          ))}
        </div>
      </div>

      {aiExplain ? (
        <div className={`${wrapClass} motion-safe:transition-all motion-safe:duration-200`}>
          <h3 className="text-sm font-semibold">IA explicavel</h3>
          <div className="mt-2 rounded-lg border border-[#E85002]/20 bg-[#E85002]/10 p-2.5">
            <p className={`text-sm font-medium ${textClass}`}>{aiExplain.suggestion}</p>
            <p className={`mt-1 text-xs ${theme === "light" ? "text-[#646464]" : "text-white/70"}`}>{aiExplain.reason}</p>
            <p className="mt-1 text-xs text-[#E85002]">Confianca: {aiExplain.confidence}%</p>
            <button
              type="button"
              onClick={aiExplain.onToggleApplied}
              className={`mt-2 inline-flex items-center gap-1 rounded-md border px-2.5 py-1.5 text-xs font-medium ${
                aiExplain.applied
                  ? "border-[#E85002]/35 bg-transparent text-[#E85002]"
                  : "border-[#E85002]/50 bg-[#E85002] text-white"
              }`}
            >
              {aiExplain.applied ? "Desfazer aplicacao" : "Aplicar no modulo"}
            </button>
          </div>
        </div>
      ) : null}

      <div className={`${wrapClass} motion-safe:transition-all motion-safe:duration-200`}>
        <h3 className="text-sm font-semibold">Frase do usuario ideal</h3>
        <p className={`mt-2 text-sm ${textClass}`}>
          &quot;A ALTUM parece futurista, mas usar no dia a dia e simples e rapido.&quot;
        </p>
      </div>
    </aside>
  );
}
