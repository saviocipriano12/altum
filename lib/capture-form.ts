export type CaptureFieldType = "text" | "textarea" | "select" | "number" | "date" | "checkbox";

export type CaptureFieldDefinition = {
  id: string;
  label: string;
  type: CaptureFieldType;
  required: boolean;
  placeholder?: string;
  helperText?: string;
  options?: string[];
  step?: number;
  showWhenFieldId?: string;
  showWhenEquals?: string;
};

function clean(value: unknown, max = 220) {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, max);
}

function toBoolean(value: unknown, fallback = false) {
  if (typeof value === "boolean") return value;
  return fallback;
}

function toPositiveInteger(value: unknown, fallback = 1) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(12, Math.max(1, Math.round(parsed)));
}

function normalizeFieldType(value: unknown): CaptureFieldType {
  const normalized = clean(value, 40).toLowerCase();
  if (
    normalized === "text" ||
    normalized === "textarea" ||
    normalized === "select" ||
    normalized === "number" ||
    normalized === "date" ||
    normalized === "checkbox"
  ) {
    return normalized;
  }
  return "text";
}

function normalizeOptions(value: unknown) {
  const source = Array.isArray(value) ? value : typeof value === "string" ? value.split(",") : [];
  return Array.from(
    new Set(
      source
        .map((item) => clean(item, 120))
        .filter(Boolean)
    )
  ).slice(0, 20);
}

export function normalizeCaptureFields(value: unknown): CaptureFieldDefinition[] {
  const source = Array.isArray(value) ? value : [];

  return source
    .map((item, index) => {
      const field = item && typeof item === "object" ? (item as Record<string, unknown>) : {};
      const id =
        clean(field.id, 80).toLowerCase().replace(/\s+/g, "_") ||
        clean(field.label, 80).toLowerCase().replace(/\s+/g, "_") ||
        `campo_${index + 1}`;
      const label = clean(field.label, 120) || `Campo ${index + 1}`;
      const type = normalizeFieldType(field.type);
      return {
        id,
        label,
        type,
        required: toBoolean(field.required, false),
        placeholder: clean(field.placeholder, 180),
        helperText: clean(field.helperText, 220),
        options: type === "select" ? normalizeOptions(field.options) : [],
        step: toPositiveInteger(field.step, 1),
        showWhenFieldId: clean(field.showWhenFieldId, 80).toLowerCase().replace(/\s+/g, "_"),
        showWhenEquals: clean(field.showWhenEquals, 120),
      } satisfies CaptureFieldDefinition;
    })
    .slice(0, 16);
}

export function groupCaptureFieldsByStep(fields: CaptureFieldDefinition[]) {
  const groups = new Map<number, CaptureFieldDefinition[]>();

  for (const field of fields) {
    const step = toPositiveInteger(field.step, 1);
    const current = groups.get(step) || [];
    current.push(field);
    groups.set(step, current);
  }

  return Array.from(groups.entries())
    .sort((a, b) => a[0] - b[0])
    .map(([step, items]) => ({ step, items }));
}

export function isCaptureFieldVisible(
  field: CaptureFieldDefinition,
  values: Record<string, string | number | boolean>
) {
  if (!field.showWhenFieldId) return true;
  const current = values[field.showWhenFieldId];
  if (typeof current === "boolean") {
    return String(current) === String(field.showWhenEquals || "true");
  }
  return String(current ?? "").trim().toLowerCase() === String(field.showWhenEquals || "").trim().toLowerCase();
}

export function normalizeCaptureFieldValue(
  field: CaptureFieldDefinition,
  value: unknown
): string | number | boolean | null {
  if (field.type === "checkbox") {
    return toBoolean(value, false);
  }

  if (field.type === "number") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  const text = clean(value, 4000);
  return text || null;
}
