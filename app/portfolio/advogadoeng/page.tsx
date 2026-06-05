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
  "Contratos e Civil",
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
              <small>Strategic Legal Counsel</small>
            </span>
          </a>

          <nav className="global-links">
            <a href="#capabilities">Capabilities</a>
            <a href="#people">People</a>
            <a href="#insights">Insights</a>
            <a href="#approach">Approach</a>
            <a href="#contact">Contact</a>
          </nav>

          <a href={links.consult} target="_blank" className="global-cta">
            Speak with us
          </a>
        </div>
      </header>

      <section className="global-hero" id="inicio">
        <div className="global-container hero-layout">
          <div className="hero-editorial global-reveal">
            <span className="global-eyebrow">Independent counsel • Business-minded advocacy</span>
            <h1>Legal strategy for moments that matter.</h1>
            <p>
              A global-inspired law firm experience designed around clarity,
              trust, editorial authority and direct access to legal guidance.
            </p>

            <div className="hero-actions">
              <a href={links.analysis} target="_blank" className="button-primary">
                Request initial analysis
              </a>
              <a href="#capabilities" className="button-ghost">
                Explore capabilities
              </a>
            </div>
          </div>

          <div className="hero-image-column global-reveal">
            <div className="hero-image-card">
              <img src="/advogado/hero-lawyer.png" alt="Advogado em escritório" />
            </div>

            <div className="hero-floating-note">
              <span>Client focus</span>
              <strong>Clear guidance, strategic thinking and discreet support.</strong>
            </div>
          </div>
        </div>
      </section>

      <section className="global-bar">
        <div className="global-container global-bar-grid">
          <span>Corporate mindset</span>
          <span>Human communication</span>
          <span>Strategic dispute resolution</span>
          <span>Direct WhatsApp access</span>
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
              <span className="section-label">Capabilities</span>
              <h2>Focused practice areas for individuals and businesses.</h2>
            </div>
            <p>
              Inspired by global firms, the page organizes expertise like a real
              institutional platform: capabilities, sectors, people, insights and contact.
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
            <span className="section-label">People</span>
            <h2>Senior attention, clear communication and close follow-up.</h2>
            <p>
              The page brings the lawyer to the center of the experience. This
              makes the firm feel less generic and more trustworthy — especially
              for clients deciding whether to start a first conversation.
            </p>

            <div className="profile-card">
              <span>Lead professional</span>
              <strong>Dr. Rafael Silva</strong>
              <p>
                Strategic legal counsel with a practical approach to civil,
                labor, corporate and previdentiary matters.
              </p>
            </div>
          </div>
        </div>
      </section>

      <section className="industries-section">
        <div className="global-container industries-layout">
          <div className="industries-copy global-reveal">
            <span className="section-label">Clients and sectors</span>
            <h2>Built for people, founders, executives and growing businesses.</h2>
            <p>
              A global-style legal site rarely talks only about “services”.
              It also shows who the firm serves and what type of decision it helps with.
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
            <span className="section-label">Approach</span>
            <h2>A structured path from uncertainty to legal direction.</h2>
            <p>
              The goal is to reduce uncertainty. Visitors need to quickly
              understand what happens after they click, what the lawyer will analyze,
              and how the relationship begins.
            </p>
            <a href={links.contact} target="_blank" className="text-link">
              Start a conversation →
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
            <span className="section-label">Experience</span>
            <h2>Institutional presence with the warmth of a real office.</h2>
            <p>
              The layout avoids a generic ad look. It uses editorial hierarchy,
              white space, professional imagery and discreet motion to make the
              page feel premium, credible and useful.
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
            <span className="section-label">Insights</span>
            <h2>Thought leadership makes the firm feel more authoritative.</h2>
            <p>
              Global firms place content at the center of their websites. This version
              brings that logic into a focused landing page.
            </p>
          </div>

          <div className="insights-grid">
            {insights.map((item) => (
              <article className="insight-card global-reveal" key={item.title}>
                <span>{item.type}</span>
                <h3>{item.title}</h3>
                <p>{item.text}</p>
                <a href={links.contact} target="_blank">Discuss this topic →</a>
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
            <span className="section-label">Reputation signals</span>
            <h2>Trust is created through structure, not noise.</h2>
            <p>
              The strongest law firm websites rely on calm authority: clear
              sections, strong headlines, professional people, insights and proof
              of experience. This page follows that pattern while preserving conversion.
            </p>

            <div className="quote-block">
              <p>
                “The first impression of a law firm is now formed before the first meeting.”
              </p>
              <span>Digital presence built for legal credibility</span>
            </div>
          </div>
        </div>
      </section>

      <section className="contact-section" id="contact">
        <div className="global-container contact-layout">
          <div className="contact-copy global-reveal">
            <span className="section-label">Contact</span>
            <h2>Ready to discuss a legal matter?</h2>
            <p>
              Send a short message and receive initial direction on the next steps.
            </p>

            <div className="hero-actions">
              <a href={links.consult} target="_blank" className="button-primary">
                Schedule consultation
              </a>
              <a href="#faq" className="button-ghost">
                Read common questions
              </a>
            </div>
          </div>

          <div className="contact-card global-reveal">
            <h3>Initial contact</h3>
            <div>
              <span>Format</span>
              <strong>WhatsApp • Online meeting • In person</strong>
            </div>
            <div>
              <span>Location</span>
              <strong>Campinas - SP</strong>
            </div>
            <div>
              <span>Core practices</span>
              <strong>Labor • Civil • Corporate • Previdentiary</strong>
            </div>
          </div>
        </div>
      </section>

      <section className="faq-section" id="faq">
        <div className="global-container faq-layout">
          <div className="faq-copy global-reveal">
            <span className="section-label">FAQ</span>
            <h2>Before the first conversation.</h2>
            <p>
              Questions answered clearly reduce hesitation and make the contact
              decision easier.
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
            <span>Strategic Legal Counsel • Campinas - SP</span>
          </div>
          <div>
            <strong>Capabilities</strong>
            <span>Labor • Civil • Corporate • Previdentiary</span>
          </div>
          <div>
            <strong>ALTUM Demo</strong>
            <span>Global-style legal landing page built for credibility and conversion.</span>
          </div>
        </div>
      </footer>

      <a href={links.contact} target="_blank" className="floating-contact" aria-label="WhatsApp">
        ☎
      </a>
    </main>
  );
}
