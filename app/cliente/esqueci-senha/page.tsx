import { EsqueciSenhaForm } from "./esqueci-senha-form";

export default async function EsqueciSenhaPage({
  searchParams,
}: {
  searchParams: Promise<{ email?: string | string[] }>;
}) {
  const params = await searchParams;
  const initialEmail = Array.isArray(params.email) ? params.email[0] : params.email;
  return <EsqueciSenhaForm initialEmail={String(initialEmail || "")} />;
}
