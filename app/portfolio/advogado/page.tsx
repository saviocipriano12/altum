import "./advogado.css";

const whatsappNumber = "5531998772098";

const whatsappLinks = {
  main: "/diagnostico?entry=portfolio_advogado_main",
  consult: "/diagnostico?entry=portfolio_advogado_consult",
  legal: "/diagnostico?entry=portfolio_advogado_legal",
};

const stats = [
  { value: "+300", label: "casos acompanhados" },
  { value: "98%", label: "de satisfação" },
  { value: "24h", label: "para retorno inicial" },
  { value: "10", label: "anos de experiência" },
];

const pains = [
  {
    icon: "⚖️",
    title: "Demissão indevida",
    text: "Análise de verbas, rescisões, acordos e medidas trabalhistas.",
  },
  {
    icon: "📄",
    title: "Contratos frágeis",
    text: "Elaboração e revisão para evitar conflitos e proteger interesses.",
  },
  {
    icon: "🏛️",
    title: "Benefício negado",
    text: "Suporte em pedidos, revisões e demandas previdenciárias.",
  },
  {
    icon: "💼",
    title: "Risco empresarial",
    text: "Consultoria jurídica para decisões mais seguras no negócio.",
  },
];

const services = [
  {
    number: "01",
    title: "Direito Trabalhista",
    text: "Atuação para empregados e empregadores em rescisões, verbas trabalhistas, acordos, defesa e prevenção de riscos.",
    link: "Solicitar análise →",
  },
  {
    number: "02",
    title: "Direito Previdenciário",
    text: "Aposentadorias, benefícios, revisões, recursos e planejamento previdenciário com acompanhamento completo.",
    link: "Falar com especialista →",
  },
  {
    number: "03",
    title: "Direito Civil",
    text: "Contratos, indenizações, cobranças, responsabilidade civil e resolução de conflitos com estratégia jurídica.",
    link: "Agendar consulta →",
  },
  {
    number: "04",
    title: "Direito Empresarial",
    text: "Consultoria preventiva, estruturação contratual, proteção patrimonial e suporte jurídico para empresas.",
    link: "Conhecer soluções →",
  },
];

const credentials = [
  {
    title: "Atendimento consultivo",
    text: "Explicações claras, sem juridiquês desnecessário.",
  },
  {
    title: "Posicionamento premium",
    text: "Imagem de autoridade para aumentar confiança.",
  },
  {
    title: "Foco em conversão",
    text: "Botões e fluxo pensados para gerar contatos.",
  },
  {
    title: "Presença digital moderna",
    text: "Uma vitrine profissional para o Google e o WhatsApp.",
  },
];

const features = [
  {
    icon: "💬",
    title: "Atendimento rápido pelo WhatsApp",
    text: "Contato direto com uma equipe preparada para entender sua situação e encaminhar os próximos passos.",
  },
  {
    icon: "🧭",
    title: "Estratégia personalizada",
    text: "Cada caso é analisado com contexto, documentação e objetivos específicos antes de qualquer recomendação.",
  },
  {
    icon: "🔎",
    title: "Transparência em cada etapa",
    text: "Você acompanha os caminhos possíveis, riscos, prazos e decisões com linguagem simples e objetiva.",
  },
  {
    icon: "🛡️",
    title: "Atuação preventiva",
    text: "Além de resolver conflitos, o escritório ajuda a evitar problemas futuros com contratos e consultoria.",
  },
];

const process = [
  {
    title: "Contato inicial",
    text: "Você envia sua dúvida pelo WhatsApp e recebe as primeiras orientações.",
  },
  {
    title: "Análise do caso",
    text: "A equipe avalia documentos, contexto e riscos envolvidos.",
  },
  {
    title: "Estratégia jurídica",
    text: "Definimos o melhor caminho para proteger seus interesses.",
  },
  {
    title: "Acompanhamento",
    text: "Você recebe atualização clara em cada etapa do processo.",
  },
];

const testimonials = [
  {
    name: "Carlos Henrique",
    type: "Cliente trabalhista",
    initial: "C",
    text: "Fui atendido com muita clareza desde o primeiro contato. Entendi meus direitos e tive segurança para agir.",
  },
  {
    name: "Maria Fernanda",
    type: "Cliente civil",
    initial: "M",
    text: "Atendimento profissional, rápido e muito humano. Me explicaram tudo sem juridiquês.",
  },
  {
    name: "Ricardo Almeida",
    type: "Cliente previdenciário",
    initial: "R",
    text: "O escritório me ajudou em um momento difícil e acompanhou cada etapa com transparência.",
  },
];

const faqs = [
  {
    question: "Vocês atendem online?",
    answer: "Sim. O atendimento inicial pode ser feito online pelo WhatsApp, com encaminhamento posterior conforme a necessidade do caso.",
  },
  {
    question: "Quanto custa uma consulta?",
    answer: "O valor depende da área e complexidade. Após o primeiro contato, a equipe informa o formato mais adequado para sua situação.",
  },
  {
    question: "Quais documentos preciso enviar?",
    answer: "Depende do tipo de caso. A equipe orienta exatamente quais documentos são necessários para análise inicial.",
  },
  {
    question: "Em quanto tempo recebo retorno?",
    answer: "Durante o horário comercial, normalmente o retorno inicial é feito em poucos minutos pelo WhatsApp.",
  },
];

export default function AdvogadoPage() {
  const duplicatedTestimonials = [...testimonials, ...testimonials];

  return (
    <main className="adv-page" id="top">
      <nav className="adv-nav">
        <a href="#top" className="adv-brand" aria-label="Silva & Associados">
          <span className="adv-brand-mark">S</span>
          <span>
            Silva & Associados
            <small>Advocacia Estratégica</small>
          </span>
        </a>

        <div className="adv-nav-links">
          <a href="#sobre">Sobre</a>
          <a href="#areas">Áreas</a>
          <a href="#diferenciais">Diferenciais</a>
          <a href="#faq">Dúvidas</a>
        </div>

        <a className="adv-btn adv-btn-primary" href={whatsappLinks.main} target="_blank">
          Fazer diagnostico
        </a>
      </nav>

      <section className="adv-hero">
        <div className="adv-orb adv-orb-one" />
        <div className="adv-orb adv-orb-two" />

        <div className="adv-container adv-hero-grid">
          <div className="adv-hero-copy adv-reveal">
            <div className="adv-eyebrow">
              <span className="adv-pulse" />
              Atendimento jurídico online e presencial
            </div>

            <h1>
              Soluções jurídicas com estratégia e{" "}
              <span className="adv-gradient-text">autoridade.</span>
            </h1>

            <p>
              Atuação especializada para proteger seus direitos, reduzir riscos
              e conduzir cada etapa do seu caso com clareza, velocidade e
              segurança.
            </p>

            <div className="adv-hero-actions">
              <a className="adv-btn adv-btn-primary" href={whatsappLinks.consult} target="_blank">
                Agendar consulta
              </a>
              <a className="adv-btn adv-btn-secondary" href="#sobre">
                Conhecer o escritório
              </a>
            </div>

            <div className="adv-trust-row">
              <div className="adv-mini-stat">
                <strong>4.9★</strong>
                <span>Avaliação média</span>
              </div>
              <div className="adv-mini-stat">
                <strong>+300</strong>
                <span>Clientes atendidos</span>
              </div>
              <div className="adv-mini-stat">
                <strong>10 anos</strong>
                <span>De experiência</span>
              </div>
            </div>
          </div>

          <div className="adv-visual-wrap">
            <div className="adv-badge-card">
              <strong>Dr. Rafael Silva</strong>
              <span>Advogado • OAB 000.000 • Atendimento estratégico</span>
            </div>

            <div className="adv-lawyer-card">
              <img
                className="adv-lawyer-photo"
                src="/advogado/hero-lawyer.png"
                alt="Advogado em escritório sofisticado"
              />
              <div className="adv-lawyer-overlay">
                <div className="adv-lawyer-chip">
                  Especialista em direito trabalhista, civil e empresarial
                </div>
                <h3>Defesa técnica com visão estratégica.</h3>
                <p>
                  Uma presença profissional transmite confiança antes mesmo da
                  primeira conversa.
                </p>
              </div>
            </div>

            <div className="adv-search-card">
              <div className="adv-google-bar">🔎 Advogado trabalhista em Campinas</div>
              <div className="adv-result">
                <div className="adv-stars">★★★★★ 4.9</div>
                <h4>Silva & Associados Advocacia</h4>
                <p>Atendimento online, consulta rápida e atuação especializada.</p>
                <div className="adv-result-actions">
                  <span className="adv-pill">Site</span>
                  <span className="adv-pill">WhatsApp</span>
                </div>
              </div>
            </div>

            <div className="adv-phone-card">
              <div className="adv-phone-screen">
                <div className="adv-phone-hero">
                  <h4>Precisa de orientação jurídica?</h4>
                </div>
                <div className="adv-phone-content">
                  <div className="adv-phone-line" />
                  <div className="adv-phone-line" />
                  <div className="adv-phone-line adv-phone-line-short" />
                  <div className="adv-whats">Iniciar atendimento</div>
                </div>
              </div>
            </div>

            <div className="adv-case-card">
              <h4>Atendimento com clareza</h4>
              <div className="adv-progress">
                <span />
              </div>
              <p>
                Direcionamento jurídico rápido para quem chega pelo Google e
                pelo WhatsApp.
              </p>
            </div>
          </div>
        </div>
      </section>

      <div className="adv-stats-band">
        <div className="adv-container adv-stats-inner">
          {stats.map((stat) => (
            <div className="adv-stat-box" key={stat.label}>
              <strong>{stat.value}</strong>
              <span>{stat.label}</span>
            </div>
          ))}
        </div>
      </div>

      <section id="sobre" className="adv-section">
        <div className="adv-container adv-about-layout">
          <div className="adv-portrait-card">
            <img src="/advogado/portrait-lawyer.png" alt="Retrato profissional do advogado" />
            <div className="adv-portrait-badge">
              <strong>Dr. Rafael Silva</strong>
              <span>
                Advocacia estratégica, atendimento humanizado e atuação técnica
                em cada etapa do caso.
              </span>
            </div>
          </div>

          <div className="adv-about-copy">
            <div className="adv-kicker">Autoridade</div>
            <h2>Presença que transmite confiança desde o primeiro clique.</h2>
            <p>
              Esta landing page foi construída para mostrar como um escritório
              de advocacia pode se posicionar de forma premium no digital: com
              uma imagem forte, comunicação clara e uma experiência moderna que
              conduz o visitante até o atendimento pelo WhatsApp.
            </p>
            <p>
              Ao unir design, autoridade e conversão, o escritório passa a
              impressão certa para quem pesquisa no Google, visita o site e
              precisa decidir com quem vai falar.
            </p>

            <div className="adv-credentials-grid">
              {credentials.map((item) => (
                <div className="adv-cred-item" key={item.title}>
                  <strong>{item.title}</strong>
                  <span>{item.text}</span>
                </div>
              ))}
            </div>

            <div className="adv-signature-box">
              <p>
                “Seu site não precisa apenas existir. Ele precisa transmitir
                segurança, credibilidade e conduzir o cliente até a ação.”
              </p>
              <div className="adv-signature-line">
                Dr. Rafael Silva • Advogado Responsável
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="adv-section">
        <div className="adv-container">
          <div className="adv-section-head">
            <div className="adv-kicker">Problemas reais</div>
            <h2>Questões jurídicas não podem esperar.</h2>
            <p>
              Uma orientação correta no momento certo evita prejuízos, reduz
              riscos e aumenta a previsibilidade do seu caso.
            </p>
          </div>

          <div className="adv-pain-grid">
            {pains.map((pain) => (
              <article className="adv-pain-card" key={pain.title}>
                <div>
                  <div className="adv-icon">{pain.icon}</div>
                  <h3>{pain.title}</h3>
                  <p>{pain.text}</p>
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section id="areas" className="adv-section">
        <div className="adv-container">
          <div className="adv-section-head">
            <div className="adv-kicker">Áreas de atuação</div>
            <h2>Especialização para cada etapa da sua necessidade.</h2>
          </div>

          <div className="adv-services-grid">
            {services.map((service) => (
              <article className="adv-service-card" key={service.title}>
                <div className="adv-icon">{service.number}</div>
                <h3>{service.title}</h3>
                <p>{service.text}</p>
                <a href="#cta">{service.link}</a>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="adv-section">
        <div className="adv-container adv-story-layout">
          <article className="adv-story-card">
            <div className="adv-kicker">Atendimento premium</div>
            <h2>Autoridade visual reforçada com atendimento humano.</h2>
            <p>
              Além de uma comunicação elegante, um escritório forte no digital
              precisa demonstrar presença, proximidade e confiança. Por isso,
              usamos imagens consistentes do advogado ao longo da experiência
              para reforçar a identidade e a percepção de autoridade.
            </p>
            <ul>
              <li>Imagem profissional para valor percebido mais alto.</li>
              <li>Layout desenhado para gerar contato imediato pelo WhatsApp.</li>
              <li>Seções organizadas para reduzir dúvidas e aumentar confiança.</li>
              <li>Storytelling visual que aproxima o visitante do advogado responsável.</li>
            </ul>
          </article>

          <div className="adv-story-image-card">
            <img src="/advogado/desk-lawyer.png" alt="Advogado atendendo em seu escritório" />
            <div className="adv-story-label">
              <strong>Consulta com clareza</strong>
              <span>
                Atendimento objetivo, técnico e humanizado desde o primeiro
                contato.
              </span>
            </div>
          </div>
        </div>
      </section>

      <section id="diferenciais" className="adv-section">
        <div className="adv-container adv-features-layout">
          <aside className="adv-big-panel">
            <div className="adv-kicker">Diferenciais</div>
            <h3>Clareza, velocidade e estratégia.</h3>
            <p>
              O atendimento foi desenhado para transformar dúvidas em
              direcionamento jurídico claro, sem burocracia desnecessária.
            </p>
            <img src="/advogado/office-lawyer.png" alt="Advogado em escritório moderno" />

            <div className="adv-dashboard">
              <div className="adv-dash-row">
                <span>Tempo médio de resposta</span>
                <strong>12 min</strong>
              </div>
              <div className="adv-dash-row">
                <span>Atendimento</span>
                <strong>Online e presencial</strong>
              </div>
              <div className="adv-dash-row">
                <span>Acompanhamento</span>
                <strong>Completo</strong>
              </div>
            </div>
          </aside>

          <div className="adv-features-list">
            {features.map((feature) => (
              <article className="adv-feature-card" key={feature.title}>
                <div className="adv-icon">{feature.icon}</div>
                <h3>{feature.title}</h3>
                <p>{feature.text}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section id="processo" className="adv-section">
        <div className="adv-container">
          <div className="adv-section-head">
            <div className="adv-kicker">Processo</div>
            <h2>Uma jornada simples para resolver o que importa.</h2>
          </div>

          <div className="adv-process">
            {process.map((step) => (
              <div className="adv-step" key={step.title}>
                <h3>{step.title}</h3>
                <p>{step.text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="adv-section">
        <div className="adv-container">
          <div className="adv-section-head">
            <div className="adv-kicker">Depoimentos</div>
            <h2>Confiança construída com atendimento humano.</h2>
          </div>
        </div>

        <div className="adv-testimonials-wrap">
          <div className="adv-testimonials-track">
            {duplicatedTestimonials.map((item, index) => (
              <article className="adv-testimonial" key={`${item.name}-${index}`}>
                <div className="adv-stars">★★★★★</div>
                <p>“{item.text}”</p>
                <div className="adv-person">
                  <span className="adv-avatar">{item.initial}</span>
                  <div>
                    <strong>{item.name}</strong>
                    <span>{item.type}</span>
                  </div>
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section id="faq" className="adv-section">
        <div className="adv-container">
          <div className="adv-section-head adv-centered">
            <div className="adv-kicker">Dúvidas frequentes</div>
            <h2>Perguntas antes da consulta.</h2>
          </div>

          <div className="adv-faq">
            {faqs.map((faq) => (
              <details className="adv-faq-item" key={faq.question}>
                <summary>{faq.question}</summary>
                <p>{faq.answer}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      <section className="adv-final-cta" id="cta">
        <div className="adv-container">
          <div className="adv-cta-box">
            <h2>Precisa de orientação jurídica agora?</h2>
            <p>
              Explique seu caso em poucos minutos e receba um direcionamento
              inicial para saber quais são os próximos passos.
            </p>
            <a className="adv-btn" href={whatsappLinks.legal} target="_blank">
              Quero falar com especialista
            </a>
          </div>
        </div>
      </section>

      <footer className="adv-footer">
        <div className="adv-container adv-footer-inner">
          <div>
            <strong>Silva & Associados</strong>
            <br />
            Advocacia Estratégica • Campinas - SP
          </div>
          <div>
            Landing page demonstrativa criada pela{" "}
            <span className="adv-altum-tag">ALTUM</span>
            <br />
            Sites • Google • WhatsApp • SEO Local
          </div>
        </div>
      </footer>

      <a
        className="adv-whatsapp-fixed"
        href={whatsappLinks.main}
        target="_blank"
        aria-label="WhatsApp"
      >
        ☎
      </a>
    </main>
  );
}
