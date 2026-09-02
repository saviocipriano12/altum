import Link from "next/link";
import { ArrowRight } from "lucide-react";

type CtaButtonProps = {
  href: string;
  label: string;
  variant?: "primary" | "secondary";
  className?: string;
};

export function CtaButton({
  href,
  label,
  variant = "primary",
  className = "",
}: CtaButtonProps) {
  if (variant === "secondary") {
    return (
      <Link
        href={href}
        className={`inline-flex items-center gap-2 rounded-full border border-white/12 bg-white/[0.035] px-6 py-3.5 text-sm font-semibold text-white/84 transition duration-300 hover:border-white/24 hover:bg-white/[0.07] hover:text-white ${className}`}
      >
        {label}
      </Link>
    );
  }

  return (
    <Link
      href={href}
      className={`group inline-flex items-center gap-2 rounded-full bg-[#f56e0f] px-6 py-3.5 text-sm font-semibold text-white shadow-[0_18px_60px_rgba(245,110,15,0.24)] transition duration-300 hover:-translate-y-0.5 hover:bg-[#ff7f26] hover:shadow-[0_22px_80px_rgba(245,110,15,0.34)] ${className}`}
    >
      {label}
      <ArrowRight className="h-4 w-4 transition group-hover:translate-x-0.5" />
    </Link>
  );
}
