import Link from "next/link";
import type { CSSProperties } from "react";
import {
  ArrowRight,
  Check,
  CalendarClock,
  MessageCircleMore,
  Sparkles,
  Target,
  UsersRound,
  Workflow,
} from "lucide-react";
import { SiteShell } from "../site-shell";
import { AltumLiveDemo } from "./altum-live-demo";
import { ProductPreview } from "./product-preview";
import { IntegrationMarquee } from "./integration-marquee";
import { ArticleCarousel } from "./article-carousel";
import { SocialSection } from "./social-section";
import { PricingPlans } from "../pricing-plans";
import { PublicFaq, PublicSectionHeading } from "../shared/public-sections";
import { getAllBlogPosts } from "@/lib/blog";
import styles from "../public-site.module.css";

export const homeFaq = [
  [
    "O que a Altum reúne em uma plataforma?",
    "Conversas, clientes, oportunidades, pipeline, agenda, produtos, campanhas, relatórios e inteligência artificial. A disponibilidade dos recursos varia por plano e configuração.",
  ],
  [
    "A IA substitui o atendimento da minha equipe?",
    "A IA apoia o atendimento e a operação conforme as regras configuradas. Sua equipe continua no controle e pode assumir a conversa quando necessário.",
  ],
  [
    "Posso usar o WhatsApp da minha empresa?",
    "O WhatsApp pode ser conectado à operação. A configuração depende do provedor, das permissões e do plano escolhido. Na demonstração, avaliamos o caminho para a sua empresa.",
  ],
  [
    "Como funciona o teste gratuito?",
    "Os planos elegíveis oferecem sete dias de teste, sem cartão. Confira na página de planos as condições, limites e recursos vigentes antes de começar.",
  ],
  [
    "Vocês ajudam na implantação?",
    "Sim. A implantação assistida ajuda a configurar equipe, canais, funil e base de conhecimento, além de orientar o time. O escopo e o investimento são definidos conforme o cenário contratado.",
  ],
] as const;

export async function ProductHome() {
  const posts = (await getAllBlogPosts()).slice(0, 8);
  return (
    <SiteShell>
      <section className={styles.hero}>
        <div className={styles.container}>
          <p className={styles.eyebrow}>
            <span />
            Sua operação comercial com IA
          </p>
          <h1>
            Conversas que conectam.
            <br />
            <em>Vendas que avançam.</em>
          </h1>
          <p className={styles.heroDescription}>
            CRM com IA para reunir WhatsApp, Instagram, clientes e
            oportunidades. Sua equipe atende com contexto, acompanha as vendas e
            organiza o próximo passo em uma só plataforma.
          </p>
          <div className={styles.actions}>
            <Link
              href="/contato?interest=demonstracao"
              className={styles.button}
            >
              Agendar demonstração{" "}
              <span>
                <ArrowRight size={18} />
              </span>
            </Link>
            <Link href="#produto" className={styles.secondaryButton}>
              Explorar a plataforma <ArrowRight size={16} />
            </Link>
          </div>
          <div className={styles.heroNotes}>
            {[
              "Conversas + CRM + IA",
              "Humano no controle",
              "Do contato ao próximo passo",
            ].map((text) => (
              <span key={text}>
                <Check size={13} />
                {text}
              </span>
            ))}
          </div>
          <div className={styles.productStage} data-reveal>
            <div className={styles.windowBar}>
              <div className={styles.windowDots}>
                <i />
                <i />
                <i />
              </div>
              <span>ALTUM · VISÃO DA OPERAÇÃO</span>
              <span>Conversas. Clientes. Inteligência.</span>
            </div>
            <ProductPreview />
          </div>
          <p className={styles.stageLabel}>
            Visualização ilustrativa da plataforma, com dados de exemplo.
          </p>
        </div>
      </section>
      <IntegrationMarquee />
      <AltumLiveDemo />
      <section id="inteligencia" className={styles.darkSection}>
        <div className={styles.container}>
          <PublicSectionHeading
            eyebrow="Inteligência aplicada"
            title={
              <>
                Sua equipe mais presente.
                <br />
                Sua operação mais inteligente.
              </>
            }
            description="A tecnologia trabalha nos bastidores para o seu time se concentrar na próxima boa conversa."
          />
          <div className={styles.capabilityGrid}>
            <article className={styles.capabilityCard} data-reveal>
              <div className={styles.miniGraphic} aria-hidden>
                <div className={styles.miniBubble}>
                  Olá! Quero conhecer as opções.
                </div>
                <div className={styles.miniBubble}>
                  Claro. Vamos entender o que você precisa.
                </div>
              </div>
              <div className={styles.capabilityCopy}>
                <h3>Atendimento com continuidade</h3>
                <p>
                  Histórico, contexto e equipe conectados para cada conversa
                  continuar do lugar certo.
                </p>
              </div>
            </article>
            <article className={styles.capabilityCard} data-reveal>
              <div className={styles.miniGraphic} aria-hidden>
                <div className={styles.aiOrbit}>
                  <Sparkles />
                </div>
              </div>
              <div className={styles.capabilityCopy}>
                <h3>IA com o contexto do seu negócio</h3>
                <p>
                  Conhecimento, orientação e apoio para responder e encontrar
                  prioridades, com controle humano.
                </p>
              </div>
            </article>
            <article className={styles.capabilityCard} data-reveal>
              <div className={styles.miniGraphic} aria-hidden>
                <div className={styles.miniTimeline}>
                  <div>
                    <span>09:00</span>Retomar proposta <Check size={13} />
                  </div>
                  <div>
                    <span>14:30</span>Conversa agendada
                  </div>
                </div>
              </div>
              <div className={styles.capabilityCopy}>
                <h3>Próximo passo à vista</h3>
                <p>
                  Agenda, tarefas e follow-ups para acompanhar a venda depois da
                  primeira mensagem.
                </p>
              </div>
            </article>
            <article className={styles.capabilityCard} data-reveal>
              <div className={styles.miniGraphic} aria-hidden>
                <div className={styles.miniBars}>
                  {[35, 57, 45, 75, 90].map((height, index) => (
                    <i
                      key={index}
                      style={{ "--bar": `${height}px` } as CSSProperties}
                    />
                  ))}
                </div>
              </div>
              <div className={styles.capabilityCopy}>
                <h3>Visibilidade para decidir</h3>
                <p>
                  Relatórios aproximam atendimento, campanhas e resultado da sua
                  rotina de gestão.
                </p>
              </div>
            </article>
            <article className={styles.capabilityCard} data-reveal>
              <div className={styles.miniGraphic} aria-hidden>
                <div className={styles.ownership}>
                  <span>IA</span>
                  <ArrowRight size={18} />
                  <span>
                    <UsersRound size={22} />
                  </span>
                </div>
              </div>
              <div className={styles.capabilityCopy}>
                <h3>A pessoa certa, na hora certa</h3>
                <p>
                  Quando o atendimento precisa da equipe, a conversa segue com
                  seu histórico.
                </p>
              </div>
            </article>
          </div>
        </div>
      </section>
      <section className={`${styles.flowSection} ${styles.storySection}`}>
        <div className={styles.container}>
          <PublicSectionHeading
            eyebrow="Da conversa ao resultado"
            title="Uma mensagem é só o começo."
            description="A Altum mantém o contexto vivo entre atendimento, venda e acompanhamento."
          />
          <div className={styles.flowLayout}>
            <div className={styles.flowVisual}>
              <p className={styles.eyebrow}>
                <MessageCircleMore size={14} />
                Um exemplo do dia a dia
              </p>
              <h3>O interesse encontra um caminho.</h3>
              <div className={styles.conversationSample}>
                <div className={styles.sampleHeader}>
                  <span>MC</span>
                  <div>
                    Marina Costa<small>Contato de exemplo · WhatsApp</small>
                  </div>
                </div>
                <div className={styles.messageIn}>
                  Gostei da proposta. Podemos conversar amanhã?
                </div>
                <div className={styles.messageOut}>
                  Podemos, sim! Vou alinhar o melhor horário com você.
                </div>
                <div className={styles.opportunitySample}>
                  <Sparkles size={18} />
                  <div>
                    <strong>Oportunidade em andamento</strong>
                    <br />
                    Próxima ação: confirmar reunião.
                  </div>
                </div>
              </div>
            </div>
            <div>
              {[
                [
                  MessageCircleMore,
                  "01",
                  "A conversa chega com contexto.",
                  "O contato entra pelo canal conectado e o histórico acompanha o atendimento.",
                ],
                [
                  Target,
                  "02",
                  "O interesse vira oportunidade.",
                  "Cliente, responsável e etapa ficam organizados para a equipe acompanhar a negociação.",
                ],
                [
                  CalendarClock,
                  "03",
                  "O próximo passo tem lugar.",
                  "Retorno, reunião ou proposta: a agenda ajuda a dar continuidade ao que foi combinado.",
                ],
                [
                  Workflow,
                  "04",
                  "A operação aprende a avançar.",
                  "IA, campanhas e relatórios apoiam o acompanhamento e ajudam a encontrar onde agir.",
                ],
              ].map(([, number, title, text]) => (
                <article
                  className={styles.flowStep}
                  key={String(number)}
                  data-reveal
                >
                  <span className={styles.stepNumber}>{String(number)}</span>
                  <div>
                    <h3>{String(title)}</h3>
                    <p>{String(text)}</p>
                  </div>
                </article>
              ))}
            </div>
          </div>
        </div>
      </section>
      <section className={`${styles.section} ${styles.plansSection}`}>
        <div className={styles.container}>
          <PublicSectionHeading
            eyebrow="No ritmo da sua empresa"
            title="Comece com estrutura. Cresça com a Altum."
            description="Escolha o plano para o seu momento. Veja limites, implantação e condições antes de começar."
          />
          <PricingPlans />
          <div className={styles.actions}>
            <Link href="/precos" className={styles.textLink}>
              Comparar todos os planos <ArrowRight size={17} />
            </Link>
          </div>
        </div>
      </section>
      {posts.length > 0 && (
        <section className={`${styles.section} ${styles.articlesSection}`}>
          <div className={styles.container}>
            <PublicSectionHeading
              eyebrow="Conversas que fazem pensar"
              title="Ideias para uma operação melhor."
            />
            <ArticleCarousel posts={posts} />
          </div>
        </section>
      )}
      <PublicFaq items={homeFaq} />
      <SocialSection />
    </SiteShell>
  );
}
