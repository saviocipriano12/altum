import { NextResponse } from "next/server";
import { requireRequestUser, RouteAuthError } from "@/app/lib/server/route-auth";
import { assertTenantAccess, assertTenantCapability, TenantAccessError } from "@/lib/server/tenant";
import { normalizePipelineStageId } from "@/lib/pipeline";
import { recordInboundLead } from "@/lib/server/lead-intake";
import { normalizePhoneBR } from "@/app/lib/server/phone";
import { assertTenantLimitAvailable, assertTenantModule } from "@/lib/server/tenant-entitlements";
import { adminDb } from "@/app/lib/server/firebase-admin";

const MAX_CSV_CHARS = 1_200_000;
const MAX_IMPORT_ROWS = 1200;
const MAX_RESULT_ROWS = 180;

type ImportBody = {
  csvContent?: unknown;
  delimiter?: unknown;
  defaultChannel?: unknown;
  defaultSourceLabel?: unknown;
  defaultPipelineStage?: unknown;
  defaultOwnerId?: unknown;
  defaultOwnerName?: unknown;
  defaultConsentWhatsApp?: unknown;
  defaultConsentEmail?: unknown;
};

type ParsedRow = {
  row: number;
  values: Record<string, string>;
};

type ParsedImportRow = {
  row: number;
  nome: string;
  email: string;
  telefone: string;
  empresa: string;
  origem: string;
  channel: string;
  tags: string[];
  mensagem: string;
  notes: string[];
  sourceId: string;
  externalProfileId: string;
  pipelineStage: string;
  ownerId: string;
  ownerName: string;
  consentWhatsApp: boolean | null;
  consentEmail: boolean | null;
  customFields: Record<string, string | number | boolean | null>;
};

type RowResult = {
  row: number;
  status: "created" | "updated" | "skipped" | "error";
  leadId?: string;
  message?: string;
};

function clean(value: unknown, max = 240) {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, max);
}

function normalizeHeader(value: string) {
  return value
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function normalizeBooleanToken(value: string) {
  return value
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function parseBoolean(value: unknown): boolean | null {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value === 1 ? true : value === 0 ? false : null;

  const normalized = normalizeBooleanToken(String(value || ""));
  if (!normalized) return null;

  if (["1", "true", "sim", "yes", "y", "ok", "aceito", "autorizado"].includes(normalized)) return true;
  if (["0", "false", "nao", "no", "n", "recusado", "optout"].includes(normalized)) return false;
  return null;
}

function parseTags(value: string) {
  if (!value.trim()) return [] as string[];
  return Array.from(
    new Set(
      value
        .split(/[;,|]/g)
        .map((item) => clean(item, 32).toLowerCase())
        .filter(Boolean)
    )
  ).slice(0, 12);
}

function countDelimiter(line: string, delimiter: string) {
  let count = 0;
  let inQuotes = false;
  for (let index = 0; index < line.length; index += 1) {
    const current = line[index];
    const next = line[index + 1];

    if (current === "\"") {
      if (inQuotes && next === "\"") {
        index += 1;
        continue;
      }
      inQuotes = !inQuotes;
      continue;
    }

    if (!inQuotes && current === delimiter) count += 1;
  }
  return count;
}

function detectDelimiter(input: string) {
  const headerLine = input
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find((line) => line.length > 0) || "";

  const candidates = [",", ";", "\t", "|"] as const;
  const ranked = candidates
    .map((delimiter) => ({
      delimiter,
      count: countDelimiter(headerLine, delimiter),
    }))
    .sort((a, b) => b.count - a.count);

  if (!ranked[0] || ranked[0].count <= 0) return ",";
  return ranked[0].delimiter;
}

function parseCsvMatrix(input: string, delimiter: string) {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let inQuotes = false;

  for (let index = 0; index < input.length; index += 1) {
    const current = input[index];
    const next = input[index + 1];

    if (current === "\"") {
      if (inQuotes && next === "\"") {
        cell += "\"";
        index += 1;
        continue;
      }
      inQuotes = !inQuotes;
      continue;
    }

    if (!inQuotes && current === delimiter) {
      row.push(cell.trim());
      cell = "";
      continue;
    }

    if (!inQuotes && (current === "\n" || current === "\r")) {
      if (current === "\r" && next === "\n") {
        index += 1;
      }
      row.push(cell.trim());
      rows.push(row);
      row = [];
      cell = "";
      continue;
    }

    cell += current;
  }

  if (cell.length > 0 || row.length > 0) {
    row.push(cell.trim());
    rows.push(row);
  }

  return rows;
}

function normalizeHeaders(rawHeaders: string[]) {
  const seen = new Map<string, number>();
  return rawHeaders.map((header, index) => {
    const normalizedBase = normalizeHeader(header || `coluna_${index + 1}`) || `coluna_${index + 1}`;
    const seenCount = seen.get(normalizedBase) || 0;
    seen.set(normalizedBase, seenCount + 1);
    return seenCount === 0 ? normalizedBase : `${normalizedBase}_${seenCount + 1}`;
  });
}

function isRowEmpty(values: Record<string, string>) {
  return Object.values(values).every((value) => !String(value || "").trim());
}

function parseCsvRows(input: string, explicitDelimiter: string | null) {
  const delimiter = explicitDelimiter || detectDelimiter(input);
  const matrix = parseCsvMatrix(input, delimiter);

  if (matrix.length === 0) {
    return { delimiter, headers: [] as string[], rows: [] as ParsedRow[] };
  }

  const headers = normalizeHeaders(matrix[0] || []);
  const rows: ParsedRow[] = [];

  for (let rowIndex = 1; rowIndex < matrix.length; rowIndex += 1) {
    const current = matrix[rowIndex] || [];
    const values = headers.reduce<Record<string, string>>((acc, header, cellIndex) => {
      acc[header] = clean(current[cellIndex], 5000);
      return acc;
    }, {});

    if (isRowEmpty(values)) continue;
    rows.push({ row: rowIndex + 1, values });
  }

  return { delimiter, headers, rows };
}

function readFirst(values: Record<string, string>, keys: string[]) {
  for (const key of keys) {
    const direct = clean(values[key], 5000);
    if (direct) return direct;
  }
  return "";
}

function normalizeCustomFieldKey(key: string) {
  const normalized = normalizeHeader(key)
    .replace(/^cf_/, "")
    .replace(/^custom_/, "")
    .replace(/^campo_/, "");
  return normalized.slice(0, 80);
}

const KNOWN_KEYS = new Set([
  "nome",
  "name",
  "full_name",
  "lead_name",
  "contato",
  "contact_name",
  "email",
  "mail",
  "e_mail",
  "telefone",
  "phone",
  "whatsapp",
  "celular",
  "mobile",
  "fone",
  "numero",
  "empresa",
  "company",
  "negocio",
  "business",
  "origem",
  "source",
  "fonte",
  "canal",
  "channel",
  "tags",
  "etiquetas",
  "mensagem",
  "msg",
  "observacao",
  "observacoes",
  "notes",
  "nota",
  "source_id",
  "id_origem",
  "id_fonte",
  "external_profile_id",
  "profile_id",
  "contato_externo_id",
  "owner_id",
  "responsavel_id",
  "owner_name",
  "responsavel",
  "stage",
  "pipeline_stage",
  "etapa",
  "consent_whatsapp",
  "whatsapp_optin",
  "optin_whatsapp",
  "aceite_whatsapp",
  "consent_email",
  "email_optin",
  "optin_email",
  "aceite_email",
]);

function parseImportRow(
  row: ParsedRow,
  defaults: {
    channel: string;
    sourceLabel: string;
    pipelineStage: string;
    ownerId: string;
    ownerName: string;
    consentWhatsApp: boolean | null;
    consentEmail: boolean | null;
    importBatchId: string;
    importBatchTag: string;
  }
): ParsedImportRow {
  const nome = readFirst(row.values, ["nome", "name", "full_name", "lead_name", "contato", "contact_name"]);
  const email = readFirst(row.values, ["email", "mail", "e_mail"]).toLowerCase();
  const telefone = readFirst(row.values, ["telefone", "phone", "whatsapp", "celular", "mobile", "fone", "numero"]);
  const empresa = readFirst(row.values, ["empresa", "company", "negocio", "business"]);
  const origem = readFirst(row.values, ["origem", "source", "fonte"]) || defaults.sourceLabel;
  const channel = readFirst(row.values, ["canal", "channel"]).toLowerCase() || defaults.channel;
  const tags = parseTags(readFirst(row.values, ["tags", "etiquetas"]));
  const mensagem = readFirst(row.values, ["mensagem", "msg"]);
  const notes = [
    readFirst(row.values, ["observacao", "observacoes", "notes", "nota"]),
    `Importacao CSV linha ${row.row}.`,
  ].filter(Boolean);
  const sourceId = readFirst(row.values, ["source_id", "id_origem", "id_fonte"]);
  const externalProfileId =
    readFirst(row.values, ["external_profile_id", "profile_id", "contato_externo_id"]) || sourceId;
  const pipelineStage = normalizePipelineStageId(
    readFirst(row.values, ["stage", "pipeline_stage", "etapa"]) || defaults.pipelineStage
  );
  const ownerId = readFirst(row.values, ["owner_id", "responsavel_id"]) || defaults.ownerId;
  const ownerName = readFirst(row.values, ["owner_name", "responsavel"]) || defaults.ownerName;
  const consentWhatsApp =
    parseBoolean(readFirst(row.values, ["consent_whatsapp", "whatsapp_optin", "optin_whatsapp", "aceite_whatsapp"])) ??
    defaults.consentWhatsApp;
  const consentEmail =
    parseBoolean(readFirst(row.values, ["consent_email", "email_optin", "optin_email", "aceite_email"])) ??
    defaults.consentEmail;

  const customFields = Object.entries(row.values).reduce<Record<string, string | number | boolean | null>>(
    (acc, [key, value]) => {
      if (!value) return acc;
      if (KNOWN_KEYS.has(key)) return acc;
      const normalizedKey = normalizeCustomFieldKey(key);
      if (!normalizedKey) return acc;
      acc[normalizedKey] = value.slice(0, 4000);
      return acc;
    },
    {}
  );

  customFields.import_batch_id = defaults.importBatchId;
  customFields.import_batch_tag = defaults.importBatchTag;
  customFields.import_row_number = row.row;
  customFields.import_source = "crm_import_csv";
  if (consentWhatsApp !== null) customFields.consent_whatsapp = consentWhatsApp;
  if (consentEmail !== null) customFields.consent_email = consentEmail;
  customFields.consent_source = "crm_import";
  customFields.consent_observed_at = new Date().toISOString();

  return {
    row: row.row,
    nome,
    email,
    telefone,
    empresa,
    origem,
    channel: channel || "whatsapp",
    tags,
    mensagem,
    notes,
    sourceId,
    externalProfileId,
    pipelineStage,
    ownerId,
    ownerName,
    consentWhatsApp,
    consentEmail,
    customFields,
  };
}

export async function POST(req: Request, context: { params: Promise<{ tenantId: string }> }) {
  try {
    const user = await requireRequestUser(req);
    const { tenantId } = await context.params;
    const membership = await assertTenantAccess(user.uid, tenantId);
    await assertTenantModule(tenantId, "crm");
    assertTenantCapability(membership, "edit_leads");

    const body = (await req.json()) as ImportBody;
    const csvContent = typeof body.csvContent === "string" ? body.csvContent.trim() : "";
    if (!csvContent) {
      return NextResponse.json({ error: "CSV vazio. Envie o conteudo para importacao." }, { status: 400 });
    }
    if (csvContent.length > MAX_CSV_CHARS) {
      return NextResponse.json(
        { error: `Arquivo excede limite de ${MAX_CSV_CHARS.toLocaleString("pt-BR")} caracteres.` },
        { status: 400 }
      );
    }

    const delimiterToken = clean(body.delimiter, 2);
    const defaults = {
      channel: clean(body.defaultChannel, 40).toLowerCase() || "whatsapp",
      sourceLabel: clean(body.defaultSourceLabel, 120) || "Importacao CRM",
      pipelineStage: normalizePipelineStageId(clean(body.defaultPipelineStage, 80) || "captado"),
      ownerId: clean(body.defaultOwnerId, 140),
      ownerName: clean(body.defaultOwnerName, 140),
      consentWhatsApp: parseBoolean(body.defaultConsentWhatsApp),
      consentEmail: parseBoolean(body.defaultConsentEmail),
      importBatchId: `crm_${Date.now()}`,
      importBatchTag: `imp_${Date.now().toString(36)}`,
    };

    const parsed = parseCsvRows(csvContent, delimiterToken || null);
    if (parsed.rows.length === 0) {
      return NextResponse.json({ error: "Nenhuma linha valida encontrada no CSV." }, { status: 400 });
    }
    if (parsed.rows.length > MAX_IMPORT_ROWS) {
      return NextResponse.json(
        { error: `Limite de importacao excedido: maximo ${MAX_IMPORT_ROWS} linhas por envio.` },
        { status: 400 }
      );
    }

    const parsedRows = parsed.rows.map((row) => parseImportRow(row, defaults));
    const currentLeadsSnap = await adminDb.collection("leads").where("tenantId", "==", tenantId).get();
    const knownEmails = new Set<string>();
    const knownPhones = new Set<string>();
    const knownExternalIds = new Set<string>();
    const knownSourceIds = new Set<string>();
    currentLeadsSnap.docs.forEach((doc) => {
      const data = doc.data() as Record<string, unknown>;
      const email = clean(data.email, 180).toLowerCase();
      const phone = normalizePhoneBR(clean(data.telefone, 60));
      const externalId = clean(data.externalProfileId, 180);
      const sourceId = clean(data.sourceId, 180);
      if (email) knownEmails.add(email);
      if (phone) knownPhones.add(phone);
      if (externalId) knownExternalIds.add(externalId);
      if (sourceId) knownSourceIds.add(sourceId);
    });

    let projectedNewContacts = 0;
    for (const row of parsedRows) {
      const email = row.email.toLowerCase();
      const phone = normalizePhoneBR(row.telefone);
      const isKnown = Boolean(
        (row.sourceId && knownSourceIds.has(row.sourceId)) ||
        (row.externalProfileId && knownExternalIds.has(row.externalProfileId)) ||
        (phone && knownPhones.has(phone)) ||
        (email && knownEmails.has(email))
      );
      if (isKnown) continue;
      projectedNewContacts += 1;
      if (row.sourceId) knownSourceIds.add(row.sourceId);
      if (row.externalProfileId) knownExternalIds.add(row.externalProfileId);
      if (phone) knownPhones.add(phone);
      if (email) knownEmails.add(email);
    }
    await assertTenantLimitAvailable({
      tenantId,
      limitId: "contacts",
      currentUsage: currentLeadsSnap.size,
      increment: projectedNewContacts,
    });
    const results: RowResult[] = [];
    let created = 0;
    let updated = 0;
    let skipped = 0;
    let errors = 0;

    for (const row of parsedRows) {
      const hasIdentifier = Boolean(row.nome || row.email || row.telefone || row.externalProfileId);
      if (!hasIdentifier) {
        skipped += 1;
        results.push({
          row: row.row,
          status: "skipped",
          message: "Linha sem identificadores minimos (nome, email, telefone ou id externo).",
        });
        continue;
      }

      try {
        const intakeResult = await recordInboundLead({
          tenantId,
          sourceType: "crm_import",
          sourceId: row.sourceId || null,
          sourceLabel: row.origem || defaults.sourceLabel,
          channel: row.channel || defaults.channel,
          nome: row.nome,
          email: row.email,
          telefone: row.telefone,
          empresa: row.empresa,
          mensagem: row.mensagem,
          customFields: row.customFields,
          notes: row.notes,
          tags: Array.from(new Set(["importacao_base", defaults.importBatchTag, ...row.tags])),
          defaultOwnerId: row.ownerId || null,
          defaultOwnerName: row.ownerName || null,
          defaultPipelineStage: row.pipelineStage || defaults.pipelineStage,
          externalProfileId: row.externalProfileId || null,
          attribution: {
            source: "crm_import",
            medium: "base",
            campaign: "importacao_manual",
            sourceLabel: row.origem || defaults.sourceLabel,
            channel: row.channel || defaults.channel,
            sourceType: "crm_import",
          },
          automationActorId: user.uid,
          automationActorName: user.name || "ALTUM Import",
          skipLeadCreatedWorkflows: true,
        });

        if (intakeResult.created) {
          created += 1;
          results.push({ row: row.row, status: "created", leadId: intakeResult.leadId });
        } else {
          updated += 1;
          results.push({ row: row.row, status: "updated", leadId: intakeResult.leadId });
        }
      } catch (error) {
        errors += 1;
        const message = error instanceof Error ? error.message : "Erro ao importar linha.";
        results.push({ row: row.row, status: "error", message });
      }
    }

    const summary = {
      totalRows: parsedRows.length,
      processed: created + updated,
      created,
      updated,
      skipped,
      errors,
      delimiter: parsed.delimiter,
      importBatchId: defaults.importBatchId,
      importBatchTag: defaults.importBatchTag,
      sourceLabel: defaults.sourceLabel,
    };

    return NextResponse.json({
      ok: true,
      tenantId,
      summary,
      rows: results.slice(0, MAX_RESULT_ROWS),
      rowsTruncated: results.length > MAX_RESULT_ROWS,
    });
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
    console.error("Erro ao importar base de leads:", error);
    return NextResponse.json({ error: "Falha ao importar base de leads." }, { status: 500 });
  }
}
