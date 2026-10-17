import type { ReactNode } from "react";

type QuoteProps = {
  children: ReactNode;
  author?: string;
  role?: string;
};

export default function Quote({ children, author, role }: QuoteProps) {
  return (
    <figure className="my-10 rounded-2xl border border-slate-200 bg-white p-6 md:p-8">
      <blockquote className="mb-4 border-l-2 border-[#ed782f] pl-4 text-xl leading-9 text-slate-600">
        {children}
      </blockquote>
      {author ? (
        <figcaption className="text-sm text-slate-600">
          {author}
          {role ? <span className="text-slate-600"> · {role}</span> : null}
        </figcaption>
      ) : null}
    </figure>
  );
}
