export function getFirebaseAuthErrorCode(error: unknown) {
  return typeof error === "object" && error && "code" in error
    ? String((error as { code?: unknown }).code || "")
    : "";
}

export function firebaseAuthErrorMessage(error: unknown, fallback: string) {
  const code = getFirebaseAuthErrorCode(error);
  const messages: Record<string, string> = {
    "auth/email-already-in-use": "Ja existe uma conta com este e-mail. Entre ou recupere sua senha.",
    "auth/invalid-email": "Informe um e-mail valido.",
    "auth/invalid-credential": "E-mail ou senha incorretos.",
    "auth/user-disabled": "Esta conta esta bloqueada. Fale com o suporte da Altum.",
    "auth/weak-password": "A senha nao atende aos requisitos de seguranca.",
    "auth/too-many-requests": "Muitas tentativas. Aguarde alguns minutos antes de tentar novamente.",
    "auth/network-request-failed": "Nao foi possivel conectar. Confira sua internet e tente novamente.",
    "auth/popup-closed-by-user": "A janela do Google foi fechada antes de concluir o acesso.",
    "auth/popup-blocked": "O navegador bloqueou a janela do Google. Libere pop-ups e tente novamente.",
    "auth/operation-not-allowed": "Este metodo de acesso ainda nao esta habilitado. Fale com o suporte.",
    "auth/unauthorized-domain": "Este dominio ainda nao foi autorizado no Firebase.",
    "auth/internal-error": "O Firebase nao conseguiu concluir a operacao. Atualize a pagina e tente novamente.",
    "auth/expired-action-code": "Este link expirou. Solicite um novo e-mail.",
    "auth/invalid-action-code": "Este link e invalido ou ja foi utilizado. Solicite um novo e-mail.",
  };
  return messages[code] || fallback;
}
