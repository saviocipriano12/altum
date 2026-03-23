import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/app/lib/server/firebase-admin";
import { isAdmin, requireRequestUser, RouteAuthError } from "@/app/lib/server/route-auth";
import { getTenantForCurrentUser } from "@/lib/server/tenant";

type LeadDoc = {
  nome?: string;
  telefone?: string;
  email?: string;
  endereco?: string;
  origem?: string;
  notes?: string;
  cnpj?: string;
  instagram?: string;
  linkedin?: string;
  owner?: string;
  ownerId?: string;
  tenantId?: string;
  offer?: {
    deliverables?: string[];
    priceFrom?: number;
  };
};

type Body = {
  leadId?: string;
};

export async function POST(req: Request) {
  try {
    const user = await requireRequestUser(req, { roles: ["agency_agent"] });
    const body = (await req.json()) as Body;
    const leadId = (body.leadId || "").trim();

    if (!leadId) {
      return NextResponse.json({ error: "Campo obrigatorio: leadId." }, { status: 400 });
    }

    const leadRef = adminDb.collection("leads").doc(leadId);
    const leadSnap = await leadRef.get();
    if (!leadSnap.exists) {
      return NextResponse.json({ error: "Lead nao encontrado." }, { status: 404 });
    }

    const lead = leadSnap.data() as LeadDoc;
    const ownerId = lead.ownerId || null;
    const tenantId = lead.tenantId || (await getTenantForCurrentUser(ownerId || user.uid)) || null;
    if (!isAdmin(user) && ownerId !== user.uid) {
      return NextResponse.json({ error: "Sem permissao para converter este lead." }, { status: 403 });
    }

    const clientRef = adminDb.collection("clientes").doc();
    const projectRef = adminDb.collection("projetos").doc();
    const financeRef = adminDb.collection("financeiro").doc();

    const batch = adminDb.batch();

    batch.set(clientRef, {
      name: lead.nome || "Cliente",
      telefone: lead.telefone || "",
      email: lead.email || "",
      endereco: lead.endereco || "",
      origem: lead.origem || "crm",
      status: "ativo",
      notes: lead.notes || "",
      cnpj: lead.cnpj || "",
      instagram: lead.instagram || "",
      linkedin: lead.linkedin || "",
      leadIdOriginal: leadId,
      ownerId,
      owner: lead.owner || null,
      tenantId,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });

    batch.set(projectRef, {
      titulo: `Projeto: ${lead.nome || "Cliente"}`,
      clientId: clientRef.id,
      clientName: lead.nome || "Cliente",
      status: "Onboarding",
      servicos: lead.offer?.deliverables || [],
      valorMensal: Number(lead.offer?.priceFrom || 0),
      ownerId,
      tenantId,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });

    if (Number(lead.offer?.priceFrom || 0) > 0) {
      batch.set(financeRef, {
        clientId: clientRef.id,
        clientName: lead.nome || "Cliente",
        projectId: projectRef.id,
        tipo: "Receita",
        categoria: "Setup",
        status: "pendente",
        valor: Number(lead.offer?.priceFrom || 0),
        referencia: "Setup (CRM)",
        ownerId,
        vendedorId: ownerId,
        payoutStatus: "pendente",
        tenantId,
        createdAt: FieldValue.serverTimestamp(),
      });
    }

    batch.set(
      leadRef,
      {
        status: "qualificado",
        convertedClientId: clientRef.id,
        convertedProjectId: projectRef.id,
        tenantId,
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true }
    );

    await batch.commit();

    await leadRef.collection("events").add({
      type: "conversion",
      title: "Lead convertido em cliente",
      detail: `Cliente ${clientRef.id} e projeto ${projectRef.id} criados.`,
      createdAt: FieldValue.serverTimestamp(),
      actorId: user.uid,
      actorName: user.name,
    });

    return NextResponse.json({
      ok: true,
      leadId,
      clientId: clientRef.id,
      projectId: projectRef.id,
    });
  } catch (error) {
    if (error instanceof RouteAuthError) {
      return NextResponse.json(
        { error: error.message, code: error.code },
        { status: error.status }
      );
    }
    console.error("Erro ao converter lead:", error);
    return NextResponse.json({ error: "Falha ao converter lead." }, { status: 500 });
  }
}

