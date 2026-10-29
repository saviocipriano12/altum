type Ticket = { scope: string; controller: AbortController };

/** A slow response must never replace a newly selected client's file. */
export class CrmDetailRequests {
  private active: Ticket | null = null;
  begin(scope: string, background = false): Ticket | null {
    if (background && this.active?.scope === scope) return null;
    this.active?.controller.abort();
    const ticket = { scope, controller: new AbortController() };
    this.active = ticket;
    return ticket;
  }
  accepts(ticket: Ticket, currentScope: string) {
    return this.active === ticket && ticket.scope === currentScope && !ticket.controller.signal.aborted;
  }
  finish(ticket: Ticket) {
    if (this.active === ticket) this.active = null;
  }
  cancelScope(scope: string) {
    if (this.active?.scope !== scope) return;
    this.active.controller.abort();
    this.active = null;
  }
}

export function crmDetailScope(tenantId: string | undefined, userId: string | undefined, leadId: string | null) {
  return JSON.stringify([tenantId || "", userId || "", leadId || ""]);
}

/** Keep a chosen, unsaved stage when fresh facts arrive for the same client. */
export function reconcileCrmStageDraft(current: string, prior: { id: string; stage: string } | null, incoming: { id: string; stage: string }) {
  return prior?.id === incoming.id && current !== prior.stage ? current : incoming.stage;
}
