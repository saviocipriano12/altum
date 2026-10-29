"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { CircleDot, Loader2, Plus, Target } from "lucide-react";
import { authedFetch } from "@/app/lib/authed-fetch";

type Tenant = { id: string; name: string };
type Metric = { name: string; target: string };
type Objective = {
  id: string;
  tenantId: string;
  title: string;
  statement: string;
  status: "draft" | "active" | "achieved" | "cancelled";
  successMetrics: Metric[];
};
type Program = {
  id: string;
  tenantId: string;
  objectiveId: string;
  title: string;
  status: "draft" | "active" | "paused" | "completed" | "cancelled";
  missionIds: string[];
};
type Mission = {
  id: string;
  tenantId: string;
  objectiveId: string | null;
  programId: string | null;
  title: string;
  status: string;
};

type MissionPayload = { items?: Mission[]; tenants?: Tenant[]; error?: string };
type ObjectivesPayload = { items?: Objective[]; error?: string };
type ProgramsPayload = { items?: Program[]; error?: string };

const objectiveLabels: Record<Objective["status"], string> = {
  draft: "Em preparação",
  active: "Em andamento",
  achieved: "Alcançado",
  cancelled: "Encerrado",
};

const programLabels: Record<Program["status"], string> = {
  draft: "Em preparação",
  active: "Em andamento",
  paused: "Pausado",
  completed: "Concluído",
  cancelled: "Encerrado",
};

function readMetrics(value: string): Metric[] {
  return value
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const separator = line.indexOf(":");
      return separator > 0
        ? {
            name: line.slice(0, separator).trim(),
            target: line.slice(separator + 1).trim(),
          }
        : { name: line, target: "A definir" };
    })
    .filter((metric) => metric.name.length >= 2 && metric.target.length > 0);
}

export default function ObjectivesPage() {
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [objectives, setObjectives] = useState<Objective[]>([]);
  const [programs, setPrograms] = useState<Program[]>([]);
  const [missions, setMissions] = useState<Mission[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<"objective" | "program" | "">("");
  const [updatingId, setUpdatingId] = useState("");
  const [error, setError] = useState("");
  const [openForm, setOpenForm] = useState<"objective" | "program" | "">("");
  const [objectiveForm, setObjectiveForm] = useState({
    tenantId: "",
    title: "",
    statement: "",
    status: "draft" as Objective["status"],
    metrics: "",
  });
  const [programForm, setProgramForm] = useState({
    tenantId: "",
    objectiveId: "",
    title: "",
    status: "draft" as Program["status"],
  });

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setError("");
      const [missionsResponse, objectivesResponse, programsResponse] =
        await Promise.all([
          authedFetch("/api/admin/agent-os/missions"),
          authedFetch("/api/admin/agent-os/objectives"),
          authedFetch("/api/admin/agent-os/programs"),
        ]);
      const [missionsPayload, objectivesPayload, programsPayload] =
        (await Promise.all([
          missionsResponse.json().catch(() => ({})),
          objectivesResponse.json().catch(() => ({})),
          programsResponse.json().catch(() => ({})),
        ])) as [MissionPayload, ObjectivesPayload, ProgramsPayload];
      if (
        !missionsResponse.ok ||
        !objectivesResponse.ok ||
        !programsResponse.ok
      ) {
        throw new Error(
          missionsPayload.error ||
            objectivesPayload.error ||
            programsPayload.error ||
            "Não foi possível carregar os objetivos.",
        );
      }
      const nextTenants = missionsPayload.tenants || [];
      setTenants(nextTenants);
      setMissions(missionsPayload.items || []);
      setObjectives(objectivesPayload.items || []);
      setPrograms(programsPayload.items || []);
      setObjectiveForm((current) =>
        current.tenantId
          ? current
          : { ...current, tenantId: nextTenants[0]?.id || "" },
      );
      setProgramForm((current) =>
        current.tenantId
          ? current
          : { ...current, tenantId: nextTenants[0]?.id || "" },
      );
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Não foi possível carregar os objetivos.",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const tenantNames = useMemo(
    () => new Map(tenants.map((tenant) => [tenant.id, tenant.name])),
    [tenants],
  );
  const objectivesForProgram = objectives.filter(
    (objective) =>
      objective.tenantId === programForm.tenantId &&
      !["cancelled"].includes(objective.status),
  );

  async function createObjective(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const successMetrics = readMetrics(objectiveForm.metrics);
    if (successMetrics.length === 0) {
      setError("Inclua ao menos um indicador no formato “nome: meta”.");
      return;
    }
    try {
      setSaving("objective");
      setError("");
      const response = await authedFetch("/api/admin/agent-os/objectives", {
        method: "POST",
        body: JSON.stringify({
          tenantId: objectiveForm.tenantId,
          title: objectiveForm.title,
          statement: objectiveForm.statement,
          status: objectiveForm.status,
          successMetrics,
        }),
      });
      const payload = (await response.json().catch(() => ({}))) as {
        error?: string;
      };
      if (!response.ok)
        throw new Error(payload.error || "Não foi possível criar o objetivo.");
      setOpenForm("");
      setObjectiveForm((current) => ({
        ...current,
        title: "",
        statement: "",
        status: "draft",
        metrics: "",
      }));
      await load();
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Não foi possível criar o objetivo.",
      );
    } finally {
      setSaving("");
    }
  }

  async function createProgram(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    try {
      setSaving("program");
      setError("");
      const response = await authedFetch("/api/admin/agent-os/programs", {
        method: "POST",
        body: JSON.stringify(programForm),
      });
      const payload = (await response.json().catch(() => ({}))) as {
        error?: string;
      };
      if (!response.ok)
        throw new Error(payload.error || "Não foi possível criar o programa.");
      setOpenForm("");
      setProgramForm((current) => ({
        ...current,
        objectiveId: "",
        title: "",
        status: "draft",
      }));
      await load();
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Não foi possível criar o programa.",
      );
    } finally {
      setSaving("");
    }
  }

  async function updateStatus(
    kind: "objective" | "program",
    id: string,
    status: string,
  ) {
    try {
      setUpdatingId(id);
      setError("");
      const response = await authedFetch(`/api/admin/agent-os/${kind}s`, {
        method: "PATCH",
        body: JSON.stringify({ id, status }),
      });
      const payload = (await response.json().catch(() => ({}))) as {
        error?: string;
      };
      if (!response.ok)
        throw new Error(
          payload.error || "Não foi possível atualizar o estado.",
        );
      await load();
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Não foi possível atualizar o estado.",
      );
    } finally {
      setUpdatingId("");
    }
  }

  return (
    <div className="mx-auto max-w-7xl space-y-6 p-4 pb-12 sm:p-6 lg:p-8">
      <header className="flex flex-col gap-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex items-center gap-2 text-sm font-medium text-violet-700">
            <Target size={17} /> Direção da operação
          </div>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight text-slate-900">
            Objetivos e programas
          </h1>
          <p className="mt-1 max-w-2xl text-sm text-slate-600">
            Transforme o resultado que importa para cada empresa em programas
            claros e missões executáveis pelos agentes.
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap gap-2">
          <button
            type="button"
            onClick={() =>
              setOpenForm(openForm === "objective" ? "" : "objective")
            }
            className="inline-flex items-center gap-2 rounded-xl bg-violet-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-violet-700"
          >
            <Plus size={16} /> Novo objetivo
          </button>
          <button
            type="button"
            onClick={() => setOpenForm(openForm === "program" ? "" : "program")}
            className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"
          >
            <Plus size={16} /> Novo programa
          </button>
        </div>
      </header>

      {error && (
        <p
          role="alert"
          className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
        >
          {error}
        </p>
      )}

      {openForm === "objective" && (
        <form
          onSubmit={createObjective}
          className="grid gap-4 rounded-2xl border border-violet-200 bg-violet-50/40 p-5 md:grid-cols-2"
        >
          <FormField label="Empresa">
            <select
              required
              className="field"
              value={objectiveForm.tenantId}
              onChange={(event) =>
                setObjectiveForm((current) => ({
                  ...current,
                  tenantId: event.target.value,
                }))
              }
            >
              {tenants.map((tenant) => (
                <option key={tenant.id} value={tenant.id}>
                  {tenant.name}
                </option>
              ))}
            </select>
          </FormField>
          <FormField label="Estado inicial">
            <select
              className="field"
              value={objectiveForm.status}
              onChange={(event) =>
                setObjectiveForm((current) => ({
                  ...current,
                  status: event.target.value as Objective["status"],
                }))
              }
            >
              <option value="draft">Em preparação</option>
              <option value="active">Em andamento</option>
            </select>
          </FormField>
          <FormField label="Objetivo">
            <input
              required
              minLength={4}
              maxLength={160}
              className="field"
              value={objectiveForm.title}
              onChange={(event) =>
                setObjectiveForm((current) => ({
                  ...current,
                  title: event.target.value,
                }))
              }
              placeholder="Ex.: Gerar demanda qualificada"
            />
          </FormField>
          <FormField label="Indicadores de sucesso">
            <textarea
              required
              className="field min-h-24"
              value={objectiveForm.metrics}
              onChange={(event) =>
                setObjectiveForm((current) => ({
                  ...current,
                  metrics: event.target.value,
                }))
              }
              placeholder={
                "Reuniões qualificadas: 20/mês\nCusto por oportunidade: até R$ 120"
              }
            />
          </FormField>
          <div className="md:col-span-2">
            <FormField label="Resultado esperado">
              <textarea
                required
                minLength={12}
                maxLength={4000}
                className="field min-h-28"
                value={objectiveForm.statement}
                onChange={(event) =>
                  setObjectiveForm((current) => ({
                    ...current,
                    statement: event.target.value,
                  }))
                }
                placeholder="Descreva a transformação de negócio, o público ou processo que será melhorado e o horizonte de resultado."
              />
            </FormField>
          </div>
          <div className="md:col-span-2 flex justify-end">
            <button
              disabled={saving === "objective" || !objectiveForm.tenantId}
              className="rounded-xl bg-violet-600 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-60"
            >
              {saving === "objective" ? "Criando..." : "Criar objetivo"}
            </button>
          </div>
        </form>
      )}

      {openForm === "program" && (
        <form
          onSubmit={createProgram}
          className="grid gap-4 rounded-2xl border border-blue-200 bg-blue-50/40 p-5 md:grid-cols-2"
        >
          <FormField label="Empresa">
            <select
              required
              className="field"
              value={programForm.tenantId}
              onChange={(event) =>
                setProgramForm((current) => ({
                  ...current,
                  tenantId: event.target.value,
                  objectiveId: "",
                }))
              }
            >
              {tenants.map((tenant) => (
                <option key={tenant.id} value={tenant.id}>
                  {tenant.name}
                </option>
              ))}
            </select>
          </FormField>
          <FormField label="Objetivo">
            <select
              required
              className="field"
              value={programForm.objectiveId}
              onChange={(event) =>
                setProgramForm((current) => ({
                  ...current,
                  objectiveId: event.target.value,
                }))
              }
            >
              <option value="">Selecione um objetivo</option>
              {objectivesForProgram.map((objective) => (
                <option key={objective.id} value={objective.id}>
                  {objective.title}
                </option>
              ))}
            </select>
          </FormField>
          <FormField label="Programa">
            <input
              required
              minLength={4}
              maxLength={160}
              className="field"
              value={programForm.title}
              onChange={(event) =>
                setProgramForm((current) => ({
                  ...current,
                  title: event.target.value,
                }))
              }
              placeholder="Ex.: Aquisição e conversão"
            />
          </FormField>
          <FormField label="Estado inicial">
            <select
              className="field"
              value={programForm.status}
              onChange={(event) =>
                setProgramForm((current) => ({
                  ...current,
                  status: event.target.value as Program["status"],
                }))
              }
            >
              <option value="draft">Em preparação</option>
              <option value="active">Em andamento</option>
            </select>
          </FormField>
          <div className="md:col-span-2 flex justify-end">
            <button
              disabled={saving === "program" || !programForm.objectiveId}
              className="rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-60"
            >
              {saving === "program" ? "Criando..." : "Criar programa"}
            </button>
          </div>
        </form>
      )}

      {loading ? (
        <div className="flex justify-center rounded-2xl border border-slate-200 bg-white p-12">
          <Loader2 className="animate-spin text-violet-600" />
        </div>
      ) : objectives.length === 0 ? (
        <EmptyState onCreate={() => setOpenForm("objective")} />
      ) : (
        <section className="space-y-4">
          {objectives.map((objective) => {
            const programsForObjective = programs.filter(
              (program) => program.objectiveId === objective.id,
            );
            const missionsForObjective = missions.filter(
              (mission) => mission.objectiveId === objective.id,
            );
            return (
              <article
                key={objective.id}
                className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm"
              >
                <div className="flex flex-col gap-4 border-b border-slate-100 p-5 lg:flex-row lg:items-start lg:justify-between">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <select
                        aria-label={`Estado do objetivo ${objective.title}`}
                        disabled={updatingId === objective.id}
                        value={objective.status}
                        onChange={(event) =>
                          void updateStatus(
                            "objective",
                            objective.id,
                            event.target.value,
                          )
                        }
                        className="rounded-full border-0 bg-violet-100 px-2.5 py-1 text-xs font-semibold text-violet-800 outline-none disabled:opacity-60"
                      >
                        {Object.entries(objectiveLabels).map(
                          ([value, label]) => (
                            <option key={value} value={value}>
                              {label}
                            </option>
                          ),
                        )}
                      </select>
                      <span className="text-xs font-medium text-slate-500">
                        {tenantNames.get(objective.tenantId) ||
                          "Empresa não identificada"}
                      </span>
                    </div>
                    <h2 className="mt-3 text-lg font-semibold text-slate-900">
                      {objective.title}
                    </h2>
                    <p className="mt-1 max-w-3xl text-sm text-slate-600">
                      {objective.statement}
                    </p>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-center text-sm">
                    <Metric
                      value={String(programsForObjective.length)}
                      label="programas"
                    />
                    <Metric
                      value={String(missionsForObjective.length)}
                      label="missões"
                    />
                  </div>
                </div>
                <div className="grid gap-3 p-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                      Indicadores de sucesso
                    </p>
                    <ul className="mt-2 space-y-2">
                      {objective.successMetrics.map((metric) => (
                        <li
                          key={`${metric.name}-${metric.target}`}
                          className="flex items-start gap-2 text-sm text-slate-700"
                        >
                          <CircleDot
                            className="mt-0.5 shrink-0 text-violet-500"
                            size={15}
                          />
                          <span>
                            <strong>{metric.name}</strong> · {metric.target}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                      Programas
                    </p>
                    {programsForObjective.length === 0 ? (
                      <p className="mt-2 text-sm text-slate-500">
                        Ainda não há uma frente estruturada para este objetivo.
                      </p>
                    ) : (
                      <ul className="mt-2 space-y-2">
                        {programsForObjective.map((program) => {
                          const linkedMissions = missions.filter(
                            (mission) => mission.programId === program.id,
                          );
                          return (
                            <li
                              key={program.id}
                              className="flex items-center justify-between gap-3 rounded-xl bg-slate-50 px-3 py-2"
                            >
                              <div>
                                <p className="text-sm font-medium text-slate-800">
                                  {program.title}
                                </p>
                                <p className="text-xs text-slate-500">
                                  {linkedMissions.length} missão(ões)
                                </p>
                              </div>
                              <select
                                aria-label={`Estado do programa ${program.title}`}
                                disabled={updatingId === program.id}
                                value={program.status}
                                onChange={(event) =>
                                  void updateStatus(
                                    "program",
                                    program.id,
                                    event.target.value,
                                  )
                                }
                                className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs font-medium text-slate-700 outline-none disabled:opacity-60"
                              >
                                {Object.entries(programLabels).map(
                                  ([value, label]) => (
                                    <option key={value} value={value}>
                                      {label}
                                    </option>
                                  ),
                                )}
                              </select>
                            </li>
                          );
                        })}
                      </ul>
                    )}
                  </div>
                </div>
                {missionsForObjective.length > 0 && (
                  <div className="border-t border-slate-100 px-5 py-3">
                    <p className="text-xs text-slate-500">
                      Missões vinculadas:{" "}
                      {missionsForObjective
                        .slice(0, 3)
                        .map((mission) => mission.title)
                        .join(" · ")}
                      {missionsForObjective.length > 3
                        ? ` · +${missionsForObjective.length - 3}`
                        : ""}
                    </p>
                  </div>
                )}
              </article>
            );
          })}
        </section>
      )}

      <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
        Depois de criar um programa, abra{" "}
        <Link
          href="/admin/missoes"
          className="font-semibold text-violet-700 underline"
        >
          Missões
        </Link>{" "}
        para delegar as entregas aos agentes com objetivo, orçamento, risco e
        aprovações definidos.
      </div>
      <style jsx>{`
        .field {
          width: 100%;
          border: 1px solid rgb(203 213 225);
          border-radius: 0.75rem;
          background: white;
          padding: 0.65rem 0.75rem;
          font-size: 0.875rem;
          outline: none;
        }
        .field:focus {
          border-color: rgb(124 58 237);
          box-shadow: 0 0 0 3px rgb(237 233 254);
        }
      `}</style>
    </div>
  );
}

function FormField({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block text-sm font-medium text-slate-700">
      <span className="mb-1.5 block">{label}</span>
      {children}
    </label>
  );
}
function Metric({ value, label }: { value: string; label: string }) {
  return (
    <div className="rounded-xl bg-slate-50 px-4 py-2">
      <p className="text-lg font-semibold text-slate-900">{value}</p>
      <p className="text-xs text-slate-500">{label}</p>
    </div>
  );
}
function EmptyState({ onCreate }: { onCreate: () => void }) {
  return (
    <section className="rounded-2xl border border-dashed border-slate-300 bg-white p-12 text-center">
      <Target className="mx-auto text-violet-500" size={30} />
      <h2 className="mt-3 font-semibold text-slate-900">
        Defina o primeiro resultado de negócio
      </h2>
      <p className="mx-auto mt-1 max-w-lg text-sm text-slate-600">
        Um objetivo conecta estratégia, indicadores, programas e as missões que
        os agentes poderão executar.
      </p>
      <button
        type="button"
        onClick={onCreate}
        className="mt-5 rounded-xl bg-violet-600 px-4 py-2.5 text-sm font-semibold text-white"
      >
        Criar objetivo
      </button>
    </section>
  );
}
