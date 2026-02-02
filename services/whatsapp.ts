// src/services/whatsapp.ts

const META_TOKEN = process.env.NEXT_PUBLIC_META_WA_TOKEN;
const PHONE_NUMBER_ID = process.env.NEXT_PUBLIC_META_PHONE_ID;
const VERSION = "v21.0"; // Versão estável da Graph API

export const WhatsAppService = {
  /**
   * Envia uma mensagem de texto real via Meta Cloud API
   */
  async sendMessage(to: string, text: string) {
    // 1. Limpeza do número: remove espaços, parênteses e traços
    const cleanNumber = to.replace(/\D/g, "");

    if (!META_TOKEN || !PHONE_NUMBER_ID) {
      console.error("ERRO: Chaves da Meta não encontradas no .env.local");
      throw new Error("Configuração de API ausente.");
    }

    try {
      const response = await fetch(
        `https://graph.facebook.com/${VERSION}/${PHONE_NUMBER_ID}/messages`,
        {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${META_TOKEN}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            messaging_product: "whatsapp",
            recipient_type: "individual",
            to: cleanNumber,
            type: "text",
            text: { body: text },
          }),
        }
      );

      const data = await response.json();

      if (!response.ok) {
        // Se a Meta retornar erro (ex: número inválido ou token expirado)
        throw new Error(data.error?.message || "Erro desconhecido na API da Meta");
      }

      return data;
    } catch (error) {
      console.error("Falha crítica no envio via WhatsAppService:", error);
      throw error;
    }
  }
};