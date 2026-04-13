import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/app/lib/server/firebase-admin";
import { isAdmin, requireRequestUser, RouteAuthError } from "@/app/lib/server/route-auth";
import { normalizePhoneBR } from "@/app/lib/server/phone";
import { buildLeadAttributionPatch } from "@/lib/server/lead-intake";
import { getTenantForCurrentUser } from "@/lib/server/tenant";

function firstString(...values: unknown[]) {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return "";
}

export async function POST(req: Request) {
  try {
    const user = await requireRequestUser(req, { roles: ["agency_agent"] });
    const body = (await req.json()) as Record<string, unknown>;

    const nome = firstString(body.nome, body.name, body.full_name) || "Lead via Webhook";
    const email = firstString(body.email, body.mail).toLowerCase();
    const telefoneRaw = firstString(body.telefone, body.phone, body.whatsapp, body.celular);
    const origem = firstString(body.origem, body.source) || "webhook_generico";
    const mensagem = firstString(body.mensagem, body.message);

    const utms = {
      utm_source: firstString(body.utm_source, body.utmSource),
      utm_medium: firstString(body.utm_medium, body.utmMedium),
      utm_campaign: firstString(body.utm_campaign, body.utmCampaign),
      utm_content: firstString(body.utm_content, body.utmContent),
      utm_term: firstString(body.utm_term, body.utmTerm),
      gclid: firstString(body.gclid),
      fbclid: firstString(body.fbclid),
      landingPage: firstString(body.landingPage),
      referrer: firstString(body.referrer),
    };

    const dadosExtras = { ...body };
    delete dadosExtras.nome;
    delete dadosExtras.name;
    delete dadosExtras.email;
    delete dadosExtras.mail;
    delete dadosExtras.telefone;
    delete dadosExtras.phone;
    delete dadosExtras.whatsapp;
    delete dadosExtras.origem;
    delete dadosExtras.source;
    delete dadosExtras.mensagem;
    delete dadosExtras.ownerId;
    delete dadosExtras.utm_source;
    delete dadosExtras.utm_medium;
    delete dadosExtras.utm_campaign;
    delete dadosExtras.utm_content;
    delete dadosExtras.utm_term;
    delete dadosExtras.utmSource;
    delete dadosExtras.utmMedium;
    delete dadosExtras.utmCampaign;
    delete dadosExtras.utmContent;
    delete dadosExtras.utmTerm;
    delete dadosExtras.gclid;
    delete dadosExtras.fbclid;
    delete dadosExtras.landingPage;
    delete dadosExtras.referrer;

    if (!telefoneRaw && !email) {
      return NextResponse.json(
        { error: "E obrigatorio enviar telefone ou email para criar um lead." },
        { status: 400 }
      );
    }

    const telefoneLimpo = normalizePhoneBR(telefoneRaw);

    let targetOwnerId: string | null = isAdmin(user) ? null : user.uid;
    if (isAdmin(user) && typeof body.ownerId === "string" && body.ownerId.trim()) {
      targetOwnerId = body.ownerId.trim();
    }
    let tenantId = await getTenantForCurrentUser(targetOwnerId || user.uid);

    // dedupe by phone scoped to tenant
    let existingId: string | null = null;
    let existingData: Record<string, unknown> | null = null;

    if (telefoneLimpo) {
      const snap = await adminDb
        .collection("leads")
        .where("tenantId", "==", tenantId)
        .where("telefone", "==", telefoneLimpo)
        .limit(1)
        .get();
      if (!snap.empty) {
        existingId = snap.docs[0].id;
        existingData = snap.docs[0].data();
      }
    }

    if (!existingId && email) {
      const snap = await adminDb
        .collection("leads")
        .where("tenantId", "==", tenantId)
        .where("email", "==", email)
        .limit(1)
        .get();
      if (!snap.empty) {
        existingId = snap.docs[0].id;
        existingData = snap.docs[0].data();
      }
    }

    if (existingId) {
      const currentOwner = (existingData?.ownerId as string | undefined) || null;
      const currentTenant = (existingData?.tenantId as string | undefined) || null;
      if (!isAdmin(user) && currentOwner && currentOwner !== user.uid) {
        return NextResponse.json(
          { error: "Este lead ja pertence a outro usuario." },
          { status: 403 }
        );
      }

      const leadRef = adminDb.collection("leads").doc(existingId);
      const resolvedOwnerId = currentOwner || targetOwnerId;
      const resolvedTenantId =
        currentTenant || (await getTenantForCurrentUser(resolvedOwnerId || user.uid)) || tenantId || null;
      const attributionState = buildLeadAttributionPatch({
        existingData: existingData ?? {},
        attribution: {
          source: utms.utm_source || origem,
          medium: utms.utm_medium,
          campaign: utms.utm_campaign,
          term: utms.utm_term,
          content: utms.utm_content,
          gclid: utms.gclid,
          fbclid: utms.fbclid,
          landingPage: utms.landingPage,
          referrer: utms.referrer,
          sourceLabel: origem,
          sourceType: "webhook_generico",
          channel: origem,
        },
        sourceLabel: origem,
        channel: origem,
        sourceType: "webhook_generico",
      });

      await leadRef.set(
        {
          updatedAt: FieldValue.serverTimestamp(),
          ownerId: resolvedOwnerId,
          tenantId: resolvedTenantId,
          origem: attributionState.originLabel || origem,
          owner: resolvedOwnerId
            ? (resolvedOwnerId === user.uid ? user.name : (existingData?.owner as string | undefined) || "Time")
            : null,
          email: (existingData?.email as string | undefined) || email,
          nome:
            (existingData?.nome as string | undefined) === "Lead via Webhook"
              ? nome
              : (existingData?.nome as string | undefined) || nome,
          ...dadosExtras,
          ...attributionState.patch,
          lastConversion: {
            origem,
            data: new Date().toISOString(),
            mensagem,
          },
          intelligence: {
            status: "pending",
            trigger: "webhook_reconversion",
            updatedAt: FieldValue.serverTimestamp(),
          },
        },
        { merge: true }
      );

      await leadRef.collection("events").add({
        type: "conversion",
        title: "Reconversao via Site/Typebot",
        detail: `Lead converteu novamente em: ${origem}.`,
        metadata: { ...utms, mensagem },
        createdAt: FieldValue.serverTimestamp(),
      });

      return NextResponse.json({ success: true, action: "updated", id: existingId, ownerId: resolvedOwnerId });
    }

    if (!tenantId) {
      tenantId = await getTenantForCurrentUser(targetOwnerId || user.uid);
    }

    const leadRef = adminDb.collection("leads").doc();
    const attributionState = buildLeadAttributionPatch({
      existingData: {},
      attribution: {
        source: utms.utm_source || origem,
        medium: utms.utm_medium,
        campaign: utms.utm_campaign,
        term: utms.utm_term,
        content: utms.utm_content,
        gclid: utms.gclid,
        fbclid: utms.fbclid,
        landingPage: utms.landingPage,
        referrer: utms.referrer,
        sourceLabel: origem,
        sourceType: "webhook_generico",
        channel: origem,
      },
      sourceLabel: origem,
      channel: origem,
      sourceType: "webhook_generico",
    });
    await leadRef.set({
      nome,
      email,
      telefone: telefoneLimpo,
      origem: attributionState.originLabel || origem,
      status: "novo",
      pipelineStage: "captado",
      kanbanIndex: 0,
      ownerId: targetOwnerId,
      tenantId: tenantId || null,
      owner: targetOwnerId ? user.name : null,
      ...dadosExtras,
      ...attributionState.patch,
      notes: mensagem ? `Msg Inicial: ${mensagem}` : "",
      intelligence: {
        status: "pending",
        trigger: "webhook_create",
        updatedAt: FieldValue.serverTimestamp(),
      },
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });

    await leadRef.collection("events").add({
      type: "system",
      title: "Lead Criado via Webhook",
      detail: `Origem: ${origem}`,
      metadata: utms,
      createdAt: FieldValue.serverTimestamp(),
    });

    return NextResponse.json({ success: true, action: "created", id: leadRef.id, ownerId: targetOwnerId || null }, { status: 201 });
  } catch (error) {
    if (error instanceof RouteAuthError) {
      return NextResponse.json(
        { error: error.message, code: error.code },
        { status: error.status }
      );
    }

    console.error("Erro critico no webhook interno de leads:", error);
    return NextResponse.json(
      {
        error: "Erro interno",
        details:
          typeof error === "object" && error && "message" in error
            ? String((error as { message?: string }).message)
            : "erro desconhecido",
      },
      { status: 500 }
    );
  }
}
