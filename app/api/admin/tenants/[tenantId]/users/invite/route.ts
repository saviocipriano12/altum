import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { adminAuth, adminDb } from "@/app/lib/server/firebase-admin";
import { requireRequestUser, RouteAuthError } from "@/app/lib/server/route-auth";
import { assertTenantLimitAvailable } from "@/lib/server/tenant-entitlements";
import { getTenantUserUsage } from "@/lib/server/tenant-usage";
import { TenantAccessError } from "@/lib/server/tenant";

type Body = {
  email?: string;
  name?: string;
  role?: "client_owner" | "client_admin" | "client_agent" | "client_viewer";
};

const CLIENT_ROLES = new Set(["client_owner", "client_admin", "client_agent", "client_viewer"]);

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

function normalizeClientRole(value: unknown): Body["role"] {
  if (typeof value === "string" && CLIENT_ROLES.has(value)) {
    return value as Body["role"];
  }
  return "client_viewer";
}

export async function POST(
  req: Request,
  context: { params: Promise<{ tenantId: string }> }
) {
  try {
    const actor = await requireRequestUser(req, {
      roles: ["agency_owner", "agency_admin", "agency_agent"],
    });

    const { tenantId: rawTenantId } = await context.params;
    const tenantId = clean(rawTenantId, 140);
    if (!tenantId) {
      return NextResponse.json({ error: "Parametro obrigatorio: tenantId." }, { status: 400 });
    }

    const body = (await req.json()) as Body;
    const email = clean(body.email, 180).toLowerCase();
    const name = clean(body.name, 140);
    const role = normalizeClientRole(body.role);

    if (!email) {
      return NextResponse.json({ error: "Campo obrigatorio: email." }, { status: 400 });
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
    try {
      authUser = await adminAuth.getUserByEmail(email);
      if (name && authUser.displayName !== name) {
        await adminAuth.updateUser(authUser.uid, { displayName: name });
      }
    } catch {
      authUser = await adminAuth.createUser({
        email,
        displayName: name || tenantName,
        emailVerified: true,
      });
    }

    const uid = authUser.uid;
    const existingUserSnap = await adminDb.collection("users").doc(uid).get();
    const existingUser = existingUserSnap.exists
      ? (existingUserSnap.data() as { role?: string; defaultTenantId?: string })
      : null;
    const nextGlobalRole = shouldPreserveGlobalRole(existingUser?.role) ? existingUser?.role : role;

    const existingMemberships = await adminDb
      .collection("tenant_users")
      .where("userId", "==", uid)
      .limit(1)
      .get();

    const batch = adminDb.batch();

    batch.set(
      adminDb.collection("users").doc(uid),
      {
        uid,
        email,
        name: name || authUser.displayName || tenantName,
        role: nextGlobalRole,
        status: "active",
        defaultTenantId:
          shouldPreserveGlobalRole(existingUser?.role) && existingUser?.defaultTenantId
            ? existingUser.defaultTenantId
            : tenantId,
        updatedAt: FieldValue.serverTimestamp(),
        createdAt: FieldValue.serverTimestamp(),
      },
      { merge: true }
    );

    batch.set(
      adminDb.collection("tenant_users").doc(`${tenantId}_${uid}`),
      {
        tenantId,
        userId: uid,
        email,
        name: name || authUser.displayName || tenantName,
        role,
        status: "active",
        isDefault: existingMemberships.empty,
        invitedBy: actor.uid,
        invitedByName: actor.name,
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true }
    );

    // Mantem compatibilidade com o portal legado.
    batch.set(
      adminDb.collection("client_portal_users").doc(uid),
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
    );

    batch.set(adminDb.collection("audit_logs").doc(), {
      type: "tenant_user_invited",
      actorId: actor.uid,
      actorName: actor.name,
      tenantId,
      tenantName,
      portalUid: uid,
      portalEmail: email,
      role,
      createdAt: FieldValue.serverTimestamp(),
    });

    await batch.commit();

    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://altum.ag";
    const inviteLink = await adminAuth.generatePasswordResetLink(email, {
      url: `${siteUrl}/cliente/login`,
    });

    return NextResponse.json({
      ok: true,
      tenantId,
      uid,
      email,
      role,
      inviteLink,
    });
  } catch (error) {
    if (error instanceof RouteAuthError) {
      return NextResponse.json(
        { error: error.message, code: error.code },
        { status: error.status }
      );
    }
    if (error instanceof TenantAccessError) {
      return NextResponse.json(
        { error: error.message, code: error.code },
        { status: error.code === "tenant_limit_exceeded" ? 409 : 403 }
      );
    }
    console.error("Erro ao convidar usuario do tenant:", error);
    return NextResponse.json({ error: "Falha ao convidar usuario do tenant." }, { status: 500 });
  }
}
