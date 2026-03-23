import { NextResponse } from "next/server";

export async function POST() {
  return NextResponse.json(
    {
      error:
        "Fluxo legado desativado. Use /api/admin/tenants/[tenantId]/users/invite para convidar usuarios do portal.",
      code: "legacy_invite_route_disabled",
    },
    { status: 410 }
  );
}
