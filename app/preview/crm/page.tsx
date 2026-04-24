import type { CSSProperties } from "react";
import CrmPreviewPage from "@/app/cliente/painel/crm-preview/page";

const previewShellStyle = {
  "--cliente-sidebar-width": "304px",
} as CSSProperties;

export default function PublicCrmPreviewPage() {
  return (
    <div data-client-theme="light" style={previewShellStyle}>
      <div className="min-h-screen bg-slate-100 text-slate-900 [font-family:var(--font-sans)]">
        <main className="px-4 pb-12 pt-8 lg:px-6">
          <div className="mx-auto max-w-[1280px]">
            <CrmPreviewPage />
          </div>
        </main>
      </div>
    </div>
  );
}
