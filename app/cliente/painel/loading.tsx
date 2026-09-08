export default function ClientePainelLoading() {
  return (
    <div className="animate-pulse space-y-4" role="status" aria-label="Carregando área do cliente">
      <div className="h-8 w-64 rounded-xl bg-[var(--cliente-surface-muted)]" />
      <div className="grid gap-4 md:grid-cols-3">
        {[0, 1, 2].map((item) => <div key={item} className="h-32 rounded-[22px] border border-[var(--cliente-border)] bg-[var(--cliente-card)]" />)}
      </div>
      <div className="h-72 rounded-[22px] border border-[var(--cliente-border)] bg-[var(--cliente-card)]" />
    </div>
  );
}
