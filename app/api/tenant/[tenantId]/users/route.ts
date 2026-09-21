import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { adminAuth, adminDb } from "@/app/lib/server/firebase-admin";
import { requireRequestUser, RouteAuthError } from "@/app/lib/server/route-auth";
import { sendPasswordResetEmail, AuthEmailConfigurationError, AuthEmailDeliveryError } from "@/lib/server/auth-email";
import { assertTenantAccess, assertTenantCapability, assertTenantRole, getTenantCapabilities, TenantAccessError, TENANT_CAPABILITIES, type TenantCapability, type TenantUserRole } from "@/lib/server/tenant";
import { assertTenantLimitAvailable } from "@/lib/server/tenant-entitlements";
import { getTenantUserUsage } from "@/lib/server/tenant-usage";

type Body = {
  email?: string;
  name?: string;
  role?: "client_admin" | "client_agent" | "client_viewer";
  team?: string;
  availability?: "online" | "busy" | "offline";
  allowedChannels?: string[] | string;
  maxOpenChats?: number;
  capabilities?: TenantCapability[] | string;
  accessProfile?: string;
};
type TenantUserItem = {
  id: string;
  name?: string;
  email?: string;
  [key: string]: unknown;
};

const ALLOWED_ROLES = new Set(["client_admin", "client_agent", "client_viewer"]);
const AUTH_USER_NOT_FOUND_CODE = "auth/user-not-found";

function shouldPreserveGlobalRole(role: unknown) {
  return (
    role === "admin" ||
    role === "closer" ||
    role === "sdr" ||
    role === "agency_owner" ||
    role === "agency_admin" ||
    role === "agency_agent"
  );
}

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

function normalizeRole(value: unknown): Body["role"] {
  const role = clean(value, 40).toLowerCase();
  if (ALLOWED_ROLES.has(role)) return role as Body["role"];
  return "client_viewer";
}

function defaultCapabilitiesForRole(role: TenantUserRole) {
  return getTenantCapabilities({ role, status: "active", capabilities: [], capabilitiesConfigured: false });
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

function getErrorCode(error: unknown) {
  const code =
    typeof error === "object" && error && "code" in error
      ? String((error as { code?: unknown }).code || "").trim().toLowerCase()
      : "";
  return code;
}

function getErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  return String(error || "");
}

function getSafeSiteUrl(req: Request) {
  const fromEnv = clean(process.env.NEXT_PUBLIC_SITE_URL, 240).replace(/\/+$/, "");
  if (fromEnv.startsWith("http://") || fromEnv.startsWith("https://")) {
    return fromEnv;
  }

  try {
    const origin = new URL(req.url).origin;
    if (origin.startsWith("http://") || origin.startsWith("https://")) {
      return origin.replace(/\/+$/, "");
    }
  } catch {}

  return "https://altum.ag";
}

function isValidEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

async function generateInviteLinkWithFallback(input: { req: Request; email: string }) {
  const siteUrl = getSafeSiteUrl(input.req);
  const redirectUrl = `${siteUrl}/cliente/login`;

  try {
    const inviteLink = await adminAuth.generatePasswordResetLink(input.email, { url: redirectUrl });
    return {
      inviteLink,
      inviteLinkWarning: null as string | null,
    };
  } catch (error) {
    const code = getErrorCode(error);
    const reason = code || getErrorMessage(error) || "unknown_error";
    console.warn("Falha ao gerar inviteLink com redirect. Tentando fallback sem redirect.", { reason, redirectUrl });

    try {
      const inviteLink = await adminAuth.generatePasswordResetLink(input.email);
      return {
        inviteLink,
        inviteLinkWarning: "link_sem_redirect_personalizado",
      };
    } catch (fallbackError) {
      const fallbackCode = getErrorCode(fallbackError);
      const fallbackReason = fallbackCode || getErrorMessage(fallbackError) || "unknown_error";
      throw new Error(`invite_link_generation_failed:${fallbackReason}`);
    }
  }
}

export async function GET(
  req: Request,
  context: { params: Promise<{ tenantId: string }> }
) {
  try {
    const user = await requireRequestUser(req);
    const { tenantId } = await context.params;
    const membership = await assertTenantAccess(user.uid, tenantId);
    assertTenantRole(membership, "client_viewer");

    const snap = await adminDb.collection("tenant_users").where("tenantId", "==", tenantId).limit(80).get();
    const items: TenantUserItem[] = snap.docs
      .map((doc): TenantUserItem => {
        const data = doc.data() as Record<string, unknown>;
        const role = clean(data.role, 40).toLowerCase() as TenantUserRole;
        const status = data.status === "blocked" ? "blocked" : "active";
        const capabilities = parseCapabilities(data.capabilities);
        return {
          id: doc.id,
          ...data,
          status,
          capabilities: getTenantCapabilities({
            role,
            status,
            capabilities,
            capabilitiesConfigured: Object.prototype.hasOwnProperty.call(data, "capabilities"),
          }),
        };
      })
      .sort((a, b) => String(a.name || a.email || "").localeCompare(String(b.name || b.email || ""), "pt-BR"));

    return NextResponse.json({ ok: true, tenantId, items });
  } catch (error) {
    if (error instanceof RouteAuthError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    }
    if (error instanceof TenantAccessError) {
      return NextResponse.json(
        { error: error.message, code: error.code },
        { status: error.code === "tenant_limit_exceeded" ? 409 : 403 }
      );
    }
    console.error("Erro ao listar usuarios do tenant:", error);
    return NextResponse.json({ error: "Falha ao listar usuarios." }, { status: 500 });
  }
}

export async function POST(
  req: Request,
  context: { params: Promise<{ tenantId: string }> }
) {
  try {
    const actor = await requireRequestUser(req);
    const { tenantId } = await context.params;
    const membership = await assertTenantAccess(actor.uid, tenantId);
    assertTenantCapability(membership, "manage_users");

    const body = (await req.json()) as Body;
    const email = clean(body.email, 180).toLowerCase();
    const name = clean(body.name, 140);
    const role = normalizeRole(body.role);
    const team = clean(body.team, 80);
    const availability = normalizeAvailability(body.availability);
    const allowedChannels = parseChannels(body.allowedChannels);
    const maxOpenChats = normalizeMaxOpenChats(body.maxOpenChats);
    const capabilities = parseCapabilities(body.capabilities);
    const accessProfile = clean(body.accessProfile, 40).toLowerCase();

    if (!email) {
      return NextResponse.json({ error: "Campo obrigatorio: email." }, { status: 400 });
    }
    if (!isValidEmail(email)) {
      return NextResponse.json({ error: "Informe um e-mail valido." }, { status: 400 });
    }

    const tenantUserUsage = await getTenantUserUsage(tenantId);
    if (!tenantUserUsage.hasActiveEmail(email)) {
      await assertTenantLimitAvailable({
        tenantId,
        limitId: "users",
        currentUsage: tenantUserUsage.activeClientUsers,
        increment: 1,
      });
    }

    const tenantSnap = await adminDb.collection("tenants").doc(tenantId).get();
    if (!tenantSnap.exists) {
      return NextResponse.json({ error: "Tenant nao encontrado." }, { status: 404 });
    }

    const tenantData = tenantSnap.data() as { name?: string; legacyClientId?: string };
    const tenantName = tenantData.name || "Cliente";
    const legacyClientId = clean(tenantData.legacyClientId, 120) || tenantId;

    let authUser;
    let createdAuthUser = false;
    try {
      authUser = await adminAuth.getUserByEmail(email);
    } catch (error) {
      if (getErrorCode(error) !== AUTH_USER_NOT_FOUND_CODE) {
        throw error;
      }
      authUser = await adminAuth.createUser({
        email,
        displayName: name || tenantName,
        emailVerified: true,
      });
      createdAuthUser = true;
    }

    const uid = authUser.uid;
    const docId = `${tenantId}_${uid}`;
    const membershipRef = adminDb.collection("tenant_users").doc(docId);
    const membershipSnap = await membershipRef.get();
    const existingMembership = membershipSnap.exists ? (membershipSnap.data() as Record<string, unknown>) : null;
    if (existingMembership?.role === "client_owner") {
      return NextResponse.json({ error: "O dono da conta nao pode ser sobrescrito por convite." }, { status: 403 });
    }

    if (existingMembership) {
      return NextResponse.json({ error: "Esta pessoa ja faz parte da equipe. Altere o perfil ou acesso na lista de usuarios.", code: "tenant_user_already_exists" }, { status: 409 });
    }

    const existingUserSnap = await adminDb.collection("users").doc(uid).get();
    const existingUser = existingUserSnap.exists
      ? (existingUserSnap.data() as { role?: string; defaultTenantId?: string; status?: string })
      : null;
    const nextGlobalRole = shouldPreserveGlobalRole(existingUser?.role) ? existingUser?.role : role;
    const hasCustomCapabilities = Array.isArray(body.capabilities) || typeof body.capabilities === "string";
    const nextCapabilities = hasCustomCapabilities ? capabilities : defaultCapabilitiesForRole(role as TenantUserRole);

    await membershipRef.set(
      {
        tenantId,
        userId: uid,
        email,
        name: name || authUser.displayName || tenantName,
        role,
        status: "active",
        isDefault: false,
        team,
        availability,
        allowedChannels,
        maxOpenChats,
        capabilities: nextCapabilities,
        accessProfile,
        invitedBy: actor.uid,
        invitedByName: actor.name,
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true }
    );

    await Promise.all([
      adminDb.collection("users").doc(uid).set(
        {
          uid,
          email,
          name: name || authUser.displayName || tenantName,
          role: nextGlobalRole,
          status: existingUser?.status === "blocked" ? "blocked" : "active",
          defaultTenantId:
            existingUser?.defaultTenantId
              ? existingUser.defaultTenantId
              : tenantId,
          updatedAt: FieldValue.serverTimestamp(),
          ...(existingUserSnap.exists ? {} : { createdAt: FieldValue.serverTimestamp() }),
        },
        { merge: true }
      ),
      adminDb.collection("client_portal_users").doc(uid).set(
        {
          uid,
          email,
          name: name || authUser.displayName || tenantName,
          tenantId,
          tenantName,
          clientId: legacyClientId,
          clientName: tenantName,
          role,
          status: "active",
          invitedBy: actor.uid,
          invitedByName: actor.name,
          updatedAt: FieldValue.serverTimestamp(),
          createdAt: FieldValue.serverTimestamp(),
        },
        { merge: true }
      ),
    ]);

    const inviteResult = createdAuthUser
      ? await generateInviteLinkWithFallback({ req, email })
      : { inviteLink: null as string | null, inviteLinkWarning: "usuario_existente_sem_reset" };
    let emailDelivery: "not_sent" | "sent" | "unavailable" | "failed" = createdAuthUser ? "not_sent" : "not_sent";
    if (createdAuthUser) {
      try {
        await sendPasswordResetEmail({ email, name: name || authUser.displayName || tenantName });
        emailDelivery = "sent";
      } catch (deliveryError) {
        emailDelivery =
          deliveryError instanceof AuthEmailConfigurationError
            ? "unavailable"
            : deliveryError instanceof AuthEmailDeliveryError
              ? "failed"
              : "failed";
      }
    }

    return NextResponse.json({
      ok: true,
      tenantId,
      uid,
      email,
      role,
      inviteLink: inviteResult.inviteLink,
      inviteLinkWarning: inviteResult.inviteLinkWarning,
      emailDelivery,
      existingUser: !createdAuthUser,
    });
  } catch (error) {
    if (error instanceof RouteAuthError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    }
    if (error instanceof TenantAccessError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: 403 });
    }
    const reason = getErrorCode(error) || getErrorMessage(error) || "unknown_error";
    console.error("Erro ao convidar usuario do tenant:", { reason, error });
    return NextResponse.json({ error: `Falha ao convidar usuario. Motivo: ${reason}` }, { status: 500 });
  }
}
