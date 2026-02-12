import { NextResponse } from "next/server";

/* ==========================================================================
   CONFIGURAÇÕES & TIPOS
   ========================================================================== */
const PLACES_KEY = process.env.GOOGLE_PLACES_API_KEY;

type Body = {
  nicho: string;
  cidade: string;
  servico: string;
  limit?: number;
  includePhone?: boolean; // Agora ignoramos isso para trazer SEMPRE completo
};

/* ==========================================================================
   HELPERS
   ========================================================================== */
function pickCategory(types?: string[]) {
  if (!types?.length) return "";
  // Filtra tipos técnicos do Google para pegar algo legível
  const ignore = new Set([
    "point_of_interest", "establishment", "store", "food", 
    "route", "political", "geocode", "locality"
  ]);
  const filtered = types.filter((t) => !ignore.has(t));
  return (filtered[0] || types[0] || "").replaceAll("_", " ");
}

// Busca inicial (Lista de locais)
async function textSearch(query: string) {
  const url = new URL("https://maps.googleapis.com/maps/api/place/textsearch/json");
  url.searchParams.set("query", query);
  url.searchParams.set("key", PLACES_KEY || "");
  url.searchParams.set("language", "pt-BR");
  url.searchParams.set("region", "br");

  const res = await fetch(url.toString(), { method: "GET" });
  return await res.json();
}

// Busca detalhada (Telefone, Site, Horários, Fotos)
async function placeDetails(placeId: string) {
  const url = new URL("https://maps.googleapis.com/maps/api/place/details/json");
  url.searchParams.set("place_id", placeId);
  url.searchParams.set("key", PLACES_KEY || "");
  url.searchParams.set("language", "pt-BR");
  
  // 🔥 AQUI ESTÁ A MÁGICA: Pedimos TODOS os campos ricos para a IA usar depois
  url.searchParams.set(
    "fields", 
    "name,formatted_address,formatted_phone_number,international_phone_number,website,rating,user_ratings_total,types,opening_hours,price_level,photos,geometry"
  );

  const res = await fetch(url.toString(), { method: "GET" });
  return await res.json();
}

/* ==========================================================================
   ROTA PRINCIPAL (POST)
   ========================================================================== */
export async function POST(req: Request) {
  try {
    if (!PLACES_KEY) {
      return NextResponse.json(
        { error: "GOOGLE_PLACES_API_KEY não configurada no .env" },
        { status: 500 }
      );
    }

    const body = (await req.json()) as Body;
    const nicho = (body.nicho || "").trim();
    const cidade = (body.cidade || "").trim();
    const servico = (body.servico || "").trim();
    
    // Limite de segurança (1 a 40 para não estourar a API de uma vez)
    const limit = Math.max(1, Math.min(40, Number(body.limit) || 15));

    if (!nicho || !cidade || !servico) {
      return NextResponse.json(
        { error: "Campos obrigatórios: nicho, cidade, servico." },
        { status: 400 }
      );
    }

    // 1. Faz a busca da lista ("Restaurante em SP")
    const query = `${servico} ${nicho} ${cidade}`.replace(/\s+/g, " ").trim();
    const search = await textSearch(query);

    if (search?.status !== "OK" && search?.status !== "ZERO_RESULTS") {
      return NextResponse.json(
        { error: `Google Places erro: ${search?.status || "desconhecido"}` },
        { status: 400 }
      );
    }

    const results: any[] = Array.isArray(search?.results) ? search.results : [];
    
    // Pega a fatia que o usuário pediu
    const sliced = results.slice(0, limit);

    // 2. O PULO DO GATO: Busca detalhes para TODOS os itens da lista
    // Removemos o "detailsLimit" que existia antes. Agora é potência total.
    const leads = await Promise.all(
      sliced.map(async (r) => {
        const placeId = r?.place_id as string;
        if (!placeId) return null;

        // Objeto Base (caso a API de detalhes falhe, temos pelo menos isso)
        let leadData: any = {
          placeId,
          nome: r.name || "Sem nome",
          endereco: r.formatted_address || r.vicinity || "",
          categoria: pickCategory(r.types),
          rating: r.rating || 0,
          userRatingsTotal: r.user_ratings_total || 0,
          origem: "google_places_premium",
          lat: r.geometry?.location?.lat,
          lng: r.geometry?.location?.lng,
          telefone: "",
          website: "",
          photos: [],
          isOpenNow: null,
          priceLevel: null
        };

        try {
          // Busca os dados profundos (telefone escondido, site, horários)
          const det = await placeDetails(placeId);
          const d = det?.result;

          if (d) {
            leadData = {
              ...leadData,
              // Tenta pegar o telefone internacional (+55...) que é melhor pro Zap
              telefone: d.international_phone_number || d.formatted_phone_number || "",
              website: d.website || "",
              
              // Dados Extras para Inteligência/Estratégia
              priceLevel: d.price_level, // 0 a 4 (Nível de Riqueza do lead)
              isOpenNow: d.opening_hours?.open_now, // Está aberto agora?
              // Pega as 3 primeiras fotos (referências) para mostrar no CRM
              photos: d.photos ? d.photos.slice(0, 3).map((p: any) => p.photo_reference) : [],
              
              // Atualiza categoria se o detalhe for mais específico
              categoria: pickCategory(d.types) || leadData.categoria,
            };
          }
        } catch (err) {
          console.error(`Erro ao buscar detalhes para ${placeId}`, err);
          // Não falha a requisição toda, apenas devolve o lead com dados básicos
        }

        return leadData;
      })
    );

    // Remove nulos
    const cleaned = leads.filter(Boolean);

    return NextResponse.json({ 
      query, 
      count: cleaned.length,
      leads: cleaned 
    });

  } catch (e: any) {
    console.error(e);
    return NextResponse.json(
      { error: "Erro interno no servidor Altum." },
      { status: 500 }
    );
  }
}