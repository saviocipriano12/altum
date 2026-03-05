import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/app/lib/server/firebase-admin";
import { isAdmin, requireRequestUser, RouteAuthError } from "@/app/lib/server/route-auth";
import { normalizePhoneBR } from "@/app/lib/server/phone";

type Body = {
  leadId?: string;
  sourceId?: string;
  sourceType?: string;
  ownerId?: string;
  owner?: string;
  nome?: string;
  email?: string;
  telefone?: string;
  endereco?: string;
  website?: string;
  cnpj?: string;
  instagram?: string;
  linkedin?: string;
  categoria?: string;
  origem?: string;
  stage?: string;
  status?: "novo" | "contatado" | "respondido" | "qualificado" | "descartado";
  pipelineStage?: string;
  kanbanIndex?: number;
  notes?: string;
  priority?: string;
  score?: number;
  heat?: string;
  reasons?: string[];
  foiResgatado?: boolean;
  rating?: number;
  userRatingsTotal?: number;
  lat?: number;
  lng?: number;
  priceLevel?: number;
  isOpenNow?: boolean;
  photos?: string[];
  autoIntelligence?: boolean;
};

function clean(value: unknown, max = 240) {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, max);
}

function cleanOptional(value: unknown, max = 240) {
  const text = clean(value, max);
  return text || undefined;
}

function cleanLeadId(value: unknown) {
  const id = clean(value, 180).replace(/\//g, "_");
  return id || undefined;
}

function cleanNumber(value: unknown) {
  const n = Number(value);
  return Number.isFinite(n) ? n : undefined;
}

function cleanStringArray(value: unknown, maxItems = 30, maxItemLen = 220) {
  if (!Array.isArray(value)) return undefined;
  return value
    .map((item) => clean(item, maxItemLen))
    .filter(Boolean)
    .slice(0, maxItems);
}

function removeUndefinedFields<T extends Record<string, unknown>>(obj: T): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(obj).filter(([, value]) => typeof value !== "undefined")
  );
}

export async function POST(req: Request) {
  try {
    const user = await requireRequestUser(req);
    const body = (await req.json()) as Body;

    const nome = clean(body.nome, 180);
    const email = clean(body.email, 180).toLowerCase();
    const telefone = normalizePhoneBR(clean(body.telefone, 40));
    const sourceType = clean(body.sourceType, 80).toLowerCase();

    if (sourceType.includes("google_places") && !telefone) {
      return NextResponse.json(
        { error: "Leads do Google Places exigem telefone valido." },
        { status: 400 }
      );
    }

    if (!nome && !email && !telefone) {
      return NextResponse.json(
        { error: "Informe nome, telefone ou email para criar o lead." },
        { status: 400 }
      );
    }
    const resolvedNome = nome || "Lead sem nome";

    let ownerId: string | null = isAdmin(user) ? null : user.uid;
    let ownerName: string | null = isAdmin(user) ? null : user.name;
    if (isAdmin(user) && body.ownerId) {
      const targetOwnerId = clean(body.ownerId, 140);
      if (targetOwnerId) {
        const ownerSnap = await adminDb.collection("users").doc(targetOwnerId).get();
        if (ownerSnap.exists) {
          const ownerData = ownerSnap.data() as { name?: string };
          ownerId = targetOwnerId;
          ownerName = ownerData.name || ownerName;
        }
      }
    }

    const requestedLeadId = cleanLeadId(body.leadId) || cleanLeadId(body.sourceId);
    const leadRef = requestedLeadId
      ? adminDb.collection("leads").doc(requestedLeadId)
      : adminDb.collection("leads").doc();

    const existingSnap = await leadRef.get();
    if (existingSnap.exists) {
      const existing = existingSnap.data() as { ownerId?: string };
      const currentOwnerId = clean(existing.ownerId, 140);
      if (!isAdmin(user) && currentOwnerId && currentOwnerId !== user.uid) {
        return NextResponse.json(
          { error: "Sem permissao para atualizar este lead." },
          { status: 403 }
        );
      }
      ownerId = currentOwnerId || ownerId;
      ownerName = currentOwnerId ? (clean(body.owner, 140) || ownerName) : null;
    }

    const payload: Record<string, unknown> = {
      nome: resolvedNome,
      email,
      telefone,
      endereco: cleanOptional(body.endereco),
      website: cleanOptional(body.website, 300),
      cnpj: cleanOptional(body.cnpj, 40),
      instagram: cleanOptional(body.instagram, 140),
      linkedin: cleanOptional(body.linkedin, 280),
      categoria: cleanOptional(body.categoria, 120),
      origem: clean(body.origem, 140) || "manual",
      stage: cleanOptional(body.stage, 80),
      status: clean(body.status, 80) || "novo",
      pipelineStage: clean(body.pipelineStage, 80) || "captado",
      kanbanIndex: cleanNumber(body.kanbanIndex) ?? 0,
      notes: cleanOptional(body.notes, 4000),
      priority: cleanOptional(body.priority, 40),
      sourceId: cleanLeadId(body.sourceId),
      sourceType: cleanOptional(body.sourceType, 80),
      placeId:
        (clean(body.sourceType, 80) || "").toLowerCase().includes("google")
          ? cleanLeadId(body.sourceId)
          : undefined,
      score: cleanNumber(body.score),
      heat: cleanOptional(body.heat, 20),
      reasons: cleanStringArray(body.reasons, 20, 180),
      foiResgatado: Boolean(body.foiResgatado),
      rating: cleanNumber(body.rating),
      userRatingsTotal: cleanNumber(body.userRatingsTotal),
      lat: cleanNumber(body.lat),
      lng: cleanNumber(body.lng),
      priceLevel: cleanNumber(body.priceLevel),
      isOpenNow: typeof body.isOpenNow === "boolean" ? body.isOpenNow : undefined,
      photos: cleanStringArray(body.photos, 20, 600),
      ownerId,
      owner: ownerId ? ownerName : null,
      updatedAt: FieldValue.serverTimestamp(),
    };

    if (!existingSnap.exists) {
      payload.createdAt = FieldValue.serverTimestamp();
      payload.intelligence = {
        status: body.autoIntelligence === false ? "disabled" : "pending",
        trigger: clean(body.sourceType, 80) || "lead_create",
        updatedAt: FieldValue.serverTimestamp(),
      };
    }

    await leadRef.set(removeUndefinedFields(payload), { merge: true });

    if (!existingSnap.exists) {
      await leadRef.collection("events").add({
        type: "system",
        title: "Lead criado",
        detail: "Lead registrado pela plataforma.",
        createdAt: FieldValue.serverTimestamp(),
      });
    }

    return NextResponse.json({
      ok: true,
      id: leadRef.id,
      action: existingSnap.exists ? "updated" : "created",
    });
  } catch (error) {
    if (error instanceof RouteAuthError) {
      return NextResponse.json(
        { error: error.message, code: error.code },
        { status: error.status }
      );
    }
    console.error("Erro ao criar lead:", error);
    return NextResponse.json({ error: "Falha ao salvar lead." }, { status: 500 });
  }
}
