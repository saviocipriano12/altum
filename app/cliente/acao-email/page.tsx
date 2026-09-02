import { AcaoEmailClient } from "./acao-email-client";

type EmailActionParams = {
  mode?: string | string[];
  oobCode?: string | string[];
};

function first(value?: string | string[]) {
  return Array.isArray(value) ? value[0] || "" : value || "";
}

export default async function AcaoEmailPage({ searchParams }: { searchParams: Promise<EmailActionParams> }) {
  const params = await searchParams;
  return <AcaoEmailClient mode={first(params.mode)} oobCode={first(params.oobCode)} />;
}
