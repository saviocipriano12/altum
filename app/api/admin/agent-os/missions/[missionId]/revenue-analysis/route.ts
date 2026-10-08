import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/app/lib/server/firebase-admin";
import { requireRequestUser, RouteAuthError } from "@/app/lib/server/route-auth";
import { recordAgentMemory } from "@/lib/server/agent-os/memory";

type RouteContext = { params: Promise<{ missionId: string }> };
type Lead = { id: string; nome: string; status: string; telefone: string; email: string; website: string; rating: number; ratings: number; score: number; reasons: string[] };

function clean(value: unknown, max = 240) { return typeof value === "string" ? value.trim().slice(0, max) : ""; }
function failure(error: unknown) { if (error instanceof RouteAuthError) return Response.json({ error: error.message }, { status: error.status }); console.error("Falha no Revenue Agent:", error); return Response.json({ error: "Não foi possível analisar a carteira." }, { status: 500 }); }

function scoreLead(id: string, row: Record<string, unknown>): Lead {
  const nome = clean(row.nome || row.name) || "Lead sem nome"; const telefone = clean(row.telefone || row.phone, 80); const email = clean(row.email, 160); const website = clean(row.website, 320); const status = clean(row.status || row.pipelineStage, 80) || "sem status"; const rating = Number(row.rating || 0); const ratings = Number(row.userRatingsTotal || 0); const reasons: string[] = []; let score = 0;
  if (telefone) { score += 28; reasons.push("telefone disponível"); } if (email) { score += 16; reasons.push("e-mail disponível"); } if (website) { score += 12; reasons.push("site identificado"); } if (rating >= 4) { score += 12; reasons.push(`avaliação ${rating.toFixed(1)}`); } if (ratings >= 20) { score += 8; reasons.push(`${ratings} avaliações`); }
  if (/novo|qualific|proposta|negocia|contato/.test(status.toLowerCase())) { score += 16; reasons.push(`etapa: ${status}`); }
  return { id, nome, status, telefone, email, website, rating, ratings, score: Math.min(100, score), reasons };
}

export async function POST(request: Request, context: RouteContext) {
  try {
    const actor = await requireRequestUser(request, { roles: ["agency_admin"] });
    const { missionId } = await context.params;
    if (!/^[A-Za-z0-9_-]{1,180}$/.test(missionId)) throw new RouteAuthError(400, "invalid_mission", "Missão inválida.");
    const missionRef = adminDb.collection("agent_missions").doc(missionId); const missionSnap = await missionRef.get();
    if (!missionSnap.exists) throw new RouteAuthError(404, "mission_missing", "Missão não encontrada.");
    const mission = missionSnap.data()!;
    if (mission.template !== "revenue") throw new RouteAuthError(409, "not_revenue_mission", "Esta análise está disponível apenas para missões de receita.");
    if (mission.status !== "running") throw new RouteAuthError(409, "mission_not_running", "Inicie a missão antes de executar o Revenue Agent.");
    const tenantId = clean(mission.tenantId, 180); if (!tenantId) throw new RouteAuthError(409, "tenant_missing", "A missão não possui empresa vinculada.");
    const leads = await adminDb.collection("leads").where("tenantId", "==", tenantId).limit(500).get();
    const ranked = leads.docs.map((doc) => scoreLead(doc.id, doc.data() as Record<string, unknown>)).sort((a, b) => b.score - a.score || a.nome.localeCompare(b.nome));
    const top = ranked.slice(0, 20); const ready = ranked.filter((lead) => lead.score >= 40).length;
    const summary = ranked.length
      ? `Analisei ${ranked.length} oportunidades internas. ${ready} têm sinais suficientes para priorização. As melhores agora são ${top.slice(0, 3).map((lead) => lead.nome).join(", ") || "nenhuma"}. A análise não enviou mensagens nem alterou o CRM.`
      : "Não encontrei oportunidades internas vinculadas a esta empresa. A próxima etapa recomendada é aprovar uma pesquisa externa ou importar a carteira para o CRM.";
    const runRef = adminDb.collection("agent_runs").doc(); const assistantRef = adminDb.collection("agent_command_messages").doc(); const batch = adminDb.batch();
    batch.set(runRef, { tenantId, missionId, agent: "Revenue Agent", capability: "ANALYZE_RESULTS", status: "completed", source: "internal_crm", inputSummary: "Priorização de oportunidades existentes no CRM", output: { summary, totalLeads: ranked.length, readyLeads: ready, top }, evidence: top.map((lead) => ({ leadId: lead.id, reasons: lead.reasons, score: lead.score })), createdBy: actor.uid, createdByName: actor.name, startedAt: FieldValue.serverTimestamp(), completedAt: FieldValue.serverTimestamp(), createdAt: FieldValue.serverTimestamp() });
    batch.set(assistantRef, { ownerId: actor.uid, tenantId, role: "assistant", missionId, content: `${summary}\n\nPrioridade sugerida:\n${top.slice(0, 5).map((lead, index) => `${index + 1}. ${lead.nome} — score ${lead.score}/100 (${lead.reasons.slice(0, 2).join(", ") || "dados ainda incompletos"})`).join("\n") || "Nenhuma oportunidade para listar."}`, agentRunId: runRef.id, createdAt: FieldValue.serverTimestamp() });
    batch.set(adminDb.collection("audit_logs").doc(), { type: "agent_revenue_analysis_completed", actorId: actor.uid, actorName: actor.name, tenantId, missionId, runId: runRef.id, totalLeads: ranked.length, createdAt: FieldValue.serverTimestamp() });
    await batch.commit();
    await recordAgentMemory({ tenantId, missionId, kind: "revenue_priority", summary, evidence: top.map((lead) => ({ leadId: lead.id, name: lead.nome, score: lead.score, reasons: lead.reasons })), confidence: ranked.length ? 0.72 : 0.25, sourceRunId: runRef.id, createdBy: actor.uid });
    return Response.json({ ok: true, runId: runRef.id, summary, totalLeads: ranked.length, readyLeads: ready, top });
  } catch (error) { return failure(error); }
}
