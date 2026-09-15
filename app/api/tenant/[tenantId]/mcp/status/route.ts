import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/app/lib/server/firebase-admin";
import { requireRequestUser, RouteAuthError } from "@/app/lib/server/route-auth";
import { grantSchema, scopes, tools as mcpTools } from "@/lib/mcp/contracts";
import { endpoint, listMcpConnections, MCP_AUTHORIZE_PATH, MCP_REMOTE_PATH, MCP_TOKEN_PATH } from "@/lib/server/mcp/oauth";
import { assertTenantAccess, assertTenantCapability, TenantAccessError, getTenantSettings } from "@/lib/server/tenant";

type McpBody = {
  enabled?: boolean;
  writeMode?: "disabled" | "draft_only" | "approval_required";
  allowedClients?: string[];
  notes?: string;
};

const CLIENTS = ["codex", "claude", "chatgpt", "cursor", "other"] as const;

function clean(value: unknown, max = 400) {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, max);
}

function parseGrants() {
  const raw = process.env.MCP_READ_GRANTS || "[]";
  try {
    return grantSchema.parse(JSON.parse(raw));
  } catch {
    return null;
  }
}

function parseMcpSettings(value: unknown) {
  const raw = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  const writeMode = clean(raw.writeMode, 40);
  const allowedClients = Array.isArray(raw.allowedClients)
    ? raw.allowedClients.map((item) => clean(item, 40)).filter((item) => CLIENTS.includes(item as (typeof CLIENTS)[number]))
    : [];
  return {
    enabled: raw.enabled === true,
    writeMode:
      writeMode === "draft_only" || writeMode === "approval_required" || writeMode === "disabled"
        ? writeMode
        : "disabled",
    allowedClients,
    notes: clean(raw.notes, 800),
    updatedAt: raw.updatedAt || null,
    updatedByName: clean(raw.updatedByName, 140),
  };
}

function commands(origin: string) {
  const projectPath = "<CAMINHO_DO_PROJETO_ALTUM>";
  const serverPath = `${projectPath}/scripts/mcp/server.ts`;
  return {
    demo: `cd ${projectPath} && npm run mcp:demo`,
    codexLocal: `codex mcp add altum_local --env ALTUM_MCP_BASE_URL=${origin} --env ALTUM_MCP_TOKEN_FILE=<CAMINHO_DO_FIREBASE_ID_TOKEN> -- node --import tsx ${serverPath}`,
    remoteServerUrl: `${origin}/api/mcp/remote`,
    oauthAuthorizeUrl: `${origin}/api/mcp/oauth/authorize`,
    oauthTokenUrl: `${origin}/api/mcp/oauth/token`,
    discoveryAuthorizationServer: `${origin}/.well-known/oauth-authorization-server`,
    discoveryProtectedResource: `${origin}/.well-known/oauth-protected-resource`,
    chatgptWeb: `MCP server URL: ${origin}/api/mcp/remote`,
    claudeDesktop: JSON.stringify(
      {
        mcpServers: {
          altum_local: {
            command: "node",
            args: ["--import", "tsx", serverPath],
            env: {
              ALTUM_MCP_BASE_URL: origin,
              ALTUM_MCP_TOKEN_FILE: "<CAMINHO_DO_FIREBASE_ID_TOKEN>",
            },
          },
        },
      },
      null,
      2
    ),
  };
}

export async function GET(
  req: Request,
  context: { params: Promise<{ tenantId: string }> }
) {
  try {
    const user = await requireRequestUser(req);
    const { tenantId } = await context.params;
    const membership = await assertTenantAccess(user.uid, tenantId);
    assertTenantCapability(membership, "manage_settings");

    const [settings, connections] = await Promise.all([
      getTenantSettings(tenantId),
      listMcpConnections(tenantId),
    ]);
    const tenantMcp = parseMcpSettings(settings?.mcp);
    const grants = parseGrants();
    const now = Date.now();
    const activeTenantGrants = grants
      ? grants.filter((grant) => grant.tenantId === tenantId && Date.parse(grant.expiresAt) > now)
      : [];
    const currentUserGrant = activeTenantGrants.find((grant) => grant.userId === user.uid) || null;
    const origin = clean(process.env.ALTUM_PUBLIC_URL || process.env.NEXT_PUBLIC_APP_URL || process.env.ALTUM_MCP_BASE_URL, 220) || new URL(req.url).origin;
    const secretReady = (process.env.MCP_CONTEXT_SECRET || "").length >= 32;
    const routeEnabled = process.env.ALTUM_MCP_ENABLED === "true";
    const definitions = Object.values(mcpTools);
    const readTools = definitions.filter((definition) => definition.risk === "READ").length;
    const draftTools = definitions.filter((definition) => definition.risk === "DRAFT").length;

    return NextResponse.json({
      ok: true,
      tenantId,
      mcp: tenantMcp,
      runtime: {
        localReadEnabled: routeEnabled && secretReady && Boolean(currentUserGrant),
        routeEnabled,
        contextSecretConfigured: secretReady,
        grantsConfigured: grants !== null,
        activeTenantGrantCount: activeTenantGrants.length,
        currentUserGranted: Boolean(currentUserGrant),
        currentUserScopes: currentUserGrant?.scopes || [],
        requiredReadScopes: scopes,
        baseUrl: origin,
      },
      capabilities: {
        totalTools: definitions.length,
        readTools,
        draftTools,
        writeTools: tenantMcp.writeMode === "approval_required" ? "supervised_with_approval" : "disabled",
        remoteMcp: routeEnabled && secretReady && tenantMcp.enabled ? "ready_for_oauth_clients" : "configure_environment",
      },
      commands: commands(origin),
      connections,
      nextSteps: [
        routeEnabled ? "Rota interna MCP ligada." : "Ative ALTUM_MCP_ENABLED=true no ambiente.",
        secretReady ? "Segredo MCP configurado." : "Configure MCP_CONTEXT_SECRET com pelo menos 32 caracteres.",
        currentUserGrant ? "Usuario atual possui grant para MCP local." : "Opcional para Codex/Claude local: inclua este usuario e tenant em MCP_READ_GRANTS.",
        `ChatGPT web: use ${endpoint(req, MCP_REMOTE_PATH)} como URL remota do MCP.`,
        `OAuth: authorize=${endpoint(req, MCP_AUTHORIZE_PATH)} token=${endpoint(req, MCP_TOKEN_PATH)}.`,
      ],
    });
  } catch (error) {
    if (error instanceof RouteAuthError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    }
    if (error instanceof TenantAccessError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: 403 });
    }
    console.error("Erro ao carregar status MCP:", error);
    return NextResponse.json({ error: "Falha ao carregar status MCP." }, { status: 500 });
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

    const body = (await req.json().catch(() => ({}))) as McpBody;
    const writeMode =
      body.writeMode === "draft_only" || body.writeMode === "approval_required" || body.writeMode === "disabled"
        ? body.writeMode
        : "disabled";
    const allowedClients = Array.isArray(body.allowedClients)
      ? Array.from(new Set(body.allowedClients.map((item) => clean(item, 40)).filter((item) => CLIENTS.includes(item as (typeof CLIENTS)[number]))))
      : [];
    const patch = {
      tenantId,
      mcp: {
        enabled: body.enabled === true,
        writeMode,
        allowedClients,
        notes: clean(body.notes, 800),
        updatedAt: FieldValue.serverTimestamp(),
        updatedBy: user.uid,
        updatedByName: user.name,
      },
      updatedAt: FieldValue.serverTimestamp(),
      updatedBy: user.uid,
      updatedByName: user.name,
    };

    await Promise.all([
      adminDb.collection("tenant_settings").doc(tenantId).set(patch, { merge: true }),
      adminDb.collection("audit_logs").add({
        type: "tenant_mcp_policy_update",
        actorId: user.uid,
        actorName: user.name,
        tenantId,
        enabled: patch.mcp.enabled,
        writeMode,
        allowedClients,
        createdAt: FieldValue.serverTimestamp(),
      }),
    ]);

    return NextResponse.json({ ok: true, tenantId, mcp: { enabled: patch.mcp.enabled, writeMode, allowedClients, notes: patch.mcp.notes } });
  } catch (error) {
    if (error instanceof RouteAuthError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    }
    if (error instanceof TenantAccessError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: 403 });
    }
    console.error("Erro ao salvar politica MCP:", error);
    return NextResponse.json({ error: "Falha ao salvar politica MCP." }, { status: 500 });
  }
}
