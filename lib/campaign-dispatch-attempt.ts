type AttemptStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;
export type CampaignDispatchAttempt = { id: string; scheduledAt: string | null };
const keyFor = (scope: string[]) => `altum-campaign-dispatch-v1:${JSON.stringify(scope)}`;

/** Persist before POST. Unknown responses retain the same key across page reloads. */
export function getCampaignDispatchAttempt(storage: AttemptStorage, scope: string[], scheduledAt: string | null, makeId: () => string): CampaignDispatchAttempt {
  if (scope.length !== 3 || scope.some(part => !part)) throw new Error("Sessao indisponivel para iniciar disparo.");
  const key = keyFor(scope);
  let raw: string | null;
  try { raw = storage.getItem(key); }
  catch { throw new Error("Nao foi possivel recuperar a identificacao do disparo neste navegador. Nenhuma nova solicitacao foi enviada."); }
  if (raw) {
    let saved: CampaignDispatchAttempt;
    try { saved = JSON.parse(raw) as CampaignDispatchAttempt; }
    catch { throw new Error("Registro do disparo pendente invalido. Confira a execucao antes de tentar novamente."); }
    if (!saved || typeof saved.id !== "string" || !/^[a-zA-Z0-9._:-]{8,180}$/.test(saved.id) ||
      (saved.scheduledAt !== null && typeof saved.scheduledAt !== "string")) throw new Error("Registro do disparo pendente invalido. Confira a execucao antes de tentar novamente.");
    if (saved.scheduledAt !== scheduledAt) throw new Error("Existe um disparo sem confirmacao com outro horario. Confira a execucao anterior antes de alterar o agendamento.");
    return saved;
  }
  const attempt = { id: makeId(), scheduledAt };
  if (!/^[a-zA-Z0-9._:-]{8,180}$/.test(attempt.id)) throw new Error("Nao foi possivel criar a identificacao do disparo.");
  try { storage.setItem(key, JSON.stringify(attempt)); }
  catch { throw new Error("Nao foi possivel guardar a identificacao do disparo neste navegador. Nenhuma nova solicitacao foi enviada."); }
  return attempt;
}
export function acknowledgeCampaignDispatch(storage: AttemptStorage, scope: string[], id: string) {
  try {
    const key = keyFor(scope), raw = storage.getItem(key);
    if (!raw) return true;
    if ((JSON.parse(raw) as CampaignDispatchAttempt).id !== id) return false;
    storage.removeItem(key); return true;
  } catch { return false; } // Server already confirmed; never turn that into a new POST.
}
