type ChecklistProps = {
  items: string[];
};

export default function Checklist({ items }: ChecklistProps) {
  if (!items || items.length === 0) return null;

  return (
    <ul className="my-8 space-y-3 rounded-2xl border border-white/10 bg-white/[0.03] p-5 md:p-6">
      {items.map((item, index) => (
        <li key={`${item}-${index}`} className="flex items-start gap-3">
          <span className="mt-1 inline-block h-2.5 w-2.5 shrink-0 rounded-full bg-[#F56E0F]" />
          <span className="text-[1.02rem] leading-7 text-white/85">{item}</span>
        </li>
      ))}
    </ul>
  );
}
