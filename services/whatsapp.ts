// Estes valores você pega no painel do Meta for Developers
const META_TOKEN = process.env.NEXT_PUBLIC_META_WA_TOKEN; 
const PHONE_NUMBER_ID = process.env.NEXT_PUBLIC_META_PHONE_ID;
const VERSION = "v21.0"; // Versão atual da API

export const WhatsAppService = {
  async sendMessage(to: string, text: string) {
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
            to: to, // O número deve estar no formato 55319...
            type: "text",
            text: { body: text },
          }),
        }
      );

      const data = await response.json();
      if (data.error) throw new Error(data.error.message);
      return data;
    } catch (error) {
      console.error("Erro Meta API:", error);
      throw error;
    }
  }
};