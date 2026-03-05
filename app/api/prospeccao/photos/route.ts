import { NextResponse } from "next/server";
import { requireRequestUser, RouteAuthError } from "@/app/lib/server/route-auth";

const PLACES_KEY = process.env.GOOGLE_PLACES_API_KEY;

function clean(value: string | null, max = 800) {
  return (value || "").trim().slice(0, max);
}

function cleanWidth(value: string | null) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 900;
  return Math.max(120, Math.min(1600, Math.round(parsed)));
}

export async function GET(req: Request) {
  try {
    await requireRequestUser(req);

    if (!PLACES_KEY) {
      return NextResponse.json(
        { error: "GOOGLE_PLACES_API_KEY nao configurada no servidor." },
        { status: 500 }
      );
    }

    const { searchParams } = new URL(req.url);
    const ref = clean(searchParams.get("ref"), 500);
    const maxWidth = cleanWidth(searchParams.get("maxWidth"));

    if (!ref) {
      return NextResponse.json(
        { error: "Parametro obrigatorio: ref." },
        { status: 400 }
      );
    }

    const photoUrl = new URL("https://maps.googleapis.com/maps/api/place/photo");
    photoUrl.searchParams.set("photo_reference", ref);
    photoUrl.searchParams.set("maxwidth", String(maxWidth));
    photoUrl.searchParams.set("key", PLACES_KEY);

    const response = await fetch(photoUrl.toString(), {
      method: "GET",
      redirect: "follow",
      cache: "force-cache",
    });

    if (!response.ok) {
      return NextResponse.json(
        { error: `Falha ao obter foto (status ${response.status}).` },
        { status: 502 }
      );
    }

    const contentType = response.headers.get("content-type") || "image/jpeg";
    const imageBuffer = await response.arrayBuffer();

    return new NextResponse(imageBuffer, {
      status: 200,
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "private, max-age=86400, stale-while-revalidate=3600",
      },
    });
  } catch (error) {
    if (error instanceof RouteAuthError) {
      return NextResponse.json(
        { error: error.message, code: error.code },
        { status: error.status }
      );
    }
    console.error("Erro em /api/prospeccao/photos:", error);
    return NextResponse.json({ error: "Falha ao resolver foto." }, { status: 500 });
  }
}
