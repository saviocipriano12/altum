import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Politica de Privacidade | ALTUM",
  description:
    "Politica de Privacidade da ALTUM com regras de tratamento de dados pessoais em conformidade com a LGPD.",
};

const LAST_UPDATED = "15/04/2026";

export default function PrivacyPolicyPage() {
  return (
    <main className="min-h-screen bg-slate-950 text-slate-50">
      <section className="mx-auto max-w-4xl px-4 py-16">
        <header className="mb-10 border-b border-white/10 pb-6">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-amber-400/80">
            ALTUM · Politica de Privacidade
          </p>
          <h1 className="mt-3 text-3xl font-semibold sm:text-4xl">Politica de Privacidade</h1>
          <p className="mt-3 text-sm text-slate-300">
            Ultima atualizacao: <span className="font-medium text-slate-100">{LAST_UPDATED}</span>
          </p>
        </header>

        <div className="space-y-8 text-sm leading-relaxed text-slate-200">
          <section>
            <h2 className="mb-2 text-lg font-semibold text-amber-300">1. Escopo</h2>
            <p className="text-slate-300">
              Esta Politica descreve como a ALTUM trata dados pessoais em seus sites, landing pages,
              plataforma, APIs, automacoes e canais de atendimento, em conformidade com a Lei Geral
              de Protecao de Dados Pessoais (Lei no 13.709/2018 - LGPD).
            </p>
          </section>

          <section>
            <h2 className="mb-2 text-lg font-semibold text-amber-300">2. Papéis no Tratamento</h2>
            <p className="text-slate-300">
              A ALTUM pode atuar como:
            </p>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-slate-300">
              <li>
                <span className="font-semibold">Controladora</span>: quando define finalidades e meios
                do tratamento (por exemplo, dados de leads e dados de marketing da propria ALTUM).
              </li>
              <li>
                <span className="font-semibold">Operadora</span>: quando trata dados pessoais em nome de
                clientes contratantes, inclusive em operacoes de WhatsApp e redes sociais.
              </li>
            </ul>
          </section>

          <section>
            <h2 className="mb-2 text-lg font-semibold text-amber-300">3. Dados Tratados</h2>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-slate-300">
              <li>Dados de identificacao e contato (nome, telefone, e-mail, empresa e cargo).</li>
              <li>Dados de interacao em canais (mensagens, historico de conversas e eventos de atendimento).</li>
              <li>Dados de navegacao e dispositivo (IP, browser, sistema, cookies e logs tecnicos).</li>
              <li>Dados de operacao comercial (origem do lead, status de funil, agendamentos e conversoes).</li>
            </ul>
          </section>

          <section>
            <h2 className="mb-2 text-lg font-semibold text-amber-300">4. Finalidades e Bases Legais</h2>
            <p className="text-slate-300">Tratamos dados para:</p>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-slate-300">
              <li>Executar contratos e prestacao de servicos.</li>
              <li>Atender solicitacoes e suporte tecnico/comercial.</li>
              <li>Gerir captacao e qualificacao de leads.</li>
              <li>Executar automacoes operacionais e analises de desempenho.</li>
              <li>Cumprir obrigacoes legais, regulatórias e exercicio regular de direitos.</li>
              <li>Promover seguranca, prevencao de fraude e continuidade da plataforma.</li>
            </ul>
            <p className="mt-2 text-slate-300">
              As bases legais aplicaveis incluem, conforme o caso: execucao de contrato, cumprimento de
              obrigacao legal, legitimo interesse e consentimento.
            </p>
          </section>

          <section>
            <h2 className="mb-2 text-lg font-semibold text-amber-300">5. Compartilhamento</h2>
            <p className="text-slate-300">
              A ALTUM compartilha dados apenas quando necessario para a operacao, com:
            </p>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-slate-300">
              <li>Provedores de nuvem, banco de dados e infraestrutura.</li>
              <li>Plataformas de mensageria e redes sociais (como Meta/WhatsApp).</li>
              <li>Ferramentas de analytics, anuncios e automacao comercial.</li>
              <li>Prestadores que apoiem suporte, seguranca, antifraude e compliance.</li>
            </ul>
            <p className="mt-2 text-slate-300">
              Exigimos compromisso contratual de confidencialidade e seguranca dos terceiros.
            </p>
          </section>

          <section>
            <h2 className="mb-2 text-lg font-semibold text-amber-300">6. Transferencia Internacional</h2>
            <p className="text-slate-300">
              Parte dos provedores pode processar dados fora do Brasil. Nesses casos, adotamos
              mecanismos contratuais e salvaguardas adequadas, conforme a LGPD e normas da ANPD.
            </p>
          </section>

          <section>
            <h2 className="mb-2 text-lg font-semibold text-amber-300">7. Retencao e Descarte</h2>
            <p className="text-slate-300">
              Os dados sao mantidos apenas pelo periodo necessario para as finalidades desta Politica,
              observando requisitos legais, regulatórios e de defesa de direitos. Encerrado o prazo,
              os dados sao excluidos ou anonimizados de forma segura.
            </p>
          </section>

          <section>
            <h2 className="mb-2 text-lg font-semibold text-amber-300">8. Seguranca da Informacao</h2>
            <p className="text-slate-300">
              Adotamos medidas tecnicas e organizacionais proporcionais ao risco, incluindo:
            </p>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-slate-300">
              <li>Controle de acesso com perfis e principio do menor privilegio.</li>
              <li>Criptografia de segredos e protecao de credenciais.</li>
              <li>Logs de auditoria e monitoramento de eventos criticos.</li>
              <li>Rotinas de backup, continuidade e resposta a incidentes.</li>
            </ul>
          </section>

          <section>
            <h2 className="mb-2 text-lg font-semibold text-amber-300">9. Direitos dos Titulares</h2>
            <p className="text-slate-300">
              Nos termos da LGPD, o titular pode solicitar confirmacao de tratamento, acesso, correcao,
              anonimização, bloqueio, eliminacao, portabilidade, informacao sobre compartilhamentos,
              oposicao e revogacao de consentimento quando aplicavel.
            </p>
          </section>

          <section>
            <h2 className="mb-2 text-lg font-semibold text-amber-300">10. Canal de Privacidade</h2>
            <p className="text-slate-300">
              Solicitacoes de privacidade e exercicio de direitos podem ser enviados para:
            </p>
            <p className="mt-2 font-semibold text-slate-100">suporte.altum@gmail.com</p>
          </section>

          <section>
            <h2 className="mb-2 text-lg font-semibold text-amber-300">11. Atualizacoes</h2>
            <p className="text-slate-300">
              Esta Politica pode ser atualizada para refletir evolucoes legais, tecnicas e operacionais.
              A versao vigente estara sempre publicada nesta pagina.
            </p>
          </section>
        </div>
      </section>
    </main>
  );
}
