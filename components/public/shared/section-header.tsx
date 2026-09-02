import type { ReactNode } from "react";

type SectionHeaderProps = {
  eyebrow: string;
  title: ReactNode;
  description: ReactNode;
  light?: boolean;
  centered?: boolean;
};

export function SectionHeader({
  eyebrow,
  title,
  description,
  light,
  centered,
}: SectionHeaderProps) {
  return (
    <div className={centered ? "mx-auto max-w-4xl text-center" : "max-w-4xl"}>
      <p
        className={`altum-display text-xs font-bold uppercase tracking-[0.28em] ${
          light ? "text-[#f56e0f]" : "text-[#f8a25d]"
        }`}
      >
        {eyebrow}
      </p>
      <h2 className="altum-display mt-4 text-[clamp(2.35rem,6vw,5.4rem)] font-semibold leading-[0.94] tracking-[-0.07em] text-white">
        {title}
      </h2>
      <p className="mt-6 max-w-3xl text-base leading-8 text-white/62 md:text-lg">
        {description}
      </p>
    </div>
  );
}
