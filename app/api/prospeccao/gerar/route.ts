import { NextResponse } from "next/server";
import { adminDb } from "@/app/lib/server/firebase-admin";
import { normalizePhoneBR } from "@/app/lib/server/phone";
import { requireRequestUser, RouteAuthError } from "@/app/lib/server/route-auth";

const PLACES_KEY = process.env.GOOGLE_PLACES_API_KEY;
const SEARCH_PAGES_MAX = 3;
const SEARCH_QUERIES_MAX = 8;
const FIRESTORE_IN_LIMIT = 10;

type Body = {
  nicho: string;
  cidade: string;
  servico: string;
  limit?: number;
  maxPages?: number;
  searchHints?: string[];
  bannedWords?: string[];
  preferredWords?: string[];
  requirePhone?: boolean;
  minRating?: number;
  minRatingsTotal?: number;
  excludeExistingInCrm?: boolean;
};

type TextSearchResult = {
  place_id?: string;
  name?: string;
  formatted_address?: string;
  vicinity?: string;
  types?: string[];
  rating?: number;
  user_ratings_total?: number;
  geometry?: {
    location?: {
      lat?: number;
      lng?: number;
    };
  };
};

type PlaceDetailsResult = {
  formatted_phone_number?: string;
  international_phone_number?: string;
  website?: string;
  price_level?: number;
  opening_hours?: {
    open_now?: boolean;
  };
  photos?: Array<{
    photo_reference?: string;
  }>;
  types?: string[];
};

type LeadCandidate = {
  placeId: string;
  nome: string;
  endereco: string;
  categoria: string;
  rating: number;
  userRatingsTotal: number;
  origem: string;
  lat?: number;
  lng?: number;
  telefone: string;
  website: string;
  photos: string[];
  isOpenNow?: boolean;
  priceLevel?: number;
  searchScore: number;
  _phoneNorm: string;
};

function clean(value: unknown, max = 220) {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, max);
}

function cleanList(value: unknown, maxItems = 10, maxLen = 100) {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => clean(item, maxLen))
    .filter(Boolean)
    .slice(0, maxItems);
}

function normalizeText(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function pickCategory(types?: string[]) {
  if (!types?.length) return "";

  const ignore = new Set([
    "point_of_interest",
    "establishment",
    "store",
    "food",
    "route",
    "political",
    "geocode",
    "locality",
  ]);
  const filtered = types.filter((type) => !ignore.has(type));
  return (filtered[0] || types[0] || "").replaceAll("_", " ");
}

function buildQueryVariants(args: {
  servico: string;
  nicho: string;
  cidade: string;
  hints: string[];
}) {
  const base = `${args.servico} ${args.nicho} ${args.cidade}`.replace(/\s+/g, " ").trim();
  const variants = [
    base,
    `${args.nicho} ${args.cidade}`,
    `${args.servico} ${args.cidade}`,
    `${args.servico} em ${args.cidade}`,
    `${args.servico} ${args.nicho} perto de ${args.cidade}`,
  ];

  for (const hint of args.hints) {
    variants.push(`${args.servico} ${args.nicho} ${hint} ${args.cidade}`);
    variants.push(`${args.servico} ${hint} ${args.cidade}`);
  }

  const unique = Array.from(new Set(variants.map((item) => item.replace(/\s+/g, " ").trim())));
  return unique.filter(Boolean).slice(0, SEARCH_QUERIES_MAX);
}

async function textSearch(searchQuery: string, pageToken?: string) {
  const url = new URL("https://maps.googleapis.com/maps/api/place/textsearch/json");
  url.searchParams.set("query", searchQuery);
  url.searchParams.set("key", PLACES_KEY || "");
  url.searchParams.set("language", "pt-BR");
  url.searchParams.set("region", "br");
  if (pageToken) {
    url.searchParams.set("pagetoken", pageToken);
  }

  const response = await fetch(url.toString(), { method: "GET" });
  return (await response.json()) as {
    status?: string;
    next_page_token?: string;
    results?: TextSearchResult[];
  };
}

async function placeDetails(placeId: string) {
  const url = new URL("https://maps.googleapis.com/maps/api/place/details/json");
  url.searchParams.set("place_id", placeId);
  url.searchParams.set("key", PLACES_KEY || "");
  url.searchParams.set("language", "pt-BR");
  url.searchParams.set(
    "fields",
    "formatted_phone_number,international_phone_number,website,rating,user_ratings_total,types,opening_hours,price_level,photos"
  );

  const response = await fetch(url.toString(), { method: "GET" });
  return (await response.json()) as {
    status?: string;
    result?: PlaceDetailsResult;
  };
}

async function collectPlaceBases(searchQuery: string, maxPages: number) {
  const all: TextSearchResult[] = [];
  let nextToken = "";
  let pages = 0;

  while (pages < maxPages) {
    if (nextToken) {
      await sleep(1900);
    }

    const response = await textSearch(searchQuery, nextToken || undefined);
    const status = response.status || "UNKNOWN";

    if (status !== "OK" && status !== "ZERO_RESULTS") {
      break;
    }

    const items = Array.isArray(response.results) ? response.results : [];
    all.push(...items);

    pages += 1;
    nextToken = clean(response.next_page_token, 200);
    if (!nextToken || !items.length) {
      break;
    }
  }

  return all;
}

function chunk<T>(items: T[], size: number) {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    out.push(items.slice(i, i + size));
  }
  return out;
}

function containsBannedWord(text: string, bannedWords: string[]) {
  const hay = normalizeText(text);
  return bannedWords.some((word) => hay.includes(normalizeText(word)));
}

function calcSearchScore(lead: LeadCandidate, preferredWords: string[]) {
  let score = 0;
  if (lead._phoneNorm) score += 45;
  if (lead.website) score += 10;
  score += Math.round(clamp(lead.rating, 0, 5) * 5);
  score += Math.round(clamp(lead.userRatingsTotal, 0, 400) / 20);
  score += clamp((lead.priceLevel || 0) * 3, 0, 12);
  if (lead.isOpenNow) score += 3;

  const hay = normalizeText(`${lead.nome} ${lead.categoria} ${lead.endereco}`);
  let preferredHits = 0;
  for (const item of preferredWords) {
    if (hay.includes(normalizeText(item))) preferredHits += 1;
  }
  score += clamp(preferredHits * 4, 0, 12);
  return clamp(score, 0, 100);
}

async function existingPhonesInCrm(phoneNorms: string[]) {
  const unique = Array.from(new Set(phoneNorms.filter(Boolean)));
  const found = new Set<string>();

  for (const group of chunk(unique, FIRESTORE_IN_LIMIT)) {
    if (!group.length) continue;
    const snap = await adminDb
      .collection("leads")
      .where("telefone", "in", group)
      .limit(200)
      .get();

    snap.docs.forEach((doc) => {
      const data = doc.data() as { telefone?: string };
      const normalized = normalizePhoneBR(data.telefone || "");
      if (normalized) found.add(normalized);
    });
  }

  return found;
}

export async function POST(req: Request) {
  try {
    await requireRequestUser(req, { roles: ["admin"] });

    if (!PLACES_KEY) {
      return NextResponse.json(
        { error: "GOOGLE_PLACES_API_KEY nao configurada no servidor." },
        { status: 500 }
      );
    }

    const body = (await req.json()) as Body;
    const nicho = clean(body.nicho, 120);
    const cidade = clean(body.cidade, 120);
    const servico = clean(body.servico, 120);
    const limit = clamp(Number(body.limit) || 15, 1, 80);
    const maxPages = clamp(Number(body.maxPages) || 2, 1, SEARCH_PAGES_MAX);
    const requirePhone = body.requirePhone !== false;
    const bannedWords = cleanList(body.bannedWords, 20, 40);
    const preferredWords = cleanList(body.preferredWords, 20, 40);
    const searchHints = cleanList(body.searchHints, 8, 80);
    const minRating = clamp(Number(body.minRating) || 0, 0, 5);
    const minRatingsTotal = Math.max(0, Number(body.minRatingsTotal) || 0);
    const excludeExistingInCrm = body.excludeExistingInCrm !== false;

    if (!nicho || !cidade || !servico) {
      return NextResponse.json(
        { error: "Campos obrigatorios: nicho, cidade, servico." },
        { status: 400 }
      );
    }

    const queries = buildQueryVariants({ servico, nicho, cidade, hints: searchHints });
    const placeBaseById = new Map<string, TextSearchResult>();
    let fetchedRawResults = 0;

    for (const queryText of queries) {
      const items = await collectPlaceBases(queryText, maxPages);
      fetchedRawResults += items.length;
      for (const item of items) {
        const placeId = clean(item.place_id, 200);
        if (!placeId || placeBaseById.has(placeId)) continue;
        placeBaseById.set(placeId, item);
      }
    }

    const uniquePlaceIds = Array.from(placeBaseById.keys());
    const candidates: LeadCandidate[] = [];
    let detailsCalls = 0;
    let noPhoneFiltered = 0;
    let bannedFiltered = 0;
    let ratingFiltered = 0;

    const maxDetailsToInspect = Math.min(uniquePlaceIds.length, Math.max(limit * 8, 40));
    const inspectList = uniquePlaceIds.slice(0, maxDetailsToInspect);

    for (const group of chunk(inspectList, 6)) {
      const detailedChunk = await Promise.all(
        group.map(async (placeId) => {
          const base = placeBaseById.get(placeId);
          if (!base) return null;

          detailsCalls += 1;
          let detailsResult: PlaceDetailsResult | null = null;
          try {
            const detailResponse = await placeDetails(placeId);
            detailsResult = detailResponse.result || null;
          } catch (error) {
            console.error(`Erro ao buscar detalhes de ${placeId}:`, error);
            return null;
          }

          const rawPhone =
            detailsResult?.international_phone_number ||
            detailsResult?.formatted_phone_number ||
            "";
          const phoneNorm = normalizePhoneBR(rawPhone);
          if (requirePhone && !phoneNorm) {
            noPhoneFiltered += 1;
            return null;
          }

          const rating = Number(base.rating || 0);
          const userRatingsTotal = Number(base.user_ratings_total || 0);
          if (rating < minRating || userRatingsTotal < minRatingsTotal) {
            ratingFiltered += 1;
            return null;
          }

          const nome = clean(base.name, 180) || "Sem nome";
          const endereco = clean(base.formatted_address || base.vicinity, 280);
          const categoria =
            pickCategory((detailsResult?.types as string[] | undefined) || base.types) || "";

          const hay = `${nome} ${categoria} ${endereco}`;
          if (containsBannedWord(hay, bannedWords)) {
            bannedFiltered += 1;
            return null;
          }

          const lead: LeadCandidate = {
            placeId,
            nome,
            endereco,
            categoria,
            rating,
            userRatingsTotal,
            origem: "google_places_premium",
            lat: base.geometry?.location?.lat,
            lng: base.geometry?.location?.lng,
            telefone: phoneNorm,
            website: clean(detailsResult?.website, 320),
            photos: Array.isArray(detailsResult?.photos)
              ? detailsResult!.photos!
                  .map((photo) => clean(photo.photo_reference, 260))
                  .filter(Boolean)
                  .slice(0, 5)
              : [],
            isOpenNow:
              typeof detailsResult?.opening_hours?.open_now === "boolean"
                ? detailsResult.opening_hours.open_now
                : undefined,
            priceLevel:
              typeof detailsResult?.price_level === "number"
                ? detailsResult.price_level
                : undefined,
            searchScore: 0,
            _phoneNorm: phoneNorm,
          };
          lead.searchScore = calcSearchScore(lead, preferredWords);
          return lead;
        })
      );

      for (const item of detailedChunk) {
        if (item) candidates.push(item);
      }

      if (candidates.length >= Math.max(limit * 3, 30)) {
        break;
      }
    }

    let afterPhoneAndRules = candidates;
    if (excludeExistingInCrm) {
      const existingPhones = await existingPhonesInCrm(
        afterPhoneAndRules.map((item) => item._phoneNorm)
      );
      afterPhoneAndRules = afterPhoneAndRules.filter(
        (item) => !existingPhones.has(item._phoneNorm)
      );
    }

    const seenPhones = new Set<string>();
    const seenBusiness = new Set<string>();
    const deduped: LeadCandidate[] = [];

    const sorted = [...afterPhoneAndRules].sort((a, b) => b.searchScore - a.searchScore);
    for (const lead of sorted) {
      const businessKey = normalizeText(`${lead.nome}|${lead.endereco}`);
      if (lead._phoneNorm) {
        if (seenPhones.has(lead._phoneNorm)) continue;
        seenPhones.add(lead._phoneNorm);
      } else {
        if (seenBusiness.has(businessKey)) continue;
        seenBusiness.add(businessKey);
      }
      deduped.push(lead);
    }

    const finalLeads = deduped.slice(0, limit).map((lead) => {
      const cleanLead = { ...lead };
      delete cleanLead._phoneNorm;
      return cleanLead;
    });

    return NextResponse.json({
      query: queries[0] || `${servico} ${nicho} ${cidade}`.replace(/\s+/g, " ").trim(),
      queries,
      count: finalLeads.length,
      leads: finalLeads,
      meta: {
        limit,
        maxPages,
        requirePhone,
        fetchedRawResults,
        uniquePlaces: uniquePlaceIds.length,
        inspectedDetails: detailsCalls,
        removedNoPhone: noPhoneFiltered,
        removedByBannedWords: bannedFiltered,
        removedByRating: ratingFiltered,
        afterFilters: candidates.length,
        afterDedupe: deduped.length,
      },
    });
  } catch (error) {
    if (error instanceof RouteAuthError) {
      return NextResponse.json(
        { error: error.message, code: error.code },
        { status: error.status }
      );
    }

    console.error("Erro interno em /api/prospeccao/gerar:", error);
    return NextResponse.json({ error: "Erro interno no servidor Altum." }, { status: 500 });
  }
}
