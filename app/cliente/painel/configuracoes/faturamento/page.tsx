"use client";

import AssinaturaPage from "@/components/client/subscription-screen";
import { useClienteTenant } from "@/app/cliente/ClientePanelGuard";

export default function ClienteFaturamentoPage() {
  const { tenant } = useClienteTenant();
  return <AssinaturaPage tenantId={tenant?.tenantId} />;
}
