import type { ReactNode } from "react";

type QuoteProps = {
  children: ReactNode;
  author?: string;
  role?: string;
};

export default function Quote({ children, author, role }: QuoteProps) {
  return (
    <figure className="my-10 rounded-2xl border border-white/10 bg-white/[0.03] p-6 md:p-8">
      <blockquote className="mb-4 border-l-2 border-[#F56E0F] pl-4 text-xl leading-9 text-white/90">{children}</blockquote>
      {author ? (
        <figcaption className="text-sm text-white/70">
          {author}
          {role ? <span className="text-white/50"> · {role}</span> : null}
        </figcaption>
      ) : null}
    </figure>
  );
}
