// app/politica-de-privacidade/page.tsx

import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Política de Privacidade | Altumia",
  description:
    "Política de Privacidade da Altumia - Informações sobre como coletamos, usamos e protegemos seus dados.",
};

export default function PoliticaDePrivacidadePage() {
  return (
    <main className="min-h-screen bg-slate-950 text-slate-50">
      <section className="max-w-4xl px-4 py-16 mx-auto">
        <header className="mb-10 border-b border-white/10 pb-6">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-amber-400/80">
            Altumia · Política de Privacidade
          </p>
          <h1 className="mt-3 text-3xl font-semibold sm:text-4xl">
            Política de Privacidade
          </h1>
          <p className="mt-3 text-sm text-slate-300">
            Data da última atualização:{" "}
            <span className="font-medium text-slate-100">24/11/2025</span>
          </p>
        </header>

        <div className="space-y-8 text-sm leading-relaxed text-slate-200">
          {/* 1. Informações Gerais */}
          <section>
            <h2 className="text-lg font-semibold text-amber-300 mb-2">
              1. Informações Gerais
            </h2>
            <p className="text-slate-300">
              Esta Política de Privacidade descreve como a{" "}
              <span className="font-semibold">Altumia</span> coleta, utiliza,
              armazena e protege as informações pessoais dos usuários que
              acessam nossos sites, landing pages, plataformas digitais e demais
              serviços relacionados.
            </p>
            <p className="mt-2 text-slate-300">
              Ao utilizar nossos serviços, você declara que leu, entendeu e
              concorda com os termos desta Política de Privacidade.
            </p>
          </section>

          {/* 2. Informações que Coletamos */}
          <section>
            <h2 className="text-lg font-semibold text-amber-300 mb-2">
              2. Informações que Coletamos
            </h2>

            <h3 className="mt-3 text-sm font-semibold text-slate-100">
              2.1. Informações fornecidas voluntariamente
            </h3>
            <p className="mt-1 text-slate-300">
              Podemos coletar informações que você fornece diretamente para
              nós, incluindo, mas não se limitando a:
            </p>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-slate-300">
              <li>Nome completo;</li>
              <li>E-mail;</li>
              <li>Telefone e/ou WhatsApp;</li>
              <li>Nome da empresa ou negócio;</li>
              <li>Informações inseridas em formulários ou chats;</li>
              <li>
                Mensagens enviadas através de WhatsApp, formulários, e-mail ou
                outros canais de contato.
              </li>
            </ul>

            <h3 className="mt-4 text-sm font-semibold text-slate-100">
              2.2. Informações coletadas automaticamente
            </h3>
            <p className="mt-1 text-slate-300">
              Quando você acessa nossos sites ou plataformas, podemos coletar
              automaticamente:
            </p>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-slate-300">
              <li>Endereço IP;</li>
              <li>Tipo e versão do navegador;</li>
              <li>Páginas acessadas e tempo de navegação;</li>
              <li>Dados de cookies e identificadores únicos;</li>
              <li>Informações sobre o dispositivo utilizado.</li>
            </ul>
          </section>

          {/* 3. Uso das Informações */}
          <section>
            <h2 className="text-lg font-semibold text-amber-300 mb-2">
              3. Uso das Informações
            </h2>
            <p className="text-slate-300">
              Utilizamos as informações coletadas para os seguintes fins:
            </p>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-slate-300">
              <li>Fornecer e aprimorar nossos serviços e soluções digitais;</li>
              <li>
                Realizar atendimentos, contatos comerciais e suporte ao usuário;
              </li>
              <li>
                Personalizar experiências e comunicações, inclusive em canais
                automatizados como WhatsApp;
              </li>
              <li>
                Enviar propostas, materiais relevantes, atualizações e
                comunicações sobre nossos serviços;
              </li>
              <li>
                Analisar métricas de uso, desempenho e melhorias de produtos;
              </li>
              <li>
                Resguardar direitos, prevenir fraudes e garantir segurança das
                operações;
              </li>
              <li>Cumprir obrigações legais ou regulatórias aplicáveis.</li>
            </ul>
            <p className="mt-2 text-slate-300">
              <span className="font-semibold">
                Não vendemos, alugamos ou comercializamos seus dados pessoais
                com terceiros não autorizados.
              </span>
            </p>
          </section>

          {/* 4. Compartilhamento de Informações */}
          <section>
            <h2 className="text-lg font-semibold text-amber-300 mb-2">
              4. Compartilhamento de Informações
            </h2>
            <p className="text-slate-300">
              Podemos compartilhar seus dados apenas com terceiros
              estritamente necessários para a execução de nossos serviços, tais
              como:
            </p>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-slate-300">
              <li>
                Plataformas de automação e comunicação (por exemplo, WhatsApp
                Business API / Meta);
              </li>
              <li>Serviços de hospedagem e infraestrutura em nuvem;</li>
              <li>
                Ferramentas de CRM, automação de marketing e análise de dados;
              </li>
              <li>
                Parceiros de negócio que atuem em conjunto na entrega de
                soluções contratadas.
              </li>
            </ul>
            <p className="mt-2 text-slate-300">
              Todos os parceiros e fornecedores envolvidos seguem padrões de
              segurança e confidencialidade compatíveis com esta Política.
            </p>
          </section>

          {/* 5. Cookies */}
          <section>
            <h2 className="text-lg font-semibold text-amber-300 mb-2">
              5. Cookies e Tecnologias de Rastreamento
            </h2>
            <p className="text-slate-300">
              Utilizamos cookies e tecnologias similares para melhorar a
              experiência do usuário, personalizar conteúdo, analisar tráfego e
              eventualmente exibir anúncios relevantes.
            </p>
            <p className="mt-2 text-slate-300">
              Você pode desativar cookies nas configurações do seu navegador.
              No entanto, algumas funcionalidades dos nossos serviços podem não
              funcionar corretamente sem eles.
            </p>
          </section>

          {/* 6. Armazenamento e Segurança */}
          <section>
            <h2 className="text-lg font-semibold text-amber-300 mb-2">
              6. Armazenamento e Segurança dos Dados
            </h2>
            <p className="text-slate-300">
              Os dados coletados são armazenados em servidores seguros e
              protegidos por medidas técnicas, administrativas e organizacionais,
              incluindo:
            </p>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-slate-300">
              <li>Criptografia e protocolos de segurança;</li>
              <li>Controle de acesso e autenticação;</li>
              <li>Monitoramento e logs de atividade;</li>
              <li>Backups e rotinas de proteção contra incidentes.</li>
            </ul>
            <p className="mt-2 text-slate-300">
              Apesar dos nossos esforços, nenhum sistema é totalmente imune a
              riscos. Em caso de incidente relevante, adotaremos as medidas
              adequadas para mitigar impactos.
            </p>
          </section>

          {/* 7. Direitos do Usuário */}
          <section>
            <h2 className="text-lg font-semibold text-amber-300 mb-2">
              7. Direitos do Usuário
            </h2>
            <p className="text-slate-300">
              Você pode, a qualquer momento, solicitar:
            </p>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-slate-300">
              <li>Acesso aos dados pessoais que mantemos sobre você;</li>
              <li>Correção ou atualização de informações incompletas;</li>
              <li>Exclusão de dados, quando aplicável;</li>
              <li>
                Revogação de consentimento para atividades baseadas nessa base
                legal;
              </li>
              <li>
                Esclarecimentos sobre o tratamento que realizamos com seus
                dados.
              </li>
            </ul>
            <p className="mt-2 text-slate-300">
              Para exercer seus direitos, entre em contato através do e-mail:{" "}
              <span className="font-semibold">suporte.altum@gmail.com</span>.
            </p>
          </section>

          {/* 8. Retenção */}
          <section>
            <h2 className="text-lg font-semibold text-amber-300 mb-2">
              8. Retenção dos Dados
            </h2>
            <p className="text-slate-300">
              Manteremos seus dados pessoais apenas pelo tempo necessário para:
            </p>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-slate-300">
              <li>Cumprir finalidades descritas nesta Política;</li>
              <li>Cumprir obrigações legais e regulatórias;</li>
              <li>Exercer direitos em processos judiciais ou administrativos.</li>
            </ul>
            <p className="mt-2 text-slate-300">
              Após esse período, os dados poderão ser anonimizados ou excluídos
              de forma segura.
            </p>
          </section>

          {/* 9. Serviços de Terceiros */}
          <section>
            <h2 className="text-lg font-semibold text-amber-300 mb-2">
              9. Serviços de Terceiros
            </h2>
            <p className="text-slate-300">
              Nossos sites e plataformas podem conter links ou integrações com
              serviços de terceiros, tais como:
            </p>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-slate-300">
              <li>Meta / Facebook / Instagram;</li>
              <li>WhatsApp Business API;</li>
              <li>Google e outros provedores de tecnologia;</li>
              <li>Plataformas de automação e analytics.</li>
            </ul>
            <p className="mt-2 text-slate-300">
              Cada serviço possui sua própria Política de Privacidade, sendo
              responsabilidade do usuário consultá-las. A Altumia não se
              responsabiliza por práticas de terceiros.
            </p>
          </section>

          {/* 10. Alterações */}
          <section>
            <h2 className="text-lg font-semibold text-amber-300 mb-2">
              10. Alterações nesta Política
            </h2>
            <p className="text-slate-300">
              A Altumia poderá atualizar esta Política de Privacidade
              periodicamente para refletir mudanças em nossos serviços ou na
              legislação aplicável. A versão mais recente estará sempre
              disponível neste endereço.
            </p>
          </section>

          {/* 11. Contato */}
          <section>
            <h2 className="text-lg font-semibold text-amber-300 mb-2">
              11. Contato
            </h2>
            <p className="text-slate-300">
              Em caso de dúvidas, solicitações ou reclamações relacionadas ao
              tratamento de dados pessoais, você pode entrar em contato com
              nossa equipe por meio do e-mail:
            </p>
            <p className="mt-2 text-slate-100 font-semibold">
              suporte.altum@gmail.com
            </p>
            <p className="mt-2 text-slate-300">
              Ou através do nosso site oficial:{" "}
              <span className="font-semibold">https://altumia.com.br</span>
            </p>
          </section>
        </div>
      </section>
    </main>
  );
}
