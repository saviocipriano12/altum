export function recurringPeriods(now: Date, months: number, dueDay: number) {
  const count = Math.max(1, Math.min(24, Math.trunc(months || 12)));
  const day = Math.max(1, Math.min(28, Math.trunc(dueDay || 10)));
  return Array.from({ length: count }, (_, offset) => {
    const date = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + offset + 1, day));
    const dueDate = date.toISOString().slice(0, 10);
    return { competence: dueDate.slice(0, 7), dueDate };
  });
}
export function existingRecurringPeriods(rows: Record<string, unknown>[]) {
  return new Set(rows.filter(row => row.categoria === "Mensalidade").map(row => {
    const value = typeof row.competence === "string" ? row.competence : typeof row.vencimento === "string" ? row.vencimento.slice(0, 7) : "";
    return /^\d{4}-\d{2}$/.test(value) ? value : "";
  }).filter(Boolean));
}
