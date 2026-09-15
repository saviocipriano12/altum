"use client";

import AssinaturaPage from "../../../assinatura/page";
import { useClienteTenant } from "@/app/cliente/ClientePanelGuard";

export default function ClienteFaturamentoPage() {
  const { tenant } = useClienteTenant();
  return <AssinaturaPage tenantId={tenant?.tenantId} />;
}
