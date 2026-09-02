import { FieldValue } from "firebase-admin/firestore";
import { NextResponse } from "next/server";
import { adminDb } from "@/app/lib/server/firebase-admin";
import { requireRequestUser, RouteAuthError } from "@/app/lib/server/route-auth";
import { getTenantReadinessSnapshot } from "@/lib/server/tenant-readiness";
import { assertTenantAccess, assertTenantCapability, getTenantSettings, TenantAccessError } from "@/lib/server/tenant";
import { applyBusinessProfileStarterKit } from "@/lib/server/business-profile-provisioning";
import { getBusinessProfile, normalizeBusinessProfileId } from "@/lib/business-profiles";
import { getTenantEntitlements } from "@/lib/server/tenant-entitlements";
import { inferSalesMotion } from "@/lib/sales-journey";

type Body = {
  stepId?: string;
  done?: boolean;
  action?: "save" | "prepare";
  currentStep?: number;
  data?: unknown;
};

const MANUAL_STEP_IDS = new Set(["team_enablement", "incident_runbook_ack", "handoff_drill"]);

function clean(value: unknown, max = 80) {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, max);
}

function record(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function cleanLines(value: unknown, maxItems = 12, maxLength = 180) {
  const items = Array.isArray(value) ? value : typeof value === "string" ? value.split(/\n|;/) : [];
  return items.map((item) => clean(item, maxLength)).filter(Boolean).slice(0, maxItems);
}

function normalizeProductOnboarding(value: unknown) {
  const data = record(value);
  const company = record(data.company);
  const offer = record(data.offer);
  const sales = record(data.sales);
  const imports = record(data.imports);
  const offeringType = clean(offer.offeringType, 20).toLowerCase();
  const serviceStyle = clean(sales.serviceStyle, 30).toLowerCase();
  const salesMotion = clean(sales.salesMotion, 30).toLowerCase();
  const normalizedSalesMotion = ["consultative", "appointment", "store_visit", "assisted_purchase", "direct_checkout", "digital_delivery"].includes(salesMotion)
    ? salesMotion
    : inferSalesMotion({
        lead: {},
        settings: {
          niche: company.segment,
          businessProfileId: company.businessProfileId,
          businessContext: { company, offer, sales },
        },
      });
  return {
    currentStep: Math.max(1, Math.min(6, Number(data.currentStep || 1))),
    company: {
      name: clean(company.name, 180),
      segment: clean(company.segment, 120),
      location: clean(company.location, 240),
      website: clean(company.website, 300),
      instagram: clean(company.instagram, 120),
      description: clean(company.description, 1200),
      audience: clean(company.audience, 500),
      businessHours: clean(company.businessHours, 300),
      toneOfVoice: clean(company.toneOfVoice, 180),
      businessProfileId: normalizeBusinessProfileId(company.businessProfileId),
    },
    offer: {
      offeringType: offeringType === "products" || offeringType === "services" || offeringType === "both" ? offeringType : "both",
      summary: clean(offer.summary, 1000),
      paymentMethods: clean(offer.paymentMethods, 500),
      deliveryPolicy: clean(offer.deliveryPolicy, 700),
      exchangePolicy: clean(offer.exchangePolicy, 700),
      warrantyPolicy: clean(offer.warrantyPolicy, 700),
    },
    sales: {
      salesMotion: normalizedSalesMotion,
      operationNarrative: clean(sales.operationNarrative, 2400),
      salesCycle: clean(sales.salesCycle, 80),
      averageTicket: clean(sales.averageTicket, 80),
      leadSources: cleanLines(sales.leadSources, 12, 100),
      serviceStyle: serviceStyle === "human" || serviceStyle === "ai_assisted" || serviceStyle === "ai_first" ? serviceStyle : "ai_assisted",
      goals: cleanLines(sales.goals, 8, 180),
      commonQuestions: cleanLines(sales.commonQuestions, 20, 300),
      specialRules: cleanLines(sales.specialRules, 20, 300),
    },
    imports: {
      spreadsheet: imports.spreadsheet === true,
      catalog: imports.catalog === true,
      website: imports.website === true,
      ecommerce: imports.ecommerce === true,
    },
  };
}

function faqContent(lines: string[], fallbacks: string[]) {
  const source = lines.length ? lines : fallbacks;
  return source.map((line) => {
    const [question, ...answerParts] = line.split(/\s*(?:\||=>|::)\s*/);
    const answer = clean(answerParts.join(" | "), 500);
    return answer
      ? `Pergunta: ${clean(question, 300)}\nResposta: ${answer}`
      : `Pergunta: ${clean(question, 300)}\nResposta: nao cadastrada. Encaminhar para uma pessoa antes de confirmar.`;
  });
}

function compactLines(items: Array<[string, string]>) {
  return items.filter(([, value]) => value).map(([label, value]) => `${label}: ${value}`).join("\n");
}

async function getProductOnboardingSnapshot(tenantId: string) {
  const [settings, entitlements, channelsSnap, kbSnap, commerceSnap] = await Promise.all([
    getTenantSettings(tenantId),
    getTenantEntitlements(tenantId),
    adminDb.collection("tenant_channels").where("tenantId", "==", tenantId).get(),
    adminDb.collection("kb_docs").where("tenantId", "==", tenantId).get(),
    adminDb.collection("ecommerce_connections").where("tenantId", "==", tenantId).limit(40).get(),
  ]);
  const stored = normalizeProductOnboarding(record(settings?.onboarding).product);
  const state = {
    ...stored,
    company: {
      ...stored.company,
      name: stored.company.name || clean(settings?.name, 180),
      segment: stored.company.segment || clean(settings?.niche, 120),
      location: stored.company.location || clean(settings?.location, 240),
      website: stored.company.website || clean(settings?.website, 300),
      businessHours: stored.company.businessHours || clean(settings?.businessHours, 300),
      businessProfileId: normalizeBusinessProfileId(stored.company.businessProfileId || settings?.businessProfileId),
    },
  };
  const channels = channelsSnap.docs.map((doc) => {
    const item = doc.data() as Record<string, unknown>;
    return {
      id: doc.id,
      type: clean(item.type, 40),
      displayName: clean(item.displayName, 120),
      status: clean(item.status, 40),
      connectionStatus: clean(item.connectionStatus, 40),
    };
  });
  const kbItems = kbSnap.docs.map((doc) => doc.data() as Record<string, unknown>);
  return {
    state,
    status: clean(record(record(settings?.onboarding).product).status, 40) || "in_progress",
    preparedAt: record(record(settings?.onboarding).product).preparedAt || null,
    blueprint: record(settings?.businessBlueprint),
    modules: entitlements.modules,
    channels,
    commerceConnections: commerceSnap.docs.map((doc) => {
      const item = doc.data() as Record<string, unknown>;
      return {
        id: doc.id,
        provider: clean(item.provider, 40),
        status: clean(item.status, 40),
        connectionStatus: clean(item.connectionStatus, 40),
      };
    }),
    imports: {
      catalogItems: kbItems.filter((item) => item.type === "catalog").length,
      knowledgeDocs: kbItems.filter((item) => item.type !== "catalog").length,
    },
  };
}

export async function GET(
  req: Request,
  context: { params: Promise<{ tenantId: string }> }
) {
  try {
    const user = await requireRequestUser(req);
    const { tenantId } = await context.params;
    await assertTenantAccess(user.uid, tenantId);
    const [snapshot, product] = await Promise.all([
      getTenantReadinessSnapshot(tenantId),
      getProductOnboardingSnapshot(tenantId),
    ]);

    return NextResponse.json({
      ok: true,
      tenantId,
      onboarding: snapshot.onboarding,
      summary: snapshot.summary,
      activation: snapshot.activation,
      product,
    });
  } catch (error) {
    if (error instanceof RouteAuthError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    }
    if (error instanceof TenantAccessError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: 403 });
    }
    console.error("Erro ao carregar onboarding do tenant:", error);
    return NextResponse.json({ error: "Falha ao carregar onboarding." }, { status: 500 });
  }
}

export async function POST(
  req: Request,
  context: { params: Promise<{ tenantId: string }> }
) {
  try {
    const user = await requireRequestUser(req);
    const { tenantId } = await context.params;
    const membership = await assertTenantAccess(user.uid, tenantId);
    assertTenantCapability(membership, "manage_settings");

    const body = (await req.json().catch(() => ({}))) as Body;
    if (body.action === "save" || body.action === "prepare") {
      const currentSettings = await getTenantSettings(tenantId);
      const state = normalizeProductOnboarding({ ...record(body.data), currentStep: body.currentStep });
      if (!state.company.name || !state.company.segment) {
        return NextResponse.json({ error: "Informe o nome e o segmento da empresa." }, { status: 400 });
      }
      if (body.action === "prepare" && (!state.company.description || !state.offer.summary)) {
        return NextResponse.json(
          { error: "Antes de preparar, descreva a empresa e resuma o que ela vende." },
          { status: 400 }
        );
      }

      const businessContext = {
        version: 1,
        source: "product_onboarding",
        company: {
          name: state.company.name,
          segment: state.company.segment,
          location: state.company.location,
          website: state.company.website,
          instagram: state.company.instagram,
          description: state.company.description,
          audience: state.company.audience,
          businessHours: state.company.businessHours,
          toneOfVoice: state.company.toneOfVoice,
        },
        offer: { ...state.offer },
        sales: { ...state.sales },
        updatedAt: FieldValue.serverTimestamp(),
        updatedBy: user.uid,
      };

      const basePatch: Record<string, unknown> = {
        tenantId,
        name: state.company.name,
        niche: state.company.segment,
        location: state.company.location,
        website: state.company.website,
        businessHours: state.company.businessHours,
        businessProfileId: state.company.businessProfileId,
        businessContext,
        onboarding: {
          product: {
            state,
            status: body.action === "prepare" ? "preparing" : "in_progress",
            updatedAt: FieldValue.serverTimestamp(),
            updatedBy: user.uid,
            updatedByName: user.name,
          },
        },
        updatedAt: FieldValue.serverTimestamp(),
        updatedBy: user.uid,
        updatedByName: user.name,
      };
      await Promise.all([
        adminDb.collection("tenant_settings").doc(tenantId).set(basePatch, { merge: true }),
        adminDb.collection("tenants").doc(tenantId).set({
          name: state.company.name,
          niche: state.company.segment,
          location: state.company.location,
          website: state.company.website,
          businessProfileId: state.company.businessProfileId,
          updatedAt: FieldValue.serverTimestamp(),
        }, { merge: true }),
      ]);

      if (body.action === "save") {
        return NextResponse.json({ ok: true, tenantId, product: await getProductOnboardingSnapshot(tenantId) });
      }

      const profile = getBusinessProfile(state.company.businessProfileId);
      const starterKit = await applyBusinessProfileStarterKit({
        tenantId,
        businessProfileId: profile.id,
        actorId: user.uid,
        actorName: user.name,
        overwriteExisting: false,
      });
      const currentAi = record(currentSettings?.ai);
      const currentCommercialBrain = record(currentAi.commercialBrain);
      const faqLines = faqContent(state.sales.commonQuestions, profile.ai.mandatoryQuestions);
      const companyContent = compactLines([
        ["Empresa", state.company.name],
        ["Segmento", state.company.segment],
        ["Localizacao e area atendida", state.company.location],
        ["Publico principal", state.company.audience],
        ["Site", state.company.website],
        ["Instagram", state.company.instagram],
        ["Horario de atendimento", state.company.businessHours],
        ["Tom de voz", state.company.toneOfVoice || profile.ai.toneOfVoice],
        ["Descricao", state.company.description || profile.description],
        ["O que vende", state.offer.summary || state.offer.offeringType],
      ]);
      const policiesContent = compactLines([
        ["Formas de pagamento", state.offer.paymentMethods],
        ["Entrega ou prazo de execucao", state.offer.deliveryPolicy],
        ["Trocas e cancelamentos", state.offer.exchangePolicy],
        ["Garantias", state.offer.warrantyPolicy],
        ["Regras especiais", state.sales.specialRules.join("; ")],
      ]);
      const salesContent = compactLines([
        ["Movimento comercial", profile.commercialMotion],
        ["Ciclo de venda", state.sales.salesCycle],
        ["Ticket medio", state.sales.averageTicket],
        ["Origens de lead", state.sales.leadSources.join(", ")],
        ["Objetivos comerciais", state.sales.goals.join("; ")],
        ["Papel da IA", state.sales.serviceStyle],
      ]);
      const safeTenant = tenantId.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 100);
      const knowledgeDocs = [
        {
          id: `onboarding_${safeTenant}_empresa`,
          type: "policy",
          content: companyContent,
          tags: ["onboarding", "empresa", `segmento:${state.company.segment.toLowerCase()}`],
        },
        {
          id: `onboarding_${safeTenant}_politicas`,
          type: "policy",
          content: policiesContent || "Politicas comerciais ainda nao informadas. Confirmar com uma pessoa antes de prometer condicoes.",
          tags: ["onboarding", "politicas", "atendimento"],
        },
        {
          id: `onboarding_${safeTenant}_vendas`,
          type: "playbook",
          content: salesContent,
          tags: ["onboarding", "vendas", "crm"],
        },
        {
          id: `onboarding_${safeTenant}_faq`,
          type: "faq",
          content: faqLines.join("\n\n"),
          tags: ["onboarding", "faq", "atendimento"],
        },
      ];
      const batch = adminDb.batch();
      knowledgeDocs.forEach((doc) => batch.set(adminDb.collection("kb_docs").doc(doc.id), {
        tenantId,
        ...doc,
        onboardingManaged: true,
        useInAi: true,
        updatedAt: FieldValue.serverTimestamp(),
        createdAt: FieldValue.serverTimestamp(),
      }, { merge: true }));
      batch.set(adminDb.collection("tenant_settings").doc(tenantId), {
        onboarding: {
          product: {
            status: "ready",
            preparedAt: FieldValue.serverTimestamp(),
            preparedBy: user.uid,
            preparedByName: user.name,
          },
        },
        ai: {
          ...currentAi,
          businessSummary: clean(currentAi.businessSummary, 1200) || `${state.company.name} atua em ${state.company.segment}. ${state.company.description} Oferta principal: ${state.offer.summary}`,
          objective: clean(currentAi.objective, 400) || profile.ai.objective,
          toneOfVoice: clean(currentAi.toneOfVoice, 180) || state.company.toneOfVoice || profile.ai.toneOfVoice,
          commercialBrain: {
            businessModel: clean(currentCommercialBrain.businessModel, 420) || state.offer.summary,
            idealCustomer: clean(currentCommercialBrain.idealCustomer, 420) || state.company.audience,
            revenuePriorities: clean(currentCommercialBrain.revenuePriorities, 420) || `${state.sales.goals.join("; ")}${state.sales.averageTicket ? `; ticket medio ${state.sales.averageTicket}` : ""}`,
            diagnosisStyle: clean(currentCommercialBrain.diagnosisStyle, 420) || profile.commercialMotion,
            customSolutionPolicy: clean(currentCommercialBrain.customSolutionPolicy, 420) || policiesContent,
            handoffCriteria: clean(currentCommercialBrain.handoffCriteria, 420) || profile.ai.escalationTopics.join("; "),
            proposalStyle: clean(currentCommercialBrain.proposalStyle, 420) || state.offer.paymentMethods,
            followUpStrategy: clean(currentCommercialBrain.followUpStrategy, 420) || `${state.sales.salesCycle}; origens: ${state.sales.leadSources.join(", ")}`,
            forbiddenSalesMoves: clean(currentCommercialBrain.forbiddenSalesMoves, 420) || [...profile.ai.guardrails, ...state.sales.specialRules].join("; "),
          },
          guardrails: Array.isArray(currentAi.guardrails) && currentAi.guardrails.length ? currentAi.guardrails : [...profile.ai.guardrails, ...state.sales.specialRules].slice(0, 20),
          mandatoryQuestions: Array.isArray(currentAi.mandatoryQuestions) && currentAi.mandatoryQuestions.length ? currentAi.mandatoryQuestions : profile.ai.mandatoryQuestions,
          escalationTopics: Array.isArray(currentAi.escalationTopics) && currentAi.escalationTopics.length ? currentAi.escalationTopics : profile.ai.escalationTopics,
        },
        crm: {
          suggestedTags: profile.crm.suggestedTags,
          leadFields: profile.crm.leadFields,
          updatedFromOnboardingAt: FieldValue.serverTimestamp(),
        },
        updatedAt: FieldValue.serverTimestamp(),
      }, { merge: true });
      batch.set(adminDb.collection("audit_logs").doc(), {
        type: "tenant_product_onboarding_prepared",
        tenantId,
        actorId: user.uid,
        actorName: user.name,
        profileId: profile.id,
        before: {
          status: clean(record(record(currentSettings?.onboarding).product).status, 40) || "in_progress",
          businessProfileId: normalizeBusinessProfileId(currentSettings?.businessProfileId),
        },
        after: {
          status: "ready",
          businessProfileId: profile.id,
          knowledgeDocs: knowledgeDocs.length,
        },
        createdAt: FieldValue.serverTimestamp(),
      });
      await batch.commit();

      return NextResponse.json({
        ok: true,
        tenantId,
        product: await getProductOnboardingSnapshot(tenantId),
        preparation: {
          profileId: profile.id,
          pipelineApplied: starterKit.pipelineApplied,
          automationsCreated: starterKit.automationsCreated,
          knowledgeDocsCreated: knowledgeDocs.length,
          organizationalMemoryReady: true,
          suggestedTags: profile.crm.suggestedTags,
          leadFields: profile.crm.leadFields,
        },
      });
    }
    const stepId = clean(body.stepId, 80).toLowerCase();
    const done = body.done === true;

    if (!stepId || !MANUAL_STEP_IDS.has(stepId)) {
      return NextResponse.json(
        { error: "stepId invalido para onboarding manual.", allowed: Array.from(MANUAL_STEP_IDS) },
        { status: 400 }
      );
    }

    const patch: Record<string, unknown> = {
      onboarding: {
        manualAcks: {
          [stepId]: {
            done,
            doneBy: done ? user.uid : null,
            doneByName: done ? user.name : "",
            doneAt: done ? FieldValue.serverTimestamp() : null,
          },
        },
        updatedAt: FieldValue.serverTimestamp(),
        updatedBy: user.uid,
        updatedByName: user.name,
      },
      updatedAt: FieldValue.serverTimestamp(),
      updatedBy: user.uid,
      updatedByName: user.name,
    };

    await adminDb.collection("tenant_settings").doc(tenantId).set(patch, { merge: true });

    const snapshot = await getTenantReadinessSnapshot(tenantId);
    return NextResponse.json({
      ok: true,
      tenantId,
      stepId,
      done,
      onboarding: snapshot.onboarding,
      summary: snapshot.summary,
      activation: snapshot.activation,
    });
  } catch (error) {
    if (error instanceof RouteAuthError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    }
    if (error instanceof TenantAccessError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: 403 });
    }
    console.error("Erro ao atualizar onboarding manual:", error);
    return NextResponse.json({ error: "Falha ao atualizar onboarding." }, { status: 500 });
  }
}
