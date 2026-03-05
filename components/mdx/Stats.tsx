type StatItem = {
  label: string;
  value: string;
  description?: string;
};

type StatsProps = {
  items: StatItem[];
};

export default function Stats({ items }: StatsProps) {
  if (!items || items.length === 0) return null;

  return (
    <section className="my-10 grid gap-4 md:grid-cols-3">
      {items.slice(0, 3).map((item, index) => (
        <article key={`${item.label}-${index}`} className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
          <p className="mb-2 text-3xl font-bold text-white">{item.value}</p>
          <h3 className="mb-1 text-sm font-semibold uppercase tracking-[0.08em] text-[#F56E0F]">{item.label}</h3>
          {item.description ? <p className="text-sm leading-6 text-white/75">{item.description}</p> : null}
        </article>
      ))}
    </section>
  );
}
