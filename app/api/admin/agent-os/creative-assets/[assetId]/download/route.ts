import { NextResponse } from "next/server";
import { adminDb } from "@/app/lib/server/firebase-admin";
import { requireRequestUser, RouteAuthError } from "@/app/lib/server/route-auth";
import { isApprovedProviderAssetUrl, signedCreativeAssetUrl } from "@/lib/server/agent-os/creative-asset-storage";

function fail(error: unknown) {
  if (error instanceof RouteAuthError) return NextResponse.json({ error: error.message }, { status: error.status });
  console.error("Falha ao abrir resultado criativo:", error);
  return NextResponse.json({ error: "Não foi possível abrir este resultado." }, { status: 500 });
}

export async function GET(request: Request, context: { params: Promise<{ assetId: string }> }) {
  try {
    await requireRequestUser(request, { roles: ["agency_admin"] });
    const { assetId } = await context.params;
    if (!/^[A-Za-z0-9_-]{1,180}$/.test(assetId)) throw new RouteAuthError(400, "asset_invalid", "Resultado inválido.");
    const asset = await adminDb.collection("creative_assets").doc(assetId).get();
    if (!asset.exists) throw new RouteAuthError(404, "asset_missing", "Resultado não encontrado.");
    const type = asset.get("type") === "video" ? "video" : "image";
    const extension = type === "video" ? "mp4" : "png";
    const stored = await signedCreativeAssetUrl(String(asset.get("storagePath") || ""), `resultado-${assetId}.${extension}`);
    if (stored) return NextResponse.redirect(stored);
    const sourceUrl = asset.get("sourceUrl") || asset.get("url");
    if (isApprovedProviderAssetUrl(sourceUrl)) return NextResponse.redirect(String(sourceUrl));
    throw new RouteAuthError(404, "asset_file_missing", "O arquivo deste resultado não está mais disponível.");
  } catch (error) { return fail(error); }
}
