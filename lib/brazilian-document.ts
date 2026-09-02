export function normalizeBrazilianDocument(value: unknown) {
  return typeof value === "string" ? value.replace(/\D/g, "").slice(0, 14) : "";
}

function hasRepeatedDigits(value: string) {
  return /^(\d)\1+$/.test(value);
}

function cpfCheckDigit(value: string, factor: number) {
  let total = 0;
  for (let index = 0; index < factor - 1; index += 1) {
    total += Number(value[index]) * (factor - index);
  }
  const remainder = (total * 10) % 11;
  return remainder === 10 ? 0 : remainder;
}

function isValidCpf(value: string) {
  if (value.length !== 11 || hasRepeatedDigits(value)) return false;
  return cpfCheckDigit(value, 10) === Number(value[9]) && cpfCheckDigit(value, 11) === Number(value[10]);
}

function cnpjCheckDigit(value: string, weights: number[]) {
  const total = weights.reduce((sum, weight, index) => sum + Number(value[index]) * weight, 0);
  const remainder = total % 11;
  return remainder < 2 ? 0 : 11 - remainder;
}

function isValidCnpj(value: string) {
  if (value.length !== 14 || hasRepeatedDigits(value)) return false;
  const first = cnpjCheckDigit(value, [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  const second = cnpjCheckDigit(value, [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  return first === Number(value[12]) && second === Number(value[13]);
}

export function isValidBrazilianDocument(value: unknown) {
  const normalized = normalizeBrazilianDocument(value);
  return normalized.length === 11 ? isValidCpf(normalized) : isValidCnpj(normalized);
}

export function formatBrazilianDocument(value: unknown) {
  const normalized = normalizeBrazilianDocument(value);
  if (normalized.length <= 11) {
    return normalized
      .replace(/^(\d{3})(\d)/, "$1.$2")
      .replace(/^(\d{3})\.(\d{3})(\d)/, "$1.$2.$3")
      .replace(/\.(\d{3})(\d)/, ".$1-$2");
  }
  return normalized
    .replace(/^(\d{2})(\d)/, "$1.$2")
    .replace(/^(\d{2})\.(\d{3})(\d)/, "$1.$2.$3")
    .replace(/\.(\d{3})(\d)/, ".$1/$2")
    .replace(/(\d{4})(\d)/, "$1-$2");
}
