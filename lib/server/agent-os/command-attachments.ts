import * as XLSX from "xlsx";
import { adminStorage } from "@/app/lib/server/firebase-admin";
import { firebaseStorageBucketCandidates } from "@/lib/server/firebase-storage";

type StoredAttachment = { filename: string; contentType: string; storagePath: string };

const MAX_CONTEXT = 12_000;

function cleanText(value: string, max = MAX_CONTEXT) {
  return value.replace(/\u0000/g, "").replace(/\r\n/g, "\n").trim().slice(0, max);
}

async function download(path: string) {
  for (const bucketName of firebaseStorageBucketCandidates()) {
    const file = adminStorage.bucket(bucketName).file(path);
    const [exists] = await file.exists();
    if (exists) return (await file.download())[0];
  }
  throw new Error("attachment_storage_file_missing");
}

function spreadsheetText(data: Buffer) {
  const workbook = XLSX.read(data, { type: "buffer", cellText: true, cellDates: false });
  return cleanText(workbook.SheetNames.slice(0, 4).map((name) => {
    const sheet = workbook.Sheets[name];
    return `Planilha: ${name}\n${XLSX.utils.sheet_to_csv(sheet, { FS: " | ", RS: "\n" }).slice(0, 3_000)}`;
  }).join("\n\n"));
}

function numberValue(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value !== "string") return null;
  const compact = value.trim().replace(/\s/g, "");
  if (!compact || !/^-?[\d.,]+$/.test(compact)) return null;
  const normalized = compact.includes(",") && compact.includes(".")
    ? compact.lastIndexOf(",") > compact.lastIndexOf(".") ? compact.replace(/\./g, "").replace(",", ".") : compact.replace(/,/g, "")
    : compact.replace(",", ".");
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

/** A compact, deterministic overview used only inside the tenant's private command context. */
export function summarizeSpreadsheet(data: Buffer) {
  const workbook = XLSX.read(data, { type: "buffer", cellDates: false });
  const lines: string[] = [];
  for (const sheetName of workbook.SheetNames.slice(0, 4)) {
    const sheet = workbook.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: "", raw: true });
    if (!rows.length) { lines.push(`${sheetName}: aba vazia.`); continue; }
    const headers = rows[0].map((value, index) => String(value || `Coluna ${index + 1}`).trim().slice(0, 60));
    const records = rows.slice(1).filter((row) => row.some((value) => String(value).trim()));
    const numeric = headers.flatMap((header, index) => {
      const values = records.map((row) => numberValue(row[index])).filter((value): value is number => value !== null);
      if (!values.length) return [];
      const total = values.reduce((sum, value) => sum + value, 0);
      return [`${header}: ${values.length} números; total ${total.toLocaleString("pt-BR", { maximumFractionDigits: 2 })}; média ${(total / values.length).toLocaleString("pt-BR", { maximumFractionDigits: 2 })}`];
    }).slice(0, 4);
    lines.push(`${sheetName}: ${records.length} registro${records.length === 1 ? "" : "s"}; colunas: ${headers.slice(0, 8).join(", ") || "sem cabeçalhos"}.${numeric.length ? ` Indicadores: ${numeric.join(". ")}.` : ""}`);
  }
  return cleanText(lines.join("\n"), 3_500);
}

export async function extractPrivateAttachmentContext(input: StoredAttachment[]) {
  const parts: string[] = [];
  const notices: string[] = [];
  const analysis: string[] = [];
  for (const attachment of input.slice(0, 6)) {
    try {
      const type = attachment.contentType.toLowerCase().split(";")[0];
      const data = await download(attachment.storagePath);
      let text = "";
      if (type === "application/json") {
        const raw = data.toString("utf8");
        try { text = JSON.stringify(JSON.parse(raw), null, 2); } catch { text = raw; }
      } else if (type === "text/plain" || type === "text/csv" || type === "text/markdown" || type === "application/csv") {
        text = data.toString("utf8");
        if (type === "text/csv" || type === "application/csv") {
          const summary = summarizeSpreadsheet(data);
          if (summary) analysis.push(`${attachment.filename}\n${summary}`);
        }
      } else if (type.includes("spreadsheetml") || type.includes("ms-excel")) {
        text = spreadsheetText(data);
        const summary = summarizeSpreadsheet(data);
        if (summary) analysis.push(`${attachment.filename}\n${summary}`);
      } else {
        notices.push(`${attachment.filename}: armazenado de forma privada; este formato ainda não é lido automaticamente.`);
        continue;
      }
      const normalized = cleanText(text, 4_000);
      if (normalized) parts.push(`Arquivo: ${attachment.filename}\n${normalized}`);
    } catch {
      notices.push(`${attachment.filename}: não foi possível ler o conteúdo agora.`);
    }
  }
  return { text: cleanText(parts.join("\n\n---\n\n")), notices, analysis: cleanText(analysis.join("\n\n"), 4_000) };
}
