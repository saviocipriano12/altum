export default function Loading() {
  return <section aria-busy="true" aria-label="Carregando página" className="space-y-4 p-4">
    <p role="status" className="text-sm text-[var(--cliente-text-muted)]">Carregando informações…</p>
    <div className="h-12 w-2/3 animate-pulse rounded-xl bg-[var(--cliente-surface-muted)]" />
    <div className="h-48 animate-pulse rounded-2xl bg-[var(--cliente-surface-muted)]" />
  </section>;
}
