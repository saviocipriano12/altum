// CAMINHO: components/TypebotBubble.tsx
"use client";
import { useEffect } from "react";

export default function TypebotBubble() {
  useEffect(() => {
    // Evita carregar duas vezes
    if (document.getElementById("typebot-script")) return;

    const script = document.createElement("script");
    script.id = "typebot-script";
    script.type = "module";
    // Usamos a versão "latest" (mais recente) para evitar bugs de versão antiga
    script.innerHTML = `
      import Typebot from 'https://cdn.jsdelivr.net/npm/@typebot.io/js@0.10.9/dist/web.js';
      
      Typebot.initBubble({
        typebot: "altumia", // SEU ID
        apiHost: "https://typebot.io", // FORÇA A CONEXÃO CORRETA
        theme: {
          button: { backgroundColor: "#F56E0F", size: "medium" },
          previewMessage: { 
            backgroundColor: "#151419",
            textColor: "#FFFFFF",
            message: "Olá! Faça sua análise de viabilidade aqui. 🚀"
          },
        },
      });

      // Disponibiliza o Typebot para os botões do site
      window.Typebot = Typebot;
    `;
    
    document.body.appendChild(script);
  }, []);

  return null;
}
