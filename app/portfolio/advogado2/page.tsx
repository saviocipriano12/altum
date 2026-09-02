"use client";

import "./advogado.css";
import { useEffect } from "react";

const whatsappNumber = "5500000000000";

const links = {
  consult: "/diagnostico?entry=portfolio_advogado2_consult",
  analysis: "/diagnostico?entry=portfolio_advogado2_analysis",
  contact: "/diagnostico?entry=portfolio_advogado2_contact",
};

const highlights = [
  "Atendimento consultivo e contencioso",
  "Pessoas físicas e empresas",
  "Online e presencial em Campinas - SP",
  "Retorno inicial em até 24h úteis",
];

const metrics = [
  { value: "10+", label: "anos de experiência" },
  { value: "300+", label: "casos acompanhados" },
  { value: "4.9/5", label: "avaliação média" },
  { value: "100%", label: "atendimento personalizado" },
];

const areas = [
  {
    title: "Direito Trabalhista",
    description:
      "Atuação para empregados e empresas em rescisões, verbas trabalhistas, acordos, reclamações, defesas e prevenção de riscos.",
    bullets: ["Rescisões", "Acordos", "Defesas", "Consultivo"],
  },
  {
    title: "Direito Civil",
    description:
      "Suporte em contratos, indenizações, responsabilidade civil, cobranças e disputas patrimoniais com abordagem clara e objetiva.",
    bullets: ["Contratos", "Indenizações", "Cobranças", "Responsabilidade civil"],
  },
  {
    title: "Direito Empresarial",
    description:
      "Consultoria estratégica para negócios, estruturação contratual, análise de riscos e decisões empresariais com mais segurança.",
    bullets: ["Contratos empresariais", "Riscos", "Sócios", "Operações"],
  },
  {
    title: "Previdenciário",
    description:
      "Análise de benefícios, aposentadorias, revisões e planejamento previdenciário com orientação individualizada.",
    bullets: ["Benefícios", "Aposentadoria", "Revisões", "Planejamento"],
  },
];

const principles = [
  {
    title: "Clareza na orientação",
    description:
      "O cliente entende o cenário, os riscos e os próximos passos com explicações diretas e sem excesso de juridiquês.",
  },
  {
    title: "Estratégia sob medida",
    description:
      "Cada caso é conduzido considerando contexto, urgência, documentação e impacto prático da solução.",
  },
  {
    title: "Presença que gera confiança",
    description:
      "Uma apresentação institucional forte reduz barreiras e transmite seriedade antes mesmo do primeiro contato.",
  },
];

const timeline = [
  {
    step: "01",
    title: "Contato inicial",
    text: "O cliente apresenta sua situação e recebe direcionamento sobre o melhor formato de atendimento.",
  },
  {
    step: "02",
    title: "Análise do caso",
    text: "São avaliados documentos, contexto, urgência e os possíveis caminhos para condução jurídica.",
  },
  {
    step: "03",
    title: "Definição da estratégia",
    text: "A atuação é estruturada com clareza, previsibilidade e foco na proteção dos interesses do cliente.",
  },
  {
    step: "04",
    title: "Acompanhamento próximo",
    text: "O caso segue com comunicação objetiva, transparência e orientação ao longo de cada etapa.",
  },
];

const scenarios = [
  {
    title: "Quando um contrato importante precisa de revisão",
    text: "Uma análise preventiva pode evitar riscos, conflitos e prejuízos futuros antes da assinatura.",
  },
  {
    title: "Quando há insegurança sobre direitos e obrigações",
    text: "Orientação técnica ajuda a enxergar o cenário real e tomar decisões com mais segurança.",
  },
  {
    title: "Quando o problema já exige resposta rápida",
    text: "A condução estratégica e a definição clara dos próximos passos reduzem incerteza e exposição.",
  },
];

const publications = [
  {
    label: "Análise jurídica",
    title: "O valor da orientação preventiva em decisões empresariais",
    text: "Empresas amadurecem melhor quando decisões críticas são tomadas com suporte jurídico consistente e previsível.",
  },
  {
    label: "Trabalhista",
    title: "Como evitar erros em rescisões e acordos trabalhistas",
    text: "Pequenas falhas podem gerar conflitos maiores. A análise correta reduz riscos e protege todas as partes.",
  },
  {
    label: "Civil",
    title: "Contratos mais claros geram relações mais seguras",
    text: "A boa redação contratual não apenas formaliza, mas organiza expectativas e reduz conflitos futuros.",
  },
];

const testimonials = [
  {
    quote:
      "O atendimento foi claro desde o início. Entendi minha situação, os riscos e os próximos passos de forma muito objetiva.",
    name: "Carlos Henrique",
    context: "Cliente trabalhista",
  },
  {
    quote:
      "A experiência transmitiu seriedade desde o primeiro contato. Tudo foi conduzido com clareza e profissionalismo.",
    name: "Mariana Lopes",
    context: "Cliente civil",
  },
  {
    quote:
      "Percebi confiança no escritório tanto pelo atendimento quanto pela forma como cada detalhe foi apresentado e explicado.",
    name: "Ricardo Almeida",
    context: "Cliente empresarial",
  },
];

const faqs = [
  {
    question: "O atendimento pode ser feito online?",
    answer:
      "Sim. O atendimento inicial pode acontecer online, por WhatsApp ou videochamada, conforme a necessidade do caso.",
  },
  {
    question: "Em quanto tempo recebo retorno?",
    answer:
      "Em regra, o retorno inicial acontece com rapidez no horário comercial, para orientar os próximos passos.",
  },
  {
    question: "Quais documentos preciso enviar?",
    answer:
      "Depende da área e do tipo de caso. A equipe informa quais documentos são necessários após o primeiro contato.",
  },
  {
    question: "Esta página é uma demonstração?",
    answer:
      "Sim. Esta é uma landing page demonstrativa criada pela Altum para mostrar um posicionamento premium e mais aderente ao mercado jurídico.",
  },
];

export default function AdvocaciaPremiumPage() {
  useEffect(() => {
    const elements = Array.from(document.querySelectorAll('.reveal'));
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add('is-visible');
            observer.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.14 }
    );

    elements.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, []);

  return (
    <main className="lp-root">
      <div className="lp-topbar">
        <div className="lp-container lp-topbar-inner">
          <span>Advocacia estratégica para pessoas e empresas</span>
          <span>Atendimento online e presencial • Campinas - SP</span>
        </div>
      </div>

      <header className="lp-header">
        <nav className="lp-container lp-nav">
          <a href="#inicio" className="lp-brand" aria-label="Silva & Associados">
            <span className="lp-brand-mark">S</span>
            <span>
              Silva & Associados
              <small>Advocacia Estratégica</small>
            </span>
          </a>

          <div className="lp-nav-links">
            <a href="#escritorio">Escritório</a>
            <a href="#atuacao">Atuação</a>
            <a href="#metodo">Método</a>
            <a href="#conteudos">Conteúdos</a>
            <a href="#faq">Dúvidas</a>
          </div>

          <a href={links.consult} className="lp-button lp-button-primary" target="_blank">
            Agendar consulta
          </a>
        </nav>
      </header>

      <section className="hero-section" id="inicio">
        <div className="hero-noise hero-noise-a" />
        <div className="hero-noise hero-noise-b" />

        <div className="lp-container hero-grid">
          <div className="hero-copy reveal">
            <span className="section-eyebrow">ATENDIMENTO JURÍDICO COM CLAREZA E SEGURANÇA</span>
            <h1>Advocacia estratégica para decisões relevantes.</h1>
            <p>
              Uma landing page com linguagem institucional, visual sóbrio e foco em confiança —
              pensada para se aproximar do padrão de apresentação do mercado jurídico e facilitar o primeiro contato.
            </p>

            <div className="hero-actions">
              <a href={links.analysis} className="lp-button lp-button-primary" target="_blank">
                Solicitar análise inicial
              </a>
              <a href="#atuacao" className="lp-button lp-button-secondary">
                Ver áreas de atuação
              </a>
            </div>

            <div className="hero-highlights">
              {highlights.map((item) => (
                <div key={item}>
                  <span className="bullet-dot" />
                  <small>{item}</small>
                </div>
              ))}
            </div>
          </div>

          <div className="hero-visual reveal">
            <div className="hero-figure-wrap">
              <div className="hero-side-card hero-side-card-top">
                <span>Posicionamento institucional</span>
                <strong>Seriedade e clareza na apresentação do escritório</strong>
              </div>

              <div className="hero-main-card">
                <img src="/advogado/hero-lawyer.png" alt="Advogado em ambiente corporativo" />
              </div>

              <div className="hero-side-card hero-side-card-bottom">
                <span>Atendimento personalizado</span>
                <strong>Condução próxima, orientação objetiva e foco estratégico</strong>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="metrics-strip reveal">
        <div className="lp-container metrics-grid">
          {metrics.map((item) => (
            <article className="metric-card" key={item.label}>
              <strong>{item.value}</strong>
              <span>{item.label}</span>
            </article>
          ))}
        </div>
      </section>

      <section className="intro-section" id="escritorio">
        <div className="lp-container intro-grid">
          <div className="intro-copy reveal">
            <span className="section-kicker">O escritório</span>
            <h2>Uma apresentação mais alinhada ao que o mercado jurídico espera.</h2>
            <p>
              Grandes escritórios costumam transmitir valor por meio de clareza institucional,
              áreas de atuação bem definidas, conteúdo e uma experiência visual organizada.
            </p>
            <p>
              Esta versão foi redesenhada com outra lógica: menos cara de agência ou SaaS e mais cara de advocacia real,
              com fundo claro, ritmo editorial e foco em confiança, leitura e contato.
            </p>

            <div className="principles-row">
              {principles.map((item) => (
                <article className="principle-chip" key={item.title}>
                  <h3>{item.title}</h3>
                  <p>{item.description}</p>
                </article>
              ))}
            </div>
          </div>

          <div className="intro-media reveal">
            <div className="portrait-frame">
              <img src="/advogado/portrait-lawyer.png" alt="Retrato do advogado" />
            </div>
          </div>
        </div>
      </section>

      <section className="areas-section" id="atuacao">
        <div className="lp-container">
          <div className="section-heading reveal">
            <span className="section-kicker">Áreas de atuação</span>
            <h2>Especialização organizada para facilitar a leitura e a decisão do cliente.</h2>
            <p>
              A página precisa comunicar com rapidez o que o escritório faz, para quem faz e como o atendimento acontece.
            </p>
          </div>

          <div className="areas-grid">
            {areas.map((item) => (
              <article className="area-card reveal" key={item.title}>
                <h3>{item.title}</h3>
                <p>{item.description}</p>
                <div className="tag-list">
                  {item.bullets.map((bullet) => (
                    <span key={bullet}>{bullet}</span>
                  ))}
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="authority-section">
        <div className="lp-container authority-grid">
          <div className="authority-media reveal">
            <div className="office-frame">
              <img src="/advogado/desk-lawyer.png" alt="Advogado em mesa de escritório" />
            </div>
          </div>

          <div className="authority-copy reveal">
            <span className="section-kicker">Presença e credibilidade</span>
            <h2>Quando a página parece um escritório real, a confiança aumenta.</h2>
            <p>
              O uso consistente das imagens do advogado ao longo da jornada ajuda a criar reconhecimento e humanidade.
              Isso aproxima a experiência de uma operação real e reduz a sensação de “peça genérica de anúncio”.
            </p>

            <div className="authority-points">
              <div>
                <strong>Mais humano</strong>
                <span>O visitante associa o escritório a uma pessoa concreta.</span>
              </div>
              <div>
                <strong>Mais institucional</strong>
                <span>O design transmite profissionalismo sem exagero comercial.</span>
              </div>
              <div>
                <strong>Mais confiável</strong>
                <span>A comunicação visual reforça segurança antes do primeiro contato.</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="method-section" id="metodo">
        <div className="lp-container">
          <div className="section-heading reveal section-heading-left">
            <span className="section-kicker">Método de atendimento</span>
            <h2>Uma jornada simples, previsível e fácil de entender.</h2>
          </div>

          <div className="timeline-grid">
            {timeline.map((item) => (
              <article className="timeline-card reveal" key={item.title}>
                <span>{item.step}</span>
                <h3>{item.title}</h3>
                <p>{item.text}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="scenario-section">
        <div className="lp-container scenario-grid">
          <div className="scenario-copy reveal">
            <span className="section-kicker">Quando faz sentido procurar orientação</span>
            <h2>Nem todo problema parece jurídico no início — mas pode se tornar.</h2>
            <p>
              Uma boa landing page jurídica não tenta apenas vender. Ela educa, contextualiza e ajuda o visitante a identificar o momento certo de buscar apoio profissional.
            </p>
          </div>

          <div className="scenario-cards">
            {scenarios.map((item) => (
              <article className="scenario-card reveal" key={item.title}>
                <h3>{item.title}</h3>
                <p>{item.text}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="publications-section" id="conteudos">
        <div className="lp-container">
          <div className="section-heading reveal">
            <span className="section-kicker">Conteúdos e análises</span>
            <h2>Publicações ajudam a reforçar especialização e autoridade.</h2>
            <p>
              Assim como grandes bancas destacam conteúdos e análises, esta seção ajuda a elevar a percepção de profundidade e atualização.
            </p>
          </div>

          <div className="publications-grid">
            {publications.map((item) => (
              <article className="publication-card reveal" key={item.title}>
                <span>{item.label}</span>
                <h3>{item.title}</h3>
                <p>{item.text}</p>
                <a href={links.contact} target="_blank">Conversar sobre esse tema →</a>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="testimonial-section">
        <div className="lp-container">
          <div className="section-heading reveal">
            <span className="section-kicker">Percepção do cliente</span>
            <h2>Confiança se constrói com clareza, postura e atendimento.</h2>
          </div>

          <div className="testimonials-grid">
            {testimonials.map((item) => (
              <article className="testimonial-card reveal" key={item.name}>
                <div className="stars">★★★★★</div>
                <p>“{item.quote}”</p>
                <strong>{item.name}</strong>
                <span>{item.context}</span>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="contact-section">
        <div className="lp-container contact-grid">
          <div className="contact-copy reveal">
            <span className="section-kicker">Contato</span>
            <h2>Precisa de orientação jurídica com clareza e segurança?</h2>
            <p>
              Explique sua situação em poucos minutos e receba um direcionamento inicial sobre os próximos passos.
            </p>

            <div className="hero-actions">
              <a href={links.consult} className="lp-button lp-button-primary" target="_blank">
                Agendar consulta
              </a>
              <a href="#faq" className="lp-button lp-button-secondary">
                Ver dúvidas frequentes
              </a>
            </div>
          </div>

          <div className="contact-panel reveal">
            <img src="/advogado/office-lawyer.png" alt="Advogado em escritório moderno" />
            <div className="contact-panel-info">
              <div>
                <span>Formato</span>
                <strong>WhatsApp • Online • Presencial</strong>
              </div>
              <div>
                <span>Disponibilidade</span>
                <strong>Segunda a sexta, das 9h às 18h</strong>
              </div>
              <div>
                <span>Localização</span>
                <strong>Campinas - SP</strong>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="faq-section" id="faq">
        <div className="lp-container faq-grid">
          <div className="faq-copy reveal">
            <span className="section-kicker">Dúvidas frequentes</span>
            <h2>Removendo objeções antes do primeiro contato.</h2>
            <p>
              Uma página eficiente para o mercado jurídico precisa responder dúvidas essenciais sem criar ruído desnecessário.
            </p>
          </div>

          <div className="faq-list reveal">
            {faqs.map((faq) => (
              <details className="faq-item" key={faq.question}>
                <summary>{faq.question}</summary>
                <p>{faq.answer}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      <footer className="lp-footer">
        <div className="lp-container footer-grid">
          <div>
            <strong>Silva & Associados</strong>
            <span>Advocacia Estratégica • Campinas - SP</span>
          </div>
          <div>
            <strong>Atuação</strong>
            <span>Trabalhista • Civil • Empresarial • Previdenciário</span>
          </div>
          <div>
            <strong>Demo Altum</strong>
            <span>Landing page demonstrativa redesenhada com foco no mercado jurídico.</span>
          </div>
        </div>
      </footer>

      <a href={links.contact} target="_blank" className="whatsapp-float" aria-label="WhatsApp">
        ☎
      </a>
    </main>
  );
}
