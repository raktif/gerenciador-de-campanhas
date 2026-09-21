# Fase 2 — Atividade 2.9: Triagem da Caixa de Entrada

Estado: concluída em 2026-09-18. Este registro cobre somente o incremento 2.9; não declara a
Fase 2 completa.

## Escopo entregue

- **2.9A — ciclo de vida:** lista paginada por cursor, filtros de status, abertura de revisão,
  descarte, arquivamento e restauração. A máquina de estados preserva itens arquivados e exige
  revisão otimista para cada mudança.
- **2.9B — entidade:** conversão transacional para entidade com tipo ativo, metadados narrativos e
  proveniência da captura.
- **2.9C — relação:** conversão para relação com extremos existentes ou criação do extremo
  necessário, tipo de relação, restrições de tipos, normalização de simetria e aviso de possível
  duplicidade sem transformar sucesso em erro.
- **2.9D — registros narrativos:** conversão transacional para afirmação, nota ou evento. A
  afirmação requer sujeito e declaração válida; nota preserva tipo, corpo e vínculos; evento aceita
  sessão opcional, ordem, rótulo temporal e vínculos ordenados.

Nenhuma conversão de objetos da Fase 3 foi exposta. A captura rápida 2.8 continua criando apenas
um item não classificado e pode ser retomada pela Caixa de Entrada.

## Rastreabilidade

| Requisito | Implementação                                                                                                                             | Evidência automatizada                                                                                                                              |
| --------- | ----------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| INB-01    | `InboxRepository.capture`, `InboxService.capture`, atalho e diálogo de Captura rápida                                                     | `tests/e2e/inbox.spec.ts` abre a Caixa de Entrada a partir da captura e confirma sua listagem                                                       |
| INB-02    | contrato, serviço e persistência de `sessionId` opcional validam campanha e sessão ativa                                                  | contratos, serviço e integração de Inbox cobrem sessão inválida e isolamento                                                                        |
| INB-03    | `InboxRepository`/`InboxService` aplicam `new → reviewing`, descarte, arquivamento e restauração com revisão                              | unitários, IPC e primeiro cenário de `tests/e2e/inbox.spec.ts` cobrem filtro, descarte, retorno à triagem e paginação                               |
| INB-04    | métodos `convertToEntity`, `convertToRelationship`, `convertToAssertion`, `convertToNote` e `convertToEvent` executam uma transação única | `tests/integration/inbox-repository.test.ts` cobre sucesso, conflito, rollback interno e isolamento por destino; E2E cobre os cinco fluxos visíveis |
| INB-05    | `sources`, pontes `inbox_*_conversions` e ponteiros do item preservam texto e origem                                                      | integração verifica fonte/ponte; E2E reinicia o Electron e consulta SQLite para entidade, relação, afirmação, nota e evento                         |

## Persistência, atomicidade e proveniência

As migrações `0010` a `0015` complementam a base de captura e tornam a conversão rastreável:

- `0010` e `0011` introduzem e endurecem a proveniência de entidade;
- `0012` cria a proveniência de relação e seus guardas de campanha/origem;
- `0013` cria as pontes explícitas de afirmação, nota e evento e os guardas de inserção;
- `0014` e `0015` protegem atualizações de fonte, campanha e origem para que um destino convertido
  não perca nem redirecione a proveniência Inbox.

Cada conversão cria a `source` cujo `description` é o texto bruto da captura, o destino e seus
vínculos, atualiza o item para `converted` com ponteiro de destino e grava a ponte de conversão na
mesma transação SQLite. Falhas inseridas depois da criação da fonte e falhas por validação de
campanha, vínculo, sessão ou conflito de revisão fazem rollback integral: não permanece fonte,
destino, vínculo, ponte nem alteração do item. Os testes SQLite de Inbox mantêm essa evidência de
rollback, pois o E2E focal comprova o fluxo do usuário e a persistência após reinício, não injeta
falhas internas de banco.

## IPC e segurança Electron

Os contratos Zod estritos cobrem leitura/listagem, transições e as cinco conversões. Cada handler
de Inbox valida remetente, entrada e saída e retorna `Result<T>` sem expor detalhes internos. O
`CampaignManagerGateway` do preload oferece métodos tipados e não expõe Node, SQLite ou
`ipcRenderer`; o renderer usa exclusivamente esse gateway. Testes de contratos, handlers e preload
cobrem entrada estrita, remetente não autorizado, erro seguro, resultado e canais novos.

## Interface e acessibilidade

A Caixa de Entrada permanece uma lista textual navegável dentro da campanha, com carregamento,
vazios específicos por filtro, erro recuperável, paginação que preserva a lista e feedback de
operação por cartão. Diálogos de descarte, arquivamento e conversão têm foco inicial interno,
contenção de Tab/Shift+Tab, Escape, retorno ao gatilho e fundo `inert`; erros usam `role=alert` e
operações usam `aria-busy` e controles desabilitados. Os diálogos exibem o texto original como
referência somente leitura, com quebra de palavras/rolagem. Restrições e pré-requisitos de tipos
de entidade/relação são anunciados com caminho acionável de administração; escolhas incompatíveis
não são confirmáveis. Metadados narrativos são editáveis nas cinco conversões.

O E2E de Inbox cobre captura, revisão, descarte confirmado por teclado, filtros, paginação,
conversões de entidade/relação/afirmação/nota/evento, diálogo modal e persistência após reinício.
Em particular, as consultas SQLite pós-reinício verificam as fontes e pontes de proveniência para
os destinos que não são apenas exibidos no renderer.

## Limites mantidos

Não fazem parte desta atividade: conversão para relógios, demandas, consequências, documentos,
PDFs ou qualquer objeto da Fase 3 em diante; classificação automática, IA, busca global, histórico
geral em `change_log`, importação/exportação e empacotamento final. A execução consolidada de
verificação, empacotamento e documentação geral continua sendo responsabilidade da atividade 2.10.
