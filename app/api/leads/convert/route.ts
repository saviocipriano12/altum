import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/app/lib/server/firebase-admin";
import { isAdmin, requireRequestUser, RouteAuthError } from "@/app/lib/server/route-auth";

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
  convertedClientId?: string;
  convertedProjectId?: string;
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
    const leadId = typeof body.leadId === "string" ? body.leadId.trim() : "";

    if (!/^[A-Za-z0-9_-]{1,180}$/.test(leadId)) {
      return NextResponse.json({ error: "Campo obrigatorio: leadId." }, { status: 400 });
    }

    const leadRef = adminDb.collection("leads").doc(leadId);
    const clientRef = adminDb.collection("clientes").doc();
    const projectRef = adminDb.collection("projetos").doc();
    const financeRef = adminDb.collection("financeiro").doc();
    const eventRef = leadRef.collection("events").doc("commercial_conversion");
    const result = await adminDb.runTransaction(async (batch) => {
    const leadSnap = await batch.get(leadRef);
    if (!leadSnap.exists) {
      throw new RouteAuthError(404, "lead_not_found", "Lead não encontrado.");
    }

    const lead = leadSnap.data() as LeadDoc;
    const ownerId = lead.ownerId || null;
    const sourceTenantId = lead.tenantId || null;
    if (!isAdmin(user) && ownerId !== user.uid) {
      throw new RouteAuthError(403, "lead_access_denied", "Sem permissão para converter este lead.");
    }

    if (lead.convertedClientId) {
      return { clientId: lead.convertedClientId, projectId: lead.convertedProjectId || null, reused: true };
    }

    batch.set(clientRef, {
      name: lead.nome || "Cliente",
      telefone: lead.telefone || "",
      phone: lead.telefone || "",
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
      sourceTenantId,
      tenantId: null,
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
      sourceTenantId,
      tenantId: null,
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
        sourceTenantId,
        tenantId: null,
        descricao: `Setup - ${lead.nome || "Cliente"}`,
        createdAt: FieldValue.serverTimestamp(),
      });
    }

    batch.set(
      leadRef,
      {
        status: "qualificado",
        convertedClientId: clientRef.id,
        convertedProjectId: projectRef.id,
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true }
    );

    batch.set(eventRef, {
      type: "conversion",
      title: "Lead convertido em cliente",
      detail: `Cliente ${clientRef.id} e projeto ${projectRef.id} criados.`,
      createdAt: FieldValue.serverTimestamp(),
      actorId: user.uid,
      actorName: user.name,
    });
    return { clientId: clientRef.id, projectId: projectRef.id, reused: false };
    });
    return NextResponse.json({
      ok: true,
      leadId,
      ...result,
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

