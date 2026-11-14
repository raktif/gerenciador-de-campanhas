# Fase 3A.2 — Registro de Cânone

## Escopo e estado

Entrega técnica implementada e encaminhada para validação independente do QA; não é aprovação do
implementador. A 3A.1 foi aprovada tecnicamente pelo QA. Conforme orientação do responsável, o teste
manual de UX de toda a etapa 3A está adiado até a conclusão da etapa. A 3A.3 não foi iniciada.

O Registro de Cânone consulta e apresenta as afirmações existentes. Não cria agregado ou tabela
paralela e não duplica fatos. As consultas permanecem limitadas à campanha, usam a paginação atual
de afirmações e não criam fontes ou sessões ausentes.

## Categorias e campos exibidos

| Categoria do Registro | Estado existente usado como filtro |
| --------------------- | ---------------------------------- |
| Fatos                 | `knowledgeState = fact`            |
| Rumores               | `knowledgeState = rumor`           |
| Suspeitas             | `knowledgeState = suspicion`       |
| Segredos              | `knowledgeState = secret`          |
| Possibilidades        | `knowledgeState = possibility`     |
| Refutados             | `knowledgeState = disproved`       |
| Rascunhos             | `canonState = draft`               |

As seis primeiras categorias refletem natureza (`knowledgeState`); Rascunhos reflete estado
canônico (`canonState`). São filtros de visualização, não uma classificação persistida adicional.
Cada item exibe declaração, assunto, natureza, estado canônico, visibilidade, origem, fonte e
sessão. A fonte e o título de sessão são lidos da proveniência já persistida; na ausência de uma
referência, a interface indica ausência, sem inventar fonte ou sessão. Quando existe fonte, seu
descrição legível é mostrada; UUIDs de fontes, sessões e entidades não são apresentados na interface.
O assunto vem da entidade vinculada, inclusive quando arquivada; referências ausentes são indicadas
como indisponíveis sem expor identificadores. A revisão continua baseada em `revision` otimista.

## Promoção de Possibilidade a Fato

A ação dedicada `promotePossibilityToFact` exige o marcador estrito
`confirmation: "possibility-to-fact"` no contrato de entrada, além de `campaignId`, `id` e `revision`.
O serviço rejeita promoção por `update` genérico de `knowledgeState: fact`, valida que o estado
atual ainda seja Possibilidade e aplica revisão otimista. A ação dedicada altera somente
`knowledgeState` para `fact`; preserva `canonState`, visibilidade, origem, `sourceId`, sessão,
conteúdo e demais campos. Não promove nem aceita decisões automaticamente.

A confirmação de interface tem ações separadas para confirmar e cancelar. Cancelar descarta a
confirmação pendente sem chamar o gateway. Enquanto a confirmação está aberta, seu alvo é fixo e
identificado pela declaração e assunto; as ações de outras possibilidades ficam indisponíveis. Trocar
categoria, visibilidade, ciclo de vida, contexto ou tela de edição/criação cancela a intenção pendente.
Um conflito de revisão descarta a confirmação, recarrega o filtro atualmente ativo e exige uma nova
intenção e confirmação com a revisão atual; não há repetição automática do patch antigo. Atualizações
depois de uma promoção usam o filtro corrente e substituem com segurança requisições de categoria ou
página ainda pendentes, sem deixar o estado de carregamento preso.

A promoção também revalida o estado ativo das entidades relacionadas. Entidades arquivadas continuam
visíveis como contexto histórico, mas bloqueiam a promoção no serviço; a afirmação não é alterada e a
interface orienta restaurar a entidade vinculada.

## Limites e dependências

- Detecção e exibição de possíveis conflitos não fazem parte desta atividade. A 3A.4 é a dependência
  prevista para avisos de contradição; o Registro não exibe indicador ou resultado “sem conflitos”.
- Esta entrega não implementa detecção/cálculo/ciclo de sinais, relógios, demandas, consequências,
  fios, causalidade, fechamento de sessão, IA ou rede.
- Não há migração: os dados apresentados e atualizados são as afirmações e fontes já persistidas.
- O mapeamento de “Refutados” é `knowledgeState = disproved` conforme a definição autoritativa
  §§10/31; “Rascunhos” é `canonState = draft` e pode coexistir com qualquer natureza.
- Falhas de carregamento não são apresentadas como lista vazia. Respostas antigas são ignoradas; se
  uma promoção falha por revisão obsoleta, a confirmação pendente é descartada, a lista é recarregada
  e uma nova intenção/confirmação é exigida.
- O estado de erro da listagem oferece nova tentativa; a lista vazia só é apresentada após uma
  resposta bem-sucedida sem itens.
- Ganchos de falha/latência usados para testar retry e concorrência só são injetados em execução
  `NODE_ENV=test` não empacotada. A verificação de `app.isPackaged` falha fechada antes de ler as
  flags; testes unitários cobrem explicitamente app empacotado e ambiente de produção.
- O incidente reportado `EBUSY` ao abrir `.vite/functions/clean.js` continua inconclusivo. O diff
  não altera Vite, scripts de build ou cache; nenhum cache foi removido nem processo encerrado.
- O teste manual de UX permanece deliberadamente pendente até a conclusão de 3A; esta entrega não
  declara qualquer avaliação ou aprovação de UX.
