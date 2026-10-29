# Legibilidade das páginas públicas — 16/10/2026

## Direção visual

A combinação de fundos pêssego, texto cinza e tipografia fina reduzia a clareza da apresentação. As áreas de leitura agora usam branco e cinza neutro, texto chumbo e títulos com maior peso. O laranja forte fica nas seções de marca e chamadas finais, com texto preto.

- Seção de inteligência aplicada: fundo `#ff7a1a`, texto `#171717`, títulos expressivos, cards numerados e ilustrações em preto.
- Títulos principais com peso 700–750; textos de leitura com peso 500 e descrições maiores.
- Planos com texto mais escuro, nomes e preços mais fortes, cards brancos e destaque por borda laranja.
- Largura útil de até 1360px; cards de capacidades em cinco blocos, com adaptação para duas colunas e uma coluna no celular.
- Cabeçalho branco opaco. A demonstração mantém suas animações internas, mas seu contêiner não flutua, para preservar a nitidez.

## Escopo

Estilos limitados ao módulo das páginas públicas e ajustes locais de fundo na home, plataforma e implantação. Nenhuma alteração desta etapa em CSS global, painel do cliente, admin, autenticação, APIs ou banco.

## Contraste

Cálculo pela luminância relativa sRGB das cores sólidas:

| Combinação | Contraste |
| --- | --- |
| `#1b1b1e` sobre branco | 17,18:1 |
| `#414145` sobre branco | 10,16:1 |
| `#171717` sobre `#ff7a1a` | 6,87:1 |

Estes valores verificam as combinações principais; não constituem uma auditoria completa de acessibilidade.

## Verificação

Inspeção visual em desktop, painel lateral e celular de 390px. Sem rolagem horizontal no celular; grade de capacidades em uma coluna. Capturas e logs em `.qa-artifacts/public-readability/`.

Build de produção concluído, incluindo a verificação TypeScript. ESLint dos três arquivos TSX alterados passou. As 36 rotas públicas verificadas responderam corretamente e os 18 arquivos de imagem referenciados existem. Carrossel de preços navegado no navegador até sua última posição.

Servidores locais de produção disponíveis nas portas 3000 e 3001. A versão permanece local, sem publicação.
