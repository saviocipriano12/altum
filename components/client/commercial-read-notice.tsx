import Link from "next/link";
import { commercialReadNotice } from "@/lib/crm-read-state";

export function CommercialReadNotice({ state }: { state?: unknown }) {
  const notice = commercialReadNotice(state);
  if (!notice) return null;
  return <div role="status" className="mt-3 rounded-2xl border border-amber-300 bg-amber-50 p-3 text-xs text-amber-950 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-100">
    <p className="font-semibold">{notice.title}</p>
    <p className="mt-1 leading-5">{notice.detail}</p>
    {notice.pendingCount > 1 && <p className="mt-1">{notice.pendingCount} mensagens ainda precisam de conferência.</p>}
    <Link href={notice.href} className="mt-2 inline-block font-semibold underline underline-offset-2">{notice.action}</Link>
  </div>;
}
