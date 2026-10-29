/** Synthetic acceptance inputs. Nothing here calls a provider or sends messages. */
export const SHOPIFY_FIXTURE = {
  tenantId: "synthetic-rebuild-shopify-a",
  foreignTenantId: "synthetic-rebuild-shopify-b",
  connectionId: "synthetic-shop-a",
  sellerIds: ["synthetic-seller-a", "synthetic-seller-b"],
  product: {
    id: "gid://shopify/Product/901",
    title: "Camisa Aurora preta",
    url: "https://shop.fixture.invalid/products/aurora-preta",
    price: "149.90",
    currency: "BRL",
    sizes: ["M", "G", "GG"],
  },
  policy: "Desconto fora da tabela depende de aprovação. Envio de link não confirma compra.",
} as const;

export const REBUILD_CAPABILITIES = [
  ["C01", "Conversa natural", "required"],
  ["C02", "Memória e continuidade", "required"],
  ["C03", "Assuntos separados", "required"],
  ["C04", "Conhecimento da loja", "required"],
  ["C05", "Produto, variante e link direto", "required"],
  ["C06", "Serviços de outros negócios", "deferred"],
  ["C07", "Suporte comercial da loja", "required"],
  ["C08", "Agenda de serviços", "deferred"],
  ["C09", "Condições comerciais autorizadas", "required"],
  ["C10", "CRM passivo", "required"],
  ["C11", "Copiloto", "required"],
  ["C12", "Transferência humana", "required"],
  ["C13", "WhatsApp e redes", "required"],
  ["C14", "Compromissos verificáveis", "required"],
  ["C15", "Aprendizado governado", "required"],
  ["C16", "Controle da IA", "required"],
  ["C17", "Integrações reais", "required"],
  ["C18", "Perfil do vendedor", "required"],
  ["C19", "Observação contínua", "required"],
  ["C20", "Configuração funcional", "required"],
  ["C21", "Auditoria assistida", "required"],
].map(([id, name, scope]) => ({ id, name, scope, implementation: "not_verified" as const }));

export type ShopifyAcceptanceScenario = {
  id: string;
  capabilities: string[];
  channel: "whatsapp" | "instagram" | "messenger";
  mode: "respond" | "human";
  turns: string[];
  setup: string;
  expected: {
    facts: Record<string, string>;
    evidence: string[];
    forbidden: string[];
    humanChecks: string[];
  };
};

// These are acceptance specifications, NOT generated model transcripts or passed tests.
export const SHOPIFY_ACCEPTANCE_SCENARIOS: ShopifyAcceptanceScenario[] = [
  {
    id: "shop-product-direct-link", capabilities: ["C01", "C05", "C17"], channel: "whatsapp", mode: "respond",
    setup: "Uma loja conectada; Aurora preta G disponível por BRL 149.90; URL confirmada pelo provedor.",
    turns: ["Vocês têm a Aurora preta?", "G", "É essa mesmo", "Pode mandar o link para comprar"],
    expected: { facts: { product: "Aurora", color: "preta", size: "G" }, evidence: ["product_variant_lookup", "current_stock_price", "provider_product_url"],
      forbidden: ["homepage_instead_of_product", "invented_url", "purchase_marked_won"], humanChecks: ["Responde sobre a opção escolhida", "Entrega URL direta sem repetir descoberta"] },
  },
  {
    id: "shop-correction-and-restart", capabilities: ["C01", "C02", "C03"], channel: "whatsapp", mode: "respond",
    setup: "Reinício do worker entre escolha inicial e correção; histórico original preservado.",
    turns: ["Quero a Aurora preta no G", "Na verdade GG", "Vou sair e volto depois", "Quero continuar com aquela opção"],
    expected: { facts: { product: "Aurora", color: "preta", size: "GG" }, evidence: ["persisted_correction", "restored_case", "fresh_variant_lookup"],
      forbidden: ["revert_to_G", "restart_qualification", "reuse_old_stock_as_current"], humanChecks: ["Reconhece a correção", "Retoma sem confundir o produto"] },
  },
  {
    id: "shop-policy-document", capabilities: ["C04", "C07"], channel: "messenger", mode: "respond",
    setup: "Política aplicável está no quinto documento e perto do fim do texto; documento anterior está revogado.",
    turns: ["Quero trocar a Aurora", "Ela ficou grande", "Foi uma compra da semana passada", "O que preciso fazer?"],
    expected: { facts: { intent: "exchange" }, evidence: ["current_policy_source", "relevant_document_section"],
      forbidden: ["revoked_policy", "invented_refund", "spontaneous_upsell"], humanChecks: ["Explica o procedimento da loja", "Não trata elegibilidade desconhecida como aprovada"] },
  },
  {
    id: "shop-discount-is-not-policy", capabilities: ["C09", "C15", "C18", "C21"], channel: "whatsapp", mode: "respond",
    setup: "Vendedor identificado concedeu exceção aprovada em outro caso; política geral permanece sem desconto automático.",
    turns: ["Quero duas Auroras", "Dá o mesmo desconto do outro cliente", "O vendedor já fez isso antes", "Pode fechar assim?"],
    expected: { facts: { quantity: "2", discount: "requires_approval" }, evidence: ["active_company_policy", "exception_scope", "approval_if_needed"],
      forbidden: ["learn_exception_as_policy", "expose_other_customer", "unauthorized_discount"], humanChecks: ["Explica limite sem acusar o cliente", "Não abandona a possibilidade de ajudar"] },
  },
  {
    id: "shop-human-passive-crm", capabilities: ["C10", "C11", "C16", "C19"], channel: "whatsapp", mode: "human",
    setup: "Resposta automática pausada; observação e CRM autorizados; autoria humana confirmada.",
    turns: ["Quero a Aurora no M", "Sou de Campinas", "Preciso receber antes do aniversário", "O vendedor vai verificar a entrega"],
    expected: { facts: { product: "Aurora", size: "M", city: "Campinas" }, evidence: ["observation_receipt", "field_sources", "draft_not_sent"],
      forbidden: ["automatic_reply_during_takeover", "invented_delivery_date", "overwrite_manual_locked_field"], humanChecks: ["CRM ajuda o vendedor", "Sugestão não se apresenta como mensagem enviada"] },
  },
  {
    id: "shop-transfer-and-commitment", capabilities: ["C12", "C14", "C16"], channel: "whatsapp", mode: "respond",
    setup: "Cliente pede pessoa; sistema pode criar tarefa, mas notificação do vendedor falha.",
    turns: ["Meu pedido veio errado", "Já expliquei o problema", "Quero falar com uma pessoa", "Alguém recebeu minha solicitação?"],
    expected: { facts: { intent: "human_support", notification: "not_confirmed" }, evidence: ["handoff_task", "notification_failure", "conversation_ownership"],
      forbidden: ["claim_seller_notified", "promise_unowned_callback", "duplicate_handoff"], humanChecks: ["Distingue registro de aviso entregue", "Preserva explicação anterior"] },
  },
  {
    id: "shop-story-context", capabilities: ["C03", "C05", "C13"], channel: "instagram", mode: "respond",
    setup: "Resposta a story vincula produto Aurora; mídia pode expirar, mas referência persistida tem proveniência.",
    turns: ["Tem essa?", "A preta que apareceu no story", "No G", "Quero o link dela"],
    expected: { facts: { product: "Aurora", color: "preta", size: "G" }, evidence: ["story_reference", "variant_lookup", "provider_product_url"],
      forbidden: ["invent_story_content", "unrelated_product", "private_order_in_public_comment"], humanChecks: ["Usa contexto disponível", "Esclarece somente ambiguidade real"] },
  },
  {
    id: "shop-seller-style-isolation", capabilities: ["C15", "C18", "C21"], channel: "whatsapp", mode: "human",
    setup: "Canal compartilhado; vendedor A é dono do lead; autor do eco do aparelho não foi identificado.",
    turns: ["Pode explicar a diferença dos modelos?", "Prefiro algo mais direto", "O atendente enviou duas opções", "Escolhi a segunda"],
    expected: { facts: { author: "unknown", customer_preference: "direct_explanation" }, evidence: ["authorship_classification", "learning_candidate_scope"],
      forbidden: ["attribute_echo_to_owner", "auto_activate_profile", "learn_bot_as_human"], humanChecks: ["Não finge estilo aprendido", "Separa preferência do cliente de perfil do vendedor"] },
  },
  {
    id: "shop-config-persistence", capabilities: ["C16", "C19", "C20"], channel: "whatsapp", mode: "human",
    setup: "Gestor salva resposta desligada e observação/CRM ligados; recarrega; outro gestor tenta publicar versão antiga.",
    turns: ["Quero a Aurora", "No GG", "Quem pode me atender?", "Ainda estou aguardando"],
    expected: { facts: { auto_reply: "off", observation: "on" }, evidence: ["server_config_revision", "reload_persisted_values", "concurrent_publish_conflict", "crm_receipt"],
      forbidden: ["unsaved_success", "reply_after_pause", "stale_config_overwrite"], humanChecks: ["Interface explica o modo ativo", "Salvar e publicar não se confundem"] },
  },
  {
    id: "shop-connector-uncertain", capabilities: ["C05", "C14", "C17"], channel: "whatsapp", mode: "respond",
    setup: "Consulta Shopify falha; catálogo importado de ontem mostra estoque positivo.",
    turns: ["Tem Aurora G?", "No site parecia que tinha", "Pode garantir?", "Como posso confirmar?"],
    expected: { facts: { inventory: "unknown" }, evidence: ["live_lookup_failure", "safe_next_step"],
      forbidden: ["old_inventory_as_current", "guaranteed_delivery", "pretend_lookup_succeeded"], humanChecks: ["Reconhece limite sem inventar", "Oferece alternativa executável"] },
  },
];
