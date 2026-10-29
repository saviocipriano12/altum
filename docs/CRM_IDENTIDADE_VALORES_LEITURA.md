# Identificação da negociação e valores desconhecidos

## Contrato de leitura

Lista de clientes, ficha, funil e contexto comercial da conversa preservam:

- `contactId`: identificador existente da pessoa, quando estruturalmente válido;
- `recordKind`: `opportunity` ou `legacy`, sem converter um cadastro antigo em
  oportunidade por suposição;
- `opportunityTitle`: título da negociação, preservando o nome da pessoa;
- `potentialValue`: número informado, inclusive zero, ou `null` quando desconhecido.

A busca global inclui o título da oportunidade nos resultados e na pesquisa.
Lista, Kanban, ficha, painel da conversa e apresentação móvel usam o título para
distinguir negociações do mesmo cliente. Não é uma associação automática de
conversa à compra. Identificador válido não comprova identidade entre canais;
redirecionamento canônico e vínculo recíproco continuam sendo responsabilidade
dos serviços de identidade, com autorização de cada registro.

## Valores e denominadores

- `potentialValue: null` é desconhecido, inclusive quando existe `valorPotencial`
  antigo. Só a ausência da propriedade moderna permite ler o número legado.
- Valores armazenados inválidos não viram zero. A leitura aceita números finitos
  não negativos; texto numérico legado requer tratamento explícito na migração.
- O formulário preserva zero na abertura. Vazio enviado pelo vendedor grava
  `null`; números e textos numéricos finitos entre zero e 1e12 são aceitos pelos
  dois caminhos manuais tratados. Booleanos, objetos e números inválidos são
  rejeitados antes da gravação. A mudança não cria receita ou pagamento.
- Totais somam valores conhecidos e informam `knownValueCount` e
  `unknownValueCount`. Um zero declarado participa do denominador conhecido.
  Sem nenhum valor informado, a interface mostra esse estado em vez de R$ 0.
- A métrica da visão atual não se apresenta como valor de oportunidades abertas:
  seus filtros podem incluir negociações encerradas.

## Funil compatível e cobertura

A rota do funil mantém `summary.totalLeads` para consumidores antigos e acrescenta
`recordCount`, `explicitOpportunityCount` e `legacyRecordCount`. Esses números
contam registros acessíveis carregados, não pessoas únicas nem aquisição.

O leitor consulta no máximo 241 registros para devolver até 240. `coverage`
informa `scope: loaded_accessible_records`, `limit: 240` e `hasMore`. Quando houver
mais dados, esse resumo não é um resultado global da empresa. Não substitui a
paginação integral, o índice de busca ou os relatórios conciliáveis previstos.

## Evidências e pendências

Os testes autenticados com serviços locais comparam a mesma oportunidade em
lista, ficha, funil, família e contexto da conversa; verificam busca por título,
carteira de outro vendedor, valor explicitamente desconhecido com valor legado,
edição/criação manual e rejeições sem gravação. Há teste separado com 245 registros
fictícios para conferir o limite e seus denominadores. Resultados no registro
da missão; isso não comprova desempenho com dez mil registros ou aceite visual.

Continuam abertos: interface de nova oportunidade/recompra, escolha explícita
da negociação na conversa, limites históricos da IA, exclusão da compra versus
da pessoa, migração, exportação, demais indicadores e consumidores. Não habilitar
escrita automática em conversas ambíguas usando apenas telefone ou este DTO.

Reversão: manter os campos adicionais como compatibilidade de leitura e retirar
as apresentações novas se necessário. Não converter `null` de volta para zero
nem apagar títulos, vínculos ou valores gravados. Não houve migração/publicação.
