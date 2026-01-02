import { NextResponse } from "next/server";

type Body = {
  nicho: string;
  cidade: string;
  servico: string;
  limit?: number;
  includePhone?: boolean;
};

const PLACES_KEY = process.env.GOOGLE_PLACES_API_KEY;

function pickCategory(types?: string[]) {
  if (!types?.length) return "";
  // pega um tipo “mais humano”
  const ignore = new Set([
    "point_of_interest",
    "establishment",
    "store",
    "food",
    "route",
    "political",
    "geocode",
  ]);
  const filtered = types.filter((t) => !ignore.has(t));
  return (filtered[0] || types[0] || "").replaceAll("_", " ");
}

async function textSearch(query: string) {
  const url = new URL("https://maps.googleapis.com/maps/api/place/textsearch/json");
  url.searchParams.set("query", query);
  url.searchParams.set("key", PLACES_KEY || "");
  url.searchParams.set("language", "pt-BR");
  url.searchParams.set("region", "br");

  const res = await fetch(url.toString(), { method: "GET" });
  const data = await res.json();
  return data;
}

async function placeDetails(placeId: string) {
  const url = new URL("https://maps.googleapis.com/maps/api/place/details/json");
  url.searchParams.set("place_id", placeId);
  url.searchParams.set("key", PLACES_KEY || "");
  url.searchParams.set("language", "pt-BR");
  // telefone + website (email não vem na API)
  url.searchParams.set("fields", "formatted_phone_number,international_phone_number,website");

  const res = await fetch(url.toString(), { method: "GET" });
  const data = await res.json();
  return data;
}

export async function POST(req: Request) {
  try {
    if (!PLACES_KEY) {
      return NextResponse.json(
        { error: "GOOGLE_PLACES_API_KEY não configurada no .env.local" },
        { status: 500 }
      );
    }

    const body = (await req.json()) as Body;
    const nicho = (body.nicho || "").trim();
    const cidade = (body.cidade || "").trim();
    const servico = (body.servico || "").trim();
    const limit = Math.max(1, Math.min(20, Number(body.limit) || 15));
    const includePhone = Boolean(body.includePhone);

    if (!nicho || !cidade || !servico) {
      return NextResponse.json(
        { error: "Campos obrigatórios: nicho, cidade, servico." },
        { status: 400 }
      );
    }

    const query = `${servico} ${nicho} ${cidade}`.replace(/\s+/g, " ").trim();

    const search = await textSearch(query);

    if (search?.status !== "OK" && search?.status !== "ZERO_RESULTS") {
      return NextResponse.json(
        { error: `Google Places retornou status: ${search?.status || "desconhecido"}` },
        { status: 400 }
      );
    }

    const results: any[] = Array.isArray(search?.results) ? search.results : [];
    const sliced = results.slice(0, limit);

    // Enriquecer com telefone: só para alguns itens (evitar consumo absurdo)
    const detailsLimit = includePhone ? Math.min(10, sliced.length) : 0;

    const leads = await Promise.all(
      sliced.map(async (r, idx) => {
        const placeId = r?.place_id as string;
        const nome = r?.name as string;

        const base = {
          placeId,
          nome: nome || "Lead sem nome",
          endereco: r?.formatted_address || r?.vicinity || "",
          categoria: pickCategory(r?.types),
          rating: typeof r?.rating === "number" ? r.rating : undefined,
          userRatingsTotal:
            typeof r?.user_ratings_total === "number" ? r.user_ratings_total : undefined,
          origem: "google_places",
          telefone: "",
          website: "",
        };

        if (!includePhone || idx >= detailsLimit || !placeId) return base;

        try {
          const det = await placeDetails(placeId);
          const phone =
            det?.result?.formatted_phone_number ||
            det?.result?.international_phone_number ||
            "";
          const website = det?.result?.website || "";
          return { ...base, telefone: phone, website };
        } catch {
          return base;
        }
      })
    );

    // remove itens sem placeId
    const cleaned = leads.filter((l) => l.placeId);

    return NextResponse.json({ query, leads: cleaned });
  } catch (e: any) {
    console.error(e);
    return NextResponse.json(
      { error: "Erro interno na API de prospecção." },
      { status: 500 }
    );
  }
}
