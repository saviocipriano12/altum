type StepsProps = {
  items: string[];
};

export default function Steps({ items }: StepsProps) {
  if (!items || items.length === 0) return null;

  return (
    <ol className="my-8 space-y-4">
      {items.map((item, index) => (
        <li key={`${item}-${index}`} className="flex gap-4 rounded-2xl border border-white/10 bg-white/[0.03] p-4 md:p-5">
          <span className="mt-0.5 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#F56E0F] text-sm font-bold text-white">
            {index + 1}
          </span>
          <p className="text-[1.02rem] leading-7 text-white/85">{item}</p>
        </li>
      ))}
    </ol>
  );
}
