import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/app/lib/server/firebase-admin";
import {
  isAdmin,
  requireRequestUser,
  RouteAuthError,
} from "@/app/lib/server/route-auth";
import { generateLeadIntelligence } from "@/app/lib/server/lead-intelligence";

type Body = {
  leadId?: string;
  force?: boolean;
  trigger?: string;
};

type LeadDoc = {
  nome?: string;
  telefone?: string;
  email?: string;
  endereco?: string;
  website?: string;
  cnpj?: string;
  instagram?: string;
  linkedin?: string;
  categoria?: string;
  origem?: string;
  rating?: number;
  userRatingsTotal?: number;
  notes?: string;
  ownerId?: string | null;
  intelligence?: {
    status?: string;
  };
};

function cleanString(value: unknown, max = 180) {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, max);
}

function stripUndefined<T>(value: T): T {
  if (value instanceof FieldValue) {
    return value;
  }

  if (Array.isArray(value)) {
    return value
      .map((item) => stripUndefined(item))
      .filter((item) => typeof item !== "undefined") as T;
  }

  if (value && typeof value === "object") {
    const obj = value as Record<string, unknown>;
    const result: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(obj)) {
      const cleaned = stripUndefined(item);
      if (typeof cleaned !== "undefined") {
        result[key] = cleaned;
      }
    }
    return result as T;
  }

  return value;
}

export async function POST(req: Request) {
  let leadRef: FirebaseFirestore.DocumentReference | null = null;

  try {
    const user = await requireRequestUser(req);
    const body = (await req.json()) as Body;

    const leadId = cleanString(body.leadId, 140);
    if (!leadId) {
      return NextResponse.json(
        { error: "Campo obrigatorio: leadId." },
        { status: 400 }
      );
    }

    leadRef = adminDb.collection("leads").doc(leadId);
    const leadSnap = await leadRef.get();
    if (!leadSnap.exists) {
      return NextResponse.json({ error: "Lead nao encontrado." }, { status: 404 });
    }

    const leadData = leadSnap.data() as LeadDoc;
    if (!isAdmin(user) && leadData.ownerId && leadData.ownerId !== user.uid) {
      return NextResponse.json(
        { error: "Sem permissao para executar inteligencia neste lead." },
        { status: 403 }
      );
    }

    const status = cleanString(leadData.intelligence?.status, 40);
    const shouldForce = Boolean(body.force);
    if (!shouldForce && status === "processing") {
      return NextResponse.json({
        ok: true,
        leadId,
        skipped: true,
        reason: "already_processing",
      });
    }

    await leadRef.set(
      {
        intelligence: {
          status: "processing",
          trigger: cleanString(body.trigger, 80) || "manual",
          requestedBy: user.uid,
          requestedByName: user.name,
          startedAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
        },
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true }
    );

    const result = await generateLeadIntelligence({
      id: leadId,
      nome: leadData.nome,
      telefone: leadData.telefone,
      email: leadData.email,
      endereco: leadData.endereco,
      website: leadData.website,
      cnpj: leadData.cnpj,
      instagram: leadData.instagram,
      linkedin: leadData.linkedin,
      categoria: leadData.categoria,
      origem: leadData.origem,
      rating: leadData.rating,
      userRatingsTotal: leadData.userRatingsTotal,
      notes: leadData.notes,
    });

    const mergedPatch = stripUndefined({
      intelligence: {
        ...result.intelligence,
        trigger: cleanString(body.trigger, 80) || "manual",
        requestedBy: user.uid,
        requestedByName: user.name,
        updatedAt: FieldValue.serverTimestamp(),
      },
      proposalDraft: {
        ...result.proposalDraft,
        generatedAt: FieldValue.serverTimestamp(),
      },
      updatedAt: FieldValue.serverTimestamp(),
      cnpj:
        cleanString(leadData.cnpj, 40) ||
        cleanString(result.intelligence.cnpjDetected, 40) ||
        undefined,
      instagram:
        cleanString(leadData.instagram, 200) ||
        (result.intelligence.socialLinks.find((item) =>
          item.toLowerCase().includes("instagram.com")
        ) ??
          undefined),
      linkedin:
        cleanString(leadData.linkedin, 220) ||
        (result.intelligence.socialLinks.find((item) =>
          item.toLowerCase().includes("linkedin.com")
        ) ??
          undefined),
      website:
        cleanString(leadData.website, 320) ||
        cleanString(result.intelligence.website, 320) ||
        undefined,
    });

    await leadRef.set(mergedPatch, { merge: true });

    await leadRef.collection("events").add({
      type: "intelligence",
      title: "Pesquisa automatica concluida",
      detail: result.intelligence.summary,
      meta: {
        confidence: result.intelligence.confidence,
        adSignals: result.intelligence.adSignals,
        sources: result.intelligence.sources,
      },
      createdAt: FieldValue.serverTimestamp(),
      actorId: user.uid,
      actorName: user.name,
    });

    return NextResponse.json({
      ok: true,
      leadId,
      intelligence: result.intelligence,
      proposalDraft: result.proposalDraft,
    });
  } catch (error) {
    if (leadRef) {
      const message =
        error && typeof error === "object" && "message" in error
          ? cleanString((error as { message?: string }).message, 240)
          : "Falha interna";

      await leadRef.set(
        {
          intelligence: {
            status: "failed",
            error: message,
            updatedAt: FieldValue.serverTimestamp(),
          },
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true }
      );
    }

    if (error instanceof RouteAuthError) {
      return NextResponse.json(
        { error: error.message, code: error.code },
        { status: error.status }
      );
    }

    console.error("Erro em /api/leads/intelligence/run:", error);
    return NextResponse.json(
      { error: "Falha ao executar inteligencia do lead." },
      { status: 500 }
    );
  }
}
