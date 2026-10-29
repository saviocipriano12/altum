/** Only this verified pre-delivery failure is eligible for a text fallback. */
export class AiVoicePreparationError extends Error {
  constructor(message: string) { super(message); this.name = "AiVoicePreparationError"; }
}
export class AiVoiceDeliveryPendingError extends Error {
  constructor() { super("Resposta em voz registrada na fila, mas a entrega ainda nao foi confirmada."); this.name = "AiVoiceDeliveryPendingError"; }
}
