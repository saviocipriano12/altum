"use client";

import "./advogado.css";
import { useEffect } from "react";

const whatsappNumber = "5500000000000";

const links = {
  consult: `https://wa.me/${whatsappNumber}?text=Ol%C3%A1%2C%20gostaria%20de%20agendar%20uma%20consulta.`,
  analysis: `https://wa.me/${whatsappNumber}?text=Ol%C3%A1%2C%20gostaria%20de%20solicitar%20uma%20an%C3%A1lise%20inicial.`,
  contact: `https://wa.me/${whatsappNumber}?text=Ol%C3%A1%2C%20vim%20pelo%20site%20e%20gostaria%20de%20mais%20informa%C3%A7%C3%B5es.`,
};

const capabilities = [
  "Trabalhista e Sindical",
  "Contratos e Direito Civil",
  "Empresarial e Societário",
  "Previdenciário",
  "Negociações e Acordos",
  "Consultivo Estratégico",
  "Contencioso",
  "Planejamento Jurídico",
];

const numbers = [
  { value: "10+", label: "anos de experiência" },
  { value: "300+", label: "casos acompanhados" },
  { value: "4", label: "áreas centrais de atuação" },
  { value: "24h", label: "retorno inicial útil" },
];

const practices = [
  {
    title: "Trabalhista",
    text: "Estratégia para empregados e empresas em rescisões, acordos, reclamações, defesas e prevenção de riscos.",
    tags: ["Rescisões", "Acordos", "Defesas", "Consultivo"],
  },
  {
    title: "Civil e Contratos",
    text: "Atuação em contratos, indenizações, cobranças, responsabilidade civil e disputas patrimoniais.",
    tags: ["Contratos", "Indenizações", "Cobranças", "Responsabilidade"],
  },
  {
    title: "Empresarial",
    text: "Suporte jurídico para decisões de negócio, contratos empresariais, sócios, riscos e operações.",
    tags: ["Empresas", "Sócios", "Riscos", "Operações"],
  },
  {
    title: "Previdenciário",
    text: "Análise de benefícios, aposentadorias, revisões e planejamento previdenciário individualizado.",
    tags: ["Aposentadoria", "Benefícios", "Revisões", "Planejamento"],
  },
];

const industries = [
  "Profissionais liberais",
  "Empresas familiares",
  "Prestadores de serviço",
  "Comércio local",
  "Executivos e gestores",
  "Pessoas físicas",
];

const insights = [
  {
    type: "Insight",
    title: "A importância de revisar contratos antes de assumir obrigações relevantes",
    text: "Contratos claros reduzem conflitos, organizam expectativas e ajudam a proteger relações comerciais.",
  },
  {
    type: "Análise",
    title: "O que observar antes de formalizar um acordo trabalhista",
    text: "Uma análise prévia evita renúncias indevidas, inconsistências e decisões tomadas sob pressão.",
  },
  {
    type: "Guia rápido",
    title: "Quando procurar orientação jurídica preventiva",
    text: "A atuação preventiva costuma ser mais eficiente do que agir apenas quando o conflito já escalou.",
  },
];

const journey = [
  {
    step: "01",
    title: "Diagnóstico inicial",
    text: "Entendimento da situação, urgência e principais riscos envolvidos.",
  },
  {
    step: "02",
    title: "Estratégia",
    text: "Definição dos caminhos possíveis com clareza sobre prazos, riscos e alternativas.",
  },
  {
    step: "03",
    title: "Execução",
    text: "Condução técnica da medida adequada, com acompanhamento próximo.",
  },
  {
    step: "04",
    title: "Acompanhamento",
    text: "Comunicação objetiva em cada etapa para reduzir dúvidas e insegurança.",
  },
];

const recognitions = [
  "Comunicação clara",
  "Atendimento consultivo",
  "Visão estratégica",
  "Experiência institucional",
  "Presença digital premium",
  "Contato direto pelo WhatsApp",
];

const faqs = [
  {
    question: "O atendimento inicial pode ser online?",
    answer: "Sim. O primeiro contato pode acontecer pelo WhatsApp ou por reunião online, conforme a necessidade.",
  },
  {
    question: "A página é para um advogado ou para um escritório?",
    answer: "A estrutura funciona para ambos. Ela pode ser adaptada para um advogado individual, uma sociedade ou uma boutique jurídica.",
  },
  {
    question: "Essa versão é uma landing page ou site institucional?",
    answer: "Ela mistura os dois: tem profundidade institucional, mas mantém CTA claro para gerar contato.",
  },
  {
    question: "As imagens podem ser trocadas?",
    answer: "Sim. Basta substituir os arquivos dentro de public/advogado mantendo os mesmos nomes.",
  },
];

export default function AdvogadoGlobalPage() {
  useEffect(() => {
    const elements = Array.from(document.querySelectorAll(".global-reveal"));
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add("visible");
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
    <main className="global-page">
      <header className="global-header">
        <div className="global-container global-nav">
          <a href="#inicio" className="global-brand">
            <span className="brand-symbol">SA</span>
            <span>
              Silva & Associados
              <small>Advocacia Estratégica</small>
            </span>
          </a>

          <nav className="global-links">
            <a href="#capabilities">Atuação</a>
            <a href="#people">Profissional</a>
            <a href="#insights">Análises</a>
            <a href="#approach">Método</a>
            <a href="#contact">Contato</a>
          </nav>

          <a href={links.consult} target="_blank" className="global-cta">
            Fale conosco
          </a>
        </div>
      </header>

      <section className="global-hero" id="inicio">
        <div className="global-container hero-layout">
          <div className="hero-editorial global-reveal">
            <span className="global-eyebrow">Atuação independente • Visão estratégica de negócios</span>
            <h1>Estratégia jurídica para decisões importantes.</h1>
            <p>
              Uma experiência inspirada nos grandes escritórios globais, construída em torno de clareza, confiança, autoridade editorial e acesso direto à orientação jurídica.
            </p>

            <div className="hero-actions">
              <a href={links.analysis} target="_blank" className="button-primary">
                Solicitar análise inicial
              </a>
              <a href="#capabilities" className="button-ghost">
                Conhecer áreas de atuação
              </a>
            </div>
          </div>

          <div className="hero-image-column global-reveal">
            <div className="hero-image-card">
              <img src="/advogado/hero-lawyer.png" alt="Advogado em escritório" />
            </div>

            <div className="hero-floating-note">
              <span>Foco no cliente</span>
              <strong>Orientação clara, visão estratégica e suporte discreto.</strong>
            </div>
          </div>
        </div>
      </section>

      <section className="global-bar">
        <div className="global-container global-bar-grid">
          <span>Visão corporativa</span>
          <span>Comunicação humana</span>
          <span>Resolução estratégica de conflitos</span>
          <span>Acesso direto pelo WhatsApp</span>
        </div>
      </section>

      <section className="numbers-section">
        <div className="global-container numbers-grid">
          {numbers.map((item) => (
            <article className="number-card global-reveal" key={item.label}>
              <strong>{item.value}</strong>
              <span>{item.label}</span>
            </article>
          ))}
        </div>
      </section>

      <section className="capabilities-section" id="capabilities">
        <div className="global-container">
          <div className="section-split global-reveal">
            <div>
              <span className="section-label">Atuação</span>
              <h2>Áreas de atuação focadas em pessoas e empresas.</h2>
            </div>
            <p>
              Inspirada em grandes bancas globais, a página organiza a atuação como uma plataforma institucional real: áreas, setores, profissional, análises e contato.
            </p>
          </div>

          <div className="capabilities-list">
            {practices.map((item, index) => (
              <article className="capability-row global-reveal" key={item.title}>
                <span className="capability-index">{String(index + 1).padStart(2, "0")}</span>
                <div>
                  <h3>{item.title}</h3>
                  <p>{item.text}</p>
                </div>
                <div className="capability-tags">
                  {item.tags.map((tag) => (
                    <span key={tag}>{tag}</span>
                  ))}
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="people-section" id="people">
        <div className="global-container people-grid">
          <div className="people-image global-reveal">
            <img src="/advogado/portrait-lawyer.png" alt="Retrato profissional do advogado" />
          </div>

          <div className="people-copy global-reveal">
            <span className="section-label">Profissional</span>
            <h2>Atenção próxima, comunicação clara e acompanhamento estratégico.</h2>
            <p>
              A página coloca o advogado no centro da experiência. Isso torna o escritório menos genérico e mais confiável — principalmente para clientes que ainda estão decidindo se iniciarão uma primeira conversa.
            </p>

            <div className="profile-card">
              <span>Profissional responsável</span>
              <strong>Dr. Rafael Silva</strong>
              <p>
                Advogado com atuação estratégica e abordagem prática em demandas civis, trabalhistas, empresariais e previdenciárias.
              </p>
            </div>
          </div>
        </div>
      </section>

      <section className="industries-section">
        <div className="global-container industries-layout">
          <div className="industries-copy global-reveal">
            <span className="section-label">Clientes e segmentos</span>
            <h2>Criada para pessoas, empresários, gestores e negócios em crescimento.</h2>
            <p>
              Um site jurídico de padrão global raramente fala apenas de “serviços”. Ele também mostra quem o escritório atende e em quais decisões consegue ajudar.
            </p>
          </div>

          <div className="industries-grid">
            {industries.map((item) => (
              <article className="industry-card global-reveal" key={item}>
                {item}
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="approach-section" id="approach">
        <div className="global-container approach-grid">
          <div className="approach-copy global-reveal">
            <span className="section-label">Método</span>
            <h2>Um caminho estruturado da dúvida à orientação jurídica.</h2>
            <p>
              O objetivo é reduzir incertezas. O visitante precisa entender rapidamente o que acontece após o contato, o que será analisado e como a relação começa.
            </p>
            <a href={links.contact} target="_blank" className="text-link">
              Iniciar conversa →
            </a>
          </div>

          <div className="journey-list">
            {journey.map((item) => (
              <article className="journey-card global-reveal" key={item.step}>
                <span>{item.step}</span>
                <h3>{item.title}</h3>
                <p>{item.text}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="office-section">
        <div className="global-container office-grid">
          <div className="office-copy global-reveal">
            <span className="section-label">Experiência</span>
            <h2>Presença institucional com a proximidade de um escritório real.</h2>
            <p>
              O layout evita aparência de anúncio genérico. Ele usa hierarquia editorial, espaço em branco, imagens profissionais e movimento discreto para transmitir sofisticação, credibilidade e utilidade.
            </p>

            <div className="recognition-grid">
              {recognitions.map((item) => (
                <span key={item}>{item}</span>
              ))}
            </div>
          </div>

          <div className="office-image global-reveal">
            <img src="/advogado/desk-lawyer.png" alt="Advogado em reunião" />
          </div>
        </div>
      </section>

      <section className="insights-section" id="insights">
        <div className="global-container">
          <div className="section-heading global-reveal">
            <span className="section-label">Análises</span>
            <h2>Conteúdo e análises reforçam a autoridade do escritório.</h2>
            <p>
              Grandes escritórios colocam conteúdo no centro de seus sites. Esta versão traz essa lógica para uma landing page focada em conversão.
            </p>
          </div>

          <div className="insights-grid">
            {insights.map((item) => (
              <article className="insight-card global-reveal" key={item.title}>
                <span>{item.type}</span>
                <h3>{item.title}</h3>
                <p>{item.text}</p>
                <a href={links.contact} target="_blank">Conversar sobre este tema →</a>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="proof-section">
        <div className="global-container proof-grid">
          <div className="proof-image global-reveal">
            <img src="/advogado/office-lawyer.png" alt="Advogado em escritório moderno" />
          </div>

          <div className="proof-copy global-reveal">
            <span className="section-label">Sinais de reputação</span>
            <h2>Confiança é criada por estrutura, não por excesso visual.</h2>
            <p>
              Os sites jurídicos mais fortes se apoiam em autoridade serena: seções claras, títulos fortes, profissionais bem apresentados, análises e sinais de experiência. Esta página segue esse padrão sem perder o foco em conversão.
            </p>

            <div className="quote-block">
              <p>
                “A primeira impressão de um escritório jurídico hoje se forma antes da primeira reunião.”
              </p>
              <span>Presença digital criada para credibilidade jurídica</span>
            </div>
          </div>
        </div>
      </section>

      <section className="contact-section" id="contact">
        <div className="global-container contact-layout">
          <div className="contact-copy global-reveal">
            <span className="section-label">Contato</span>
            <h2>Pronto para conversar sobre uma questão jurídica?</h2>
            <p>
              Envie uma breve mensagem e receba um direcionamento inicial sobre os próximos passos.
            </p>

            <div className="hero-actions">
              <a href={links.consult} target="_blank" className="button-primary">
                Agendar consulta
              </a>
              <a href="#faq" className="button-ghost">
                Ver dúvidas frequentes
              </a>
            </div>
          </div>

          <div className="contact-card global-reveal">
            <h3>Contato inicial</h3>
            <div>
              <span>Formato</span>
              <strong>WhatsApp • Reunião online • Presencial</strong>
            </div>
            <div>
              <span>Localização</span>
              <strong>Campinas - SP</strong>
            </div>
            <div>
              <span>Áreas principais</span>
              <strong>Trabalhista • Civil • Empresarial • Previdenciário</strong>
            </div>
          </div>
        </div>
      </section>

      <section className="faq-section" id="faq">
        <div className="global-container faq-layout">
          <div className="faq-copy global-reveal">
            <span className="section-label">Dúvidas frequentes</span>
            <h2>Antes da primeira conversa.</h2>
            <p>
              Dúvidas respondidas com clareza reduzem objeções e tornam a decisão de contato mais simples.
            </p>
          </div>

          <div className="faq-list global-reveal">
            {faqs.map((item) => (
              <details className="faq-item" key={item.question}>
                <summary>{item.question}</summary>
                <p>{item.answer}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      <footer className="global-footer">
        <div className="global-container footer-grid">
          <div>
            <strong>Silva & Associados</strong>
            <span>Advocacia Estratégica • Campinas - SP</span>
          </div>
          <div>
            <strong>Atuação</strong>
            <span>Trabalhista • Civil • Empresarial • Previdenciário</span>
          </div>
          <div>
            <strong>ALTUM Demo</strong>
            <span>Landing page jurídica em estilo global, criada para credibilidade e conversão.</span>
          </div>
        </div>
      </footer>

      <a href={links.contact} target="_blank" className="floating-contact" aria-label="WhatsApp">
        ☎
      </a>
    </main>
  );
}
