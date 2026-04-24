"use client";

import Link from "next/link";
import { useCallback, useMemo, useState } from "react";
import { AlertTriangle } from "lucide-react";
import { usePathname } from "next/navigation";
import { authedFetch } from "@/app/lib/authed-fetch";
import { useClienteTenant } from "@/app/cliente/ClientePanelGuard";
import { useAdaptivePolling } from "@/app/cliente/painel/hooks/use-adaptive-polling";

type AutomationSummaryPayload = {
  summary?: {
    finance?: {
      dueSoonCount?: number;
      dueSoonTotal?: number;
      nextDueDate?: string | null;
    };
  };
};

function brl(value: number) {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function ymdToBr(value?: string | null) {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return "sem data";
  const [year, month, day] = value.split("-");
  return `${day}/${month}/${year}`;
}

export function ClienteFinanceScreenAlert() {
  const pathname = usePathname();
  const { tenant } = useClienteTenant();
  const tenantId = tenant?.tenantId || "";
  const [financeAlert, setFinanceAlert] = useState({
    dueSoonCount: 0,
    dueSoonTotal: 0,
    nextDueDate: "",
  });

  const refresh = useCallback(async () => {
    if (!tenantId) return;
    const res = await authedFetch(`/api/tenant/${tenantId}/automation-summary`);
    const payload = (await res.json()) as AutomationSummaryPayload;
    if (!res.ok) return;

    const finance = payload.summary?.finance || {};
    setFinanceAlert({
      dueSoonCount: Number(finance.dueSoonCount || 0),
      dueSoonTotal: Number(finance.dueSoonTotal || 0),
      nextDueDate: String(finance.nextDueDate || ""),
    });
  }, [tenantId]);

  useAdaptivePolling({
    enabled: Boolean(tenantId),
    onTick: refresh,
    fastIntervalMs: 60_000,
    slowIntervalMs: 180_000,
    runOnMount: true,
    source: "finance-screen-alert",
  });

  const shouldShow = useMemo(() => {
    if (!pathname?.startsWith("/cliente/painel")) return false;
    return financeAlert.dueSoonCount > 0;
  }, [financeAlert.dueSoonCount, pathname]);

  if (!shouldShow) return null;

  return (
    <Link
      href="/cliente/painel/comercial?financeStatus=pendente"
      className="fixed inset-x-3 top-[86px] z-[60] rounded-xl border border-amber-400/30 bg-amber-400/10 px-3 py-2 text-xs text-amber-100 shadow-[var(--cliente-shadow-soft)] transition hover:bg-amber-400/15 lg:top-5 lg:left-[calc(var(--cliente-sidebar-width)+1.5rem)] lg:right-5"
    >
      <div className="flex items-start gap-2">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
        <div>
          <p className="font-semibold">
            {financeAlert.dueSoonCount} cobranca(s) vencem nos proximos 5 dias
          </p>
          <p className="mt-0.5 text-amber-100/90">
            Total {brl(financeAlert.dueSoonTotal)} | Proximo vencimento: {ymdToBr(financeAlert.nextDueDate)}.
          </p>
        </div>
      </div>
    </Link>
  );
}
