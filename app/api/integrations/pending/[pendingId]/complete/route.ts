import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { requireRequestUser, RouteAuthError } from "@/app/lib/server/route-auth";
import { assertTenantAccess, assertTenantCapability, TenantAccessError } from "@/lib/server/tenant";
import { readIntegrationPendingSelection } from "@/app/lib/server/integration-pending";
import { finalizeMetaConnection, finalizeGoogleConnection } from "@/app/lib/server/integrations/connect-finalizers";

type Body = {
  selectionId?: string;
};

function clean(value: unknown, max = 260) {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, max);
}

function parseMetaToken(value: string) {
  return {
    access_token: clean(value, 5000),
    token_type: "bearer",
  };
}

export async function POST(req: Request, context: { params: Promise<{ pendingId: string }> }) {
  try {
    const user = await requireRequestUser(req);
    const { pendingId } = await context.params;
    const body = (await req.json().catch(() => ({}))) as Body;
    const selectionId = clean(body.selectionId, 220);
    if (!selectionId) {
      return NextResponse.json({ error: "selectionId obrigatorio." }, { status: 400 });
    }

    const pending = await readIntegrationPendingSelection(pendingId);
    if (!pending) {
      return NextResponse.json({ error: "Selecao pendente nao encontrada ou expirada." }, { status: 404 });
    }
    if (pending.userId !== user.uid) {
      return NextResponse.json({ error: "Selecao pendente pertence a outro usuario." }, { status: 403 });
    }
    const membership = await assertTenantAccess(user.uid, pending.tenantId);
    assertTenantCapability(membership, "manage_channels");

    if (pending.provider === "meta") {
      const graphVersion = clean(process.env.META_GRAPH_VERSION, 20) || "v21.0";
      if (pending.channelType === "meta_ads") {
        const selected = pending.adAccounts.find(
          (item) => item.accountId === selectionId.replace(/[^\d]/g, "") || item.id === selectionId
        );
        if (!selected) {
          return NextResponse.json({ error: "Conta Meta Ads selecionada nao encontrada." }, { status: 400 });
        }
        const finalized = await finalizeMetaConnection({
          tenantId: pending.tenantId,
          userId: pending.userId,
          channelType: "meta_ads",
          adAccount: {
            id: selected.id,
            account_id: selected.accountId,
            name: selected.name,
          },
          token: parseMetaToken(pending.oauthToken),
          scope: pending.oauthScope,
          graphVersion,
        });

        await pending.ref.set(
          {
            status: "completed",
            completedAt: FieldValue.serverTimestamp(),
            updatedAt: FieldValue.serverTimestamp(),
            selectedId: selectionId,
          },
          { merge: true }
        );

        return NextResponse.json({
          ok: true,
          provider: "meta",
          channelType: "meta_ads",
          channelId: finalized.channelId,
          status: finalized.connectionStatus,
          warning: finalized.warning,
          redirectPath: pending.redirectPath,
        });
      }

      const selected = pending.pages.find((item) => item.id === selectionId);
      if (!selected) {
        return NextResponse.json({ error: "Pagina selecionada nao encontrada." }, { status: 400 });
      }
      const finalized = await finalizeMetaConnection({
        tenantId: pending.tenantId,
        userId: pending.userId,
        channelType: pending.channelType as "instagram" | "messenger",
        page: {
          id: selected.id,
          name: selected.name,
          access_token: selected.pageAccessToken,
          instagram_business_account:
            pending.channelType === "instagram"
              ? {
                  id: selected.instagramBusinessId,
                  username: selected.instagramUsername,
                }
              : undefined,
        },
        token: parseMetaToken(pending.oauthToken),
        scope: pending.oauthScope,
        graphVersion,
      });

      await pending.ref.set(
        {
          status: "completed",
          completedAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
          selectedId: selectionId,
        },
        { merge: true }
      );

      return NextResponse.json({
        ok: true,
        provider: "meta",
        channelType: pending.channelType,
        channelId: finalized.channelId,
        status: finalized.connectionStatus,
        warning: finalized.warning,
        redirectPath: pending.redirectPath,
      });
    }

    if (pending.provider === "google") {
      const selected = pending.googleCustomers.find((item) => item.customerId === selectionId.replace(/[^\d]/g, ""));
      if (!selected) {
        return NextResponse.json({ error: "Conta Google Ads selecionada nao encontrada." }, { status: 400 });
      }
      const finalized = await finalizeGoogleConnection({
        tenantId: pending.tenantId,
        userId: pending.userId,
        tokenPayload: {
          access_token: pending.oauthToken,
          refresh_token: pending.oauthRefreshToken,
          scope: pending.oauthScope,
        },
        customerId: selected.customerId,
        customerResourceName: selected.resourceName,
        channelName: selected.label,
      });

      await pending.ref.set(
        {
          status: "completed",
          completedAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
          selectedId: selectionId,
        },
        { merge: true }
      );

      return NextResponse.json({
        ok: true,
        provider: "google",
        channelType: "google_ads",
        channelId: finalized.channelId,
        status: finalized.status,
        warning: finalized.warning,
        redirectPath: pending.redirectPath,
      });
    }

    return NextResponse.json({ error: "Provider pendente nao suportado." }, { status: 400 });
  } catch (error) {
    if (error instanceof RouteAuthError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    }
    if (error instanceof TenantAccessError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: 403 });
    }
    console.error("Erro ao concluir selecao pendente de integracao:", error);
    return NextResponse.json({ error: "Falha ao concluir selecao da integracao." }, { status: 500 });
  }
}
