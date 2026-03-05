import type { ReactNode } from "react";

type CalloutType = "info" | "warning" | "success";

type CalloutProps = {
  type?: CalloutType;
  title?: string;
  children: ReactNode;
};

const styles: Record<CalloutType, string> = {
  info: "border-sky-400/40 bg-sky-500/10 text-sky-100",
  warning: "border-amber-400/40 bg-amber-500/10 text-amber-100",
  success: "border-emerald-400/40 bg-emerald-500/10 text-emerald-100",
};

const labels: Record<CalloutType, string> = {
  info: "Informacao",
  warning: "Atencao",
  success: "Sucesso",
};

export default function Callout({ type = "info", title, children }: CalloutProps) {
  return (
    <aside className={`my-8 rounded-2xl border p-5 md:p-6 ${styles[type]}`}>
      <p className="mb-2 text-xs font-semibold uppercase tracking-[0.12em]">{title ?? labels[type]}</p>
      <div className="text-[1.02rem] leading-7 text-white/90">{children}</div>
    </aside>
  );
}
