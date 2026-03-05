import { NextResponse } from "next/server";
import { FieldValue, Query, QueryDocumentSnapshot } from "firebase-admin/firestore";
import { adminDb } from "@/app/lib/server/firebase-admin";
import { requireRequestUser, RouteAuthError } from "@/app/lib/server/route-auth";

type TimestampLike = {
  toDate?: () => Date;
};

type ClientDoc = {
  id: string;
  name?: string;
  status?: string;
  contactName?: string;
  email?: string;
  phone?: string;
  city?: string;
  niche?: string;
};

type ProjectDoc = {
  id: string;
  titulo?: string;
  status?: string;
  clientId?: string;
  clientName?: string;
  ownerId?: string;
  valorMensal?: number;
};

type BudgetDoc = {
  id: string;
  titulo?: string;
  title?: string;
  status?: string;
  clientId?: string;
  clientName?: string;
  ownerId?: string;
  valorTotal?: number;
};

type FinanceDoc = {
  id: string;
  descricao?: string;
  tipo?: string;
  status?: string;
  valor?: number;
  referencia?: string;
  clientId?: string;
  clientName?: string;
  ownerId?: string;
  vendedorId?: string;
  createdAt?: TimestampLike | number | null;
};

type ActivityDoc = {
  id: string;
  descricao?: string;
  status?: string;
  clienteNome?: string;
  data?: string;
  ownerId?: string;
  createdAt?: TimestampLike | number | null;
};

type LeadDoc = {
  id: string;
  nome?: string;
  origem?: string;
  status?: string;
  pipelineStage?: string;
  ownerId?: string;
};

type AskBody = {
  question?: string;
  action?: {
    type?: "create_activity";
    confirm?: boolean;
    payload?: {
      descricao?: string;
      data?: string;
      clientId?: string;
      ownerId?: string;
      clienteNome?: string;
    };
  };
};

type ActionPayload = {
  descricao?: string;
  data?: string;
  clientId?: string;
  ownerId?: string;
  clienteNome?: string;
};

function normalizeText(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function money(value: number) {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function isPaidStatus(status?: string) {
  const s = normalizeText(status || "");
  return s === "pago" || s === "em dia";
}

function isPendingStatus(status?: string) {
  const s = normalizeText(status || "");
  return s === "pendente" || s === "atrasado";
}

function asDate(value?: TimestampLike | number | null) {
  if (!value) return null;
  if (typeof value === "number") return new Date(value);
  if (typeof value === "object" && typeof value.toDate === "function") {
    return value.toDate();
  }
  return null;
}

function bestClientMatch(question: string, clients: ClientDoc[]) {
  const q = normalizeText(question);
  let best: { client: ClientDoc; score: number } | null = null;

  for (const client of clients) {
    const name = normalizeText(client.name || "");
    if (!name) continue;

    let score = 0;
    if (q.includes(name)) score += 10;

    const tokens = name.split(/\s+/).filter((token) => token.length > 2);
    for (const token of tokens) {
      if (q.includes(token)) score += 1;
    }

    if (!best || score > best.score) {
      best = { client, score };
    }
  }

  if (!best || best.score <= 1) return null;
  return best.client;
}

async function getData<T extends { id: string }>(
  queryRef: Query,
  mapper: (doc: QueryDocumentSnapshot) => T
) {
  const snap = await queryRef.get();
  return snap.docs.map(mapper);
}

function wantsCreateActivity(question: string) {
  const q = normalizeText(question);
  return (
    q.includes("criar atividade") ||
    q.includes("crie atividade") ||
    q.includes("follow up") ||
    q.includes("follow-up") ||
    q.includes("lembrete")
  );
}

async function executeCreateActivityAction(
  user: Awaited<ReturnType<typeof requireRequestUser>>,
  payload: ActionPayload
) {
  const descricao = (payload.descricao || "").trim();
  if (!descricao) {
    return NextResponse.json(
      { error: "Descricao da atividade obrigatoria para confirmar a acao." },
      { status: 400 }
    );
  }

  let ownerId = user.uid;
  if (user.role === "admin" && payload.ownerId) {
    ownerId = payload.ownerId;
  }

  let clienteNome = (payload.clienteNome || "").trim() || null;
  const clientId = (payload.clientId || "").trim() || null;

  if (clientId) {
    const clientSnap = await adminDb.collection("clientes").doc(clientId).get();
    if (!clientSnap.exists) {
      return NextResponse.json({ error: "Cliente informado nao existe." }, { status: 404 });
    }
    const clientData = clientSnap.data() as { ownerId?: string; name?: string };
    if (user.role !== "admin" && clientData.ownerId && clientData.ownerId !== user.uid) {
      return NextResponse.json(
        { error: "Sem permissao para criar atividade neste cliente." },
        { status: 403 }
      );
    }
    ownerId = user.role === "admin" ? ownerId : clientData.ownerId || user.uid;
    clienteNome = clientData.name || clienteNome;
  }

  const activityRef = await adminDb.collection("atividades").add({
    descricao,
    data: payload.data || null,
    status: "pendente",
    ownerId,
    clienteNome,
    source: "ai_assistant",
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  });

  await adminDb.collection("audit_logs").add({
    type: "ai_action_create_activity",
    actorId: user.uid,
    actorName: user.name,
    activityId: activityRef.id,
    ownerId,
    clientId,
    createdAt: FieldValue.serverTimestamp(),
  });

  return NextResponse.json({
    ok: true,
    action: "create_activity",
    activity: {
      id: activityRef.id,
      descricao,
      ownerId,
      clienteNome,
    },
  });
}

export async function POST(req: Request) {
  try {
    const user = await requireRequestUser(req);

    const body = (await req.json()) as AskBody;

    if (body.action?.type === "create_activity") {
      if (!body.action.confirm) {
        return NextResponse.json(
          { error: "Acao requer confirmacao explicita." },
          { status: 400 }
        );
      }
      return executeCreateActivityAction(user, body.action.payload || {});
    }

    const question = (body.question || "").trim();

    if (!question) {
      return NextResponse.json(
        { error: "Pergunta vazia." },
        { status: 400 }
      );
    }

    const isAdmin = user.role === "admin";

    const clientsQuery = isAdmin
      ? adminDb.collection("clientes").limit(300)
      : adminDb.collection("clientes").where("ownerId", "==", user.uid).limit(300);

    const projectsQuery = isAdmin
      ? adminDb.collection("projetos").limit(500)
      : adminDb.collection("projetos").where("ownerId", "==", user.uid).limit(500);

    const budgetsQuery = isAdmin
      ? adminDb.collection("orcamentos").limit(500)
      : adminDb.collection("orcamentos").where("ownerId", "==", user.uid).limit(500);

    const financeQuery = isAdmin
      ? adminDb.collection("financeiro").limit(800)
      : adminDb.collection("financeiro").where("vendedorId", "==", user.uid).limit(800);

    const activitiesQuery = isAdmin
      ? adminDb.collection("atividades").limit(800)
      : adminDb.collection("atividades").where("ownerId", "==", user.uid).limit(800);

    const leadsQuery = isAdmin
      ? adminDb.collection("leads").limit(800)
      : adminDb.collection("leads").where("ownerId", "==", user.uid).limit(800);

    const [clients, projects, budgets, finance, activities, leads] = await Promise.all([
      getData<ClientDoc>(clientsQuery, (item) => ({
        id: item.id,
        ...(item.data() as Omit<ClientDoc, "id">),
      })),
      getData<ProjectDoc>(projectsQuery, (item) => ({
        id: item.id,
        ...(item.data() as Omit<ProjectDoc, "id">),
      })),
      getData<BudgetDoc>(budgetsQuery, (item) => ({
        id: item.id,
        ...(item.data() as Omit<BudgetDoc, "id">),
      })),
      getData<FinanceDoc>(financeQuery, (item) => ({
        id: item.id,
        ...(item.data() as Omit<FinanceDoc, "id">),
      })),
      getData<ActivityDoc>(activitiesQuery, (item) => ({
        id: item.id,
        ...(item.data() as Omit<ActivityDoc, "id">),
      })),
      getData<LeadDoc>(leadsQuery, (item) => ({
        id: item.id,
        ...(item.data() as Omit<LeadDoc, "id">),
      })),
    ]);

    const matchedClient = bestClientMatch(question, clients);

    if (matchedClient) {
      const clientNameNorm = normalizeText(matchedClient.name || "");

      const relatedProjects = projects.filter(
        (project) =>
          project.clientId === matchedClient.id ||
          normalizeText(project.clientName || "") === clientNameNorm
      );

      const relatedBudgets = budgets.filter(
        (budget) =>
          budget.clientId === matchedClient.id ||
          normalizeText(budget.clientName || "") === clientNameNorm
      );

      const relatedFinance = finance.filter(
        (entry) =>
          entry.clientId === matchedClient.id ||
          normalizeText(entry.clientName || "") === clientNameNorm
      );

      const relatedActivities = activities.filter(
        (activity) =>
          normalizeText(activity.clienteNome || "") === clientNameNorm
      );

      const relatedLeads = leads.filter((lead) => {
        const source = normalizeText(lead.origem || "");
        const name = normalizeText(lead.nome || "");
        return source.includes(clientNameNorm) || name.includes(clientNameNorm);
      });

      const paidTotal = relatedFinance
        .filter((entry) => isPaidStatus(entry.status))
        .reduce((sum, entry) => sum + Number(entry.valor || 0), 0);

      const pendingTotal = relatedFinance
        .filter((entry) => isPendingStatus(entry.status))
        .reduce((sum, entry) => sum + Number(entry.valor || 0), 0);

      const activeProjects = relatedProjects.filter(
        (project) => normalizeText(project.status || "") === "ativo"
      ).length;

      const approvedBudgets = relatedBudgets.filter((budget) =>
        normalizeText(budget.status || "").includes("aprov")
      ).length;

      const openActivities = relatedActivities.filter(
        (activity) => normalizeText(activity.status || "") === "pendente"
      ).length;

      const lastFinanceDate = relatedFinance
        .map((entry) => asDate(entry.createdAt))
        .filter((date): date is Date => Boolean(date))
        .sort((a, b) => b.getTime() - a.getTime())[0];

      const topProjectList = relatedProjects
        .slice(0, 3)
        .map((project) => `${project.titulo || "Projeto"} (${project.status || "sem status"})`)
        .join(", ");

      const responseText = [
        `Cliente analisado: ${matchedClient.name || "Sem nome"}.`,
        `Status: ${matchedClient.status || "nao informado"}.`,
        `Projetos: ${relatedProjects.length} no total (${activeProjects} ativos).`,
        `Orcamentos: ${relatedBudgets.length} no total (${approvedBudgets} aprovados).`,
        `Financeiro: recebido ${money(paidTotal)} | pendente ${money(pendingTotal)}.`,
        `Atividades abertas: ${openActivities}.`,
        `Leads relacionados: ${relatedLeads.length}.`,
        topProjectList ? `Projetos em destaque: ${topProjectList}.` : "",
        lastFinanceDate
          ? `Ultimo movimento financeiro: ${lastFinanceDate.toLocaleDateString("pt-BR")}.`
          : "",
      ]
        .filter(Boolean)
        .join("\n");

      const shouldProposeAction = wantsCreateActivity(question);
      const proposedDescription = `Follow-up com ${matchedClient.name || "cliente"} sobre pendencias e proximo passo comercial`;

      return NextResponse.json({
        mode: "client",
        scope: isAdmin ? "global" : "private",
        matchedClient: {
          id: matchedClient.id,
          name: matchedClient.name || "Cliente",
        },
        answer: responseText,
        metrics: {
          projectsTotal: relatedProjects.length,
          activeProjects,
          budgetsTotal: relatedBudgets.length,
          approvedBudgets,
          paidTotal,
          pendingTotal,
          openActivities,
          relatedLeads: relatedLeads.length,
        },
        sources: {
          clientId: matchedClient.id,
          collections: ["clientes", "projetos", "orcamentos", "financeiro", "atividades", "leads"],
        },
        actionProposal: shouldProposeAction
          ? {
              type: "create_activity",
              requiresConfirmation: true,
              payload: {
                descricao: proposedDescription,
                clientId: matchedClient.id,
                ownerId: isAdmin ? undefined : user.uid,
                clienteNome: matchedClient.name || "Cliente",
              },
              preview: {
                title: "Criar atividade de follow-up",
                description: proposedDescription,
              },
            }
          : null,
      });
    }

    const paidTotal = finance
      .filter((entry) => isPaidStatus(entry.status))
      .reduce((sum, entry) => sum + Number(entry.valor || 0), 0);

    const pendingTotal = finance
      .filter((entry) => isPendingStatus(entry.status))
      .reduce((sum, entry) => sum + Number(entry.valor || 0), 0);

    const openActivities = activities.filter(
      (activity) => normalizeText(activity.status || "") === "pendente"
    ).length;

    const responseText = [
      isAdmin ? "Resumo geral da empresa:" : "Resumo da sua carteira:",
      `Clientes: ${clients.length}`,
      `Projetos: ${projects.length}`,
      `Orcamentos: ${budgets.length}`,
      `Leads: ${leads.length}`,
      `Financeiro recebido: ${money(paidTotal)} | pendente: ${money(pendingTotal)}`,
      `Atividades pendentes: ${openActivities}`,
      "",
      "Para analise detalhada, pergunte com o nome do cliente.",
      "Exemplo: Como esta o cliente X?",
    ].join("\n");

    return NextResponse.json({
      mode: "global",
      scope: isAdmin ? "global" : "private",
      answer: responseText,
      metrics: {
        clients: clients.length,
        projects: projects.length,
        budgets: budgets.length,
        leads: leads.length,
        paidTotal,
        pendingTotal,
        openActivities,
      },
      sources: {
        collections: ["clientes", "projetos", "orcamentos", "financeiro", "atividades", "leads"],
      },
    });
  } catch (error) {
    if (error instanceof RouteAuthError) {
      return NextResponse.json(
        { error: error.message, code: error.code },
        { status: error.status }
      );
    }

    console.error("Erro na IA interna:", error);
    return NextResponse.json(
      { error: "Falha ao processar pergunta da IA." },
      { status: 500 }
    );
  }
}
