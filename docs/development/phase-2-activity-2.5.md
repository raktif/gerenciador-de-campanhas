# Fase 2 — Atividade 2.5: Afirmações e Notas

Estado: concluída em 2026-09-04. Este registro cobre somente o incremento 2.5; não declara a Fase 2
completa.

## Escopo entregue

- Afirmações textuais ou estruturadas, com sujeito obrigatório, objeto opcional, valor JSON e
  metadados narrativos.
- Notas com título, corpo Markdown armazenado como texto, tipo, metadados narrativos e vínculos
  `entidade + papel`.
- CRUD, revisão otimista, arquivamento/restauração, paginação por cursor e isolamento por campanha.
- Consulta contextual de afirmações e notas a partir de uma entidade; uma nota vinculada a várias
  entidades pode ser encontrada a partir de cada uma delas.
- IPC assíncrono e gateways tipados para `create`, `get`, `list`, `update`, `archive` e `restore`.
- Interface acessível a partir da campanha e da entidade, com carregamento, vazio, erro recuperável,
  confirmação de arquivamento, bloqueio de envio duplicado e anúncios assistivos.

O renderer exibe o corpo Markdown com `white-space: pre-wrap`, sem interpretar ou inserir HTML
bruto. Afirmações com natureza `possibility` recebem o rótulo explícito "Possibilidade — não
confirmada como fato".

## Rastreabilidade

| Requisito     | Implementação                                                      | Evidência automatizada                                                               |
| ------------- | ------------------------------------------------------------------ | ------------------------------------------------------------------------------------ |
| AST-01/AST-02 | `contracts/assertions`, `AssertionRepository` e `AssertionService` | contratos, serviço, integração e E2E narrativo                                       |
| NOT-01        | `contracts/notes`, `NoteRepository` e `NoteService`                | limites, CRUD, concorrência e preservação no arquivamento                            |
| NOT-02        | `note_entity_links` e substituição transacional de vínculos        | rollback, isolamento, consulta por cada entidade e E2E com dois vínculos             |
| IPC/preload   | canais explícitos, handlers validados e `CampaignManagerGateway`   | testes IPC e de gateway, incluindo entrada/saída inválida e remetente não autorizado |
| Interface     | `AssertionManager`, `NoteManager` e navegação contextual           | `tests/e2e/narrative.spec.ts`                                                        |

## Controles verificados

- Schemas Zod estritos validam UUID, limites, enums, JSON serializável e valores padrão.
- Serviços validam campanha, entidades ativas, proveniência e revisão antes de persistir.
- Criação/edição de nota e vínculos ocorre em uma transação; testes cobrem rollback.
- Cursores vinculam campanha, filtros e ordenação e usam UUID como desempate estável.
- Handlers validam remetente, entrada e saída e retornam `Result<T>` sem detalhes internos.
- O preload não expõe `ipcRenderer` ou APIs Node; entradas inválidas são bloqueadas antes do IPC.
- O renderer usa exclusivamente `window.campaignManager` e trata rejeições com erro seguro e
  restauração de `busy`/`loading` em `finally`.
- Persistência após reinício, possibilidade não tratada como fato, vínculos múltiplos e ciclo de
  arquivamento/restauração são cobertos pelo E2E narrativo.

## Limites mantidos

Não fazem parte deste incremento: sessões, eventos, linha do tempo, Caixa de Entrada, busca global,
renderização enriquecida de Markdown, documentos/PDFs, IA e qualquer funcionalidade da Fase 3.
