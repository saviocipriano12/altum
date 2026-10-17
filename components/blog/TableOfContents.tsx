import type { BlogHeading } from "@/lib/blog";

type TableOfContentsProps = {
  headings: BlogHeading[];
};

export default function TableOfContents({ headings }: TableOfContentsProps) {
  if (headings.length === 0) return null;

  return (
    <aside className="rounded-2xl border border-slate-200 bg-white p-5 lg:sticky lg:top-24">
      <h2 className="mb-4 text-sm font-semibold uppercase tracking-[0.12em] text-slate-600">
        Sumario
      </h2>
      <ul className="space-y-2">
        {headings.map((heading) => (
          <li
            key={`${heading.id}-${heading.level}`}
            className={heading.level === 3 ? "pl-4" : ""}
          >
            <a
              href={`#${heading.id}`}
              className="text-sm text-slate-600 transition-colors hover:text-[#292a2d]"
            >
              {heading.text}
            </a>
          </li>
        ))}
      </ul>
    </aside>
  );
}
