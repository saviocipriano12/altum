function clean(value: unknown, max = 1000) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

export function getManagedEvolutionConfig() {
  const baseUrl = clean(process.env.EVOLUTION_API_URL, 500).replace(/\/+$/, "");
  const apiKey = clean(process.env.EVOLUTION_API_KEY, 4000);
  if (!baseUrl || !apiKey) return null;
  return { baseUrl, apiKey };
}

export function isManagedEvolutionConfigured() {
  return Boolean(getManagedEvolutionConfig());
}
