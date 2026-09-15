import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/app/lib/server/firebase-admin";
import { requireRequestUser, RouteAuthError } from "@/app/lib/server/route-auth";
import { assertTenantAccess, assertTenantCapability, getTenantCapabilities, TenantAccessError, TENANT_CAPABILITIES, type TenantCapability, type TenantUserRole } from "@/lib/server/tenant";
import { assertTenantLimitAvailable } from "@/lib/server/tenant-entitlements";
import { getTenantUserUsage } from "@/lib/server/tenant-usage";

type Body = {
  role?: "client_admin" | "client_agent" | "client_viewer";
  status?: "active" | "blocked";
  team?: string;
  availability?: "online" | "busy" | "offline";
  allowedChannels?: string[] | string;
  maxOpenChats?: number | null;
  capabilities?: TenantCapability[] | string;
  accessProfile?: string;
};

const ALLOWED_ROLES = new Set(["client_admin", "client_agent", "client_viewer"]);

function clean(value: unknown, max = 180) {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, max);
}

function normalizeAvailability(value: unknown) {
  const availability = clean(value, 20).toLowerCase();
  if (availability === "busy") return "busy";
  if (availability === "offline") return "offline";
  return "online";
}

function parseChannels(value: unknown) {
  const source = Array.isArray(value)
    ? value
    : typeof value === "string"
      ? value.split(",")
      : [];

  return Array.from(
    new Set(
      source
        .map((item) => clean(item, 40).toLowerCase())
        .filter(Boolean)
    )
  ).slice(0, 8);
}

function normalizeMaxOpenChats(value: unknown) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  return Math.min(200, Math.max(1, Math.round(parsed)));
}

function parseCapabilities(value: unknown) {
  const source = Array.isArray(value)
    ? value
    : typeof value === "string"
      ? value.split(",")
      : [];

  return Array.from(
    new Set(
      source
        .map((item) => clean(item, 60).toLowerCase())
        .filter((item): item is TenantCapability => TENANT_CAPABILITIES.includes(item as TenantCapability))
    )
  );
}

function defaultCapabilitiesForRole(role: TenantUserRole) {
  return getTenantCapabilities({ role, status: "active", capabilities: [], capabilitiesConfigured: false });
}

async function getMembership(tenantId: string, userId: string) {
  const ref = adminDb.collection("tenant_users").doc(`${tenantId}_${userId}`);
  const snap = await ref.get();
  if (!snap.exists) {
    throw new RouteAuthError(404, "tenant_user_not_found", "Usuario do tenant nao encontrado.");
  }

  const data = snap.data() as Record<string, unknown>;
  if (String(data.tenantId || "") !== tenantId) {
    throw new RouteAuthError(403, "forbidden_tenant", "Usuario fora do tenant informado.");
  }

  return { ref, data };
}

async function countActiveAdmins(tenantId: string) {
  const snap = await adminDb
    .collection("tenant_users")
    .where("tenantId", "==", tenantId)
    .where("status", "==", "active")
    .limit(80)
    .get();

  return snap.docs.filter((doc) => {
    const data = doc.data() as Record<string, unknown>;
    const role = clean(data.role, 40).toLowerCase();
    return role === "client_owner" || role === "client_admin";
  }).length;
}

export async function PATCH(
  req: Request,
  context: { params: Promise<{ tenantId: string; userId: string }> }
) {
  try {
    const actor = await requireRequestUser(req);
    const { tenantId, userId } = await context.params;
    const membership = await assertTenantAccess(actor.uid, tenantId);
    assertTenantCapability(membership, "manage_users");

    const { ref, data } = await getMembership(tenantId, userId);
    if (String(data.role || "") === "client_owner") {
      return NextResponse.json({ error: "Nao e permitido alterar o owner pelo painel cliente." }, { status: 403 });
    }

    const body = (await req.json()) as Body;
    const nextRole = clean(body.role, 40).toLowerCase();
    const nextStatus = clean(body.status, 20).toLowerCase();
    const currentRole = clean(data.role, 40).toLowerCase();
    const currentStatus = data.status === "blocked" ? "blocked" : "active";

    if (
      actor.uid === userId &&
      (nextStatus === "blocked" || (nextRole && nextRole !== currentRole) || body.capabilities !== undefined)
    ) {
      return NextResponse.json({ error: "Nao e permitido alterar o proprio acesso critico pelo painel." }, { status: 403 });
    }

    const removingAdmin =
      currentStatus === "active" &&
      (currentRole === "client_admin" || currentRole === "client_owner") &&
      (nextStatus === "blocked" || (nextRole && nextRole !== "client_admin"));
    if (removingAdmin && (await countActiveAdmins(tenantId)) <= 1) {
      return NextResponse.json({ error: "A conta precisa manter ao menos um admin ativo." }, { status: 409 });
    }
    if (currentStatus === "blocked" && nextStatus === "active") {
      const email = clean(data.email, 180).toLowerCase();
      const tenantUserUsage = await getTenantUserUsage(tenantId);
      if (!tenantUserUsage.hasActiveEmail(email)) {
        await assertTenantLimitAvailable({
          tenantId,
          limitId: "users",
          currentUsage: tenantUserUsage.activeClientUsers,
          increment: 1,
        });
      }
    }

    const patch: Record<string, unknown> = {
      updatedAt: FieldValue.serverTimestamp(),
      updatedBy: actor.uid,
      updatedByName: actor.name,
    };

    if (nextRole && ALLOWED_ROLES.has(nextRole)) {
      patch.role = nextRole;
      if (body.capabilities === undefined) {
        patch.capabilities = defaultCapabilitiesForRole(nextRole as TenantUserRole);
      }
    }
    if (nextStatus === "active" || nextStatus === "blocked") {
      patch.status = nextStatus;
    }
    if (body.team !== undefined) {
      patch.team = clean(body.team, 80);
    }
    if (body.availability !== undefined) {
      patch.availability = normalizeAvailability(body.availability);
    }
    if (body.allowedChannels !== undefined) {
      patch.allowedChannels = parseChannels(body.allowedChannels);
    }
    if (body.maxOpenChats !== undefined) {
      patch.maxOpenChats = normalizeMaxOpenChats(body.maxOpenChats);
    }
    if (body.capabilities !== undefined) {
      patch.capabilities = parseCapabilities(body.capabilities);
    }
    if (body.accessProfile !== undefined) {
      patch.accessProfile = clean(body.accessProfile, 40).toLowerCase();
    }

    await ref.set(patch, { merge: true });

    return NextResponse.json({ ok: true, tenantId, userId });
  } catch (error) {
    if (error instanceof RouteAuthError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    }
    if (error instanceof TenantAccessError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: 403 });
    }
    console.error("Erro ao atualizar usuario do tenant:", error);
    return NextResponse.json({ error: "Falha ao atualizar usuario." }, { status: 500 });
  }
}
