import { RedefinirSenhaForm } from "./redefinir-senha-form";

type EmailActionParams = {
  oobCode?: string | string[];
};

export default async function RedefinirSenhaPage({ searchParams }: { searchParams: Promise<EmailActionParams> }) {
  const params = await searchParams;
  const oobCode = Array.isArray(params.oobCode) ? params.oobCode[0] : params.oobCode;
  return <RedefinirSenhaForm oobCode={String(oobCode || "")} />;
}
