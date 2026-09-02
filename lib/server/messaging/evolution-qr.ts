function cleanQrValue(value: unknown, max = 2_000_000) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

export function readEvolutionQr(payload: Record<string, unknown>) {
  const qrcode = payload.qrcode && typeof payload.qrcode === "object"
    ? payload.qrcode as Record<string, unknown>
    : {};
  const raw =
    cleanQrValue(payload.base64) ||
    cleanQrValue(qrcode.base64) ||
    cleanQrValue(payload.code) ||
    cleanQrValue(qrcode.code);
  if (!raw) return "";
  if (/^data:image\/(?:png|jpeg|webp);base64,/i.test(raw)) return raw;
  if (/^iVBORw0KGgo/i.test(raw)) return `data:image/png;base64,${raw}`;
  if (/^\/9j\//.test(raw)) return `data:image/jpeg;base64,${raw}`;
  if (/^UklGR/i.test(raw)) return `data:image/webp;base64,${raw}`;
  return raw;
}
