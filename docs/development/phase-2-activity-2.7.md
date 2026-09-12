# Fase 2 — Atividade 2.7: Eventos e cronologia

Estado: concluída em 2026-09-11. Este registro cobre somente o incremento 2.7; não declara a Fase 2
completa.

## Escopo entregue

- Eventos com sessão opcional, ordem na sessão, referência temporal livre, descrição Markdown,
  metadados narrativos, proveniência, revisão otimista, arquivamento e restauração.
- Vínculos de evento com entidades ativas da mesma campanha, com papel e ordem; criação e
  substituição dos vínculos são transacionais.
- Isolamento por campanha para evento, sessão, entidade e fonte. A vigência de uma relação só aceita
  eventos da campanha da relação.
- Canais IPC e gateway tipado para Eventos e consultas de cronologia, com Zod estrito, `Result`,
  validação de remetente e preload sem APIs privilegiadas.
- Interface acessível de Eventos dentro de Sessões e cronologias da campanha e de cada entidade, com
  carregamento, vazio, erro recuperável, paginação e consulta histórica de entidade arquivada.
- Linha do tempo da campanha e da entidade com cursores presos à campanha, entidade e filtro de
  arquivamento. Eventos ativos são o padrão; arquivados exigem filtro explícito.

## Ordem narrativa

`occurredAtLabel` é uma referência textual e nunca é interpretado como data. A ordem entregue pelo
backend é: eventos associados a sessões por `sessions.sequenceNumber` crescente, `eventOrder`
crescente, `createdAt` e ID; em seguida, eventos sem sessão, por `createdAt` e ID. A interface exibe
essa ordem sem reordená-la. A ordem de vínculo é armazenada a partir de zero e apresentada ao usuário
a partir de um.

## Rastreabilidade

| Requisito | Implementação                                                                           | Evidência automatizada                                              |
| --------- | --------------------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| EVT-01    | `events` e `event_entity_links`, `EventRepository`, `EventService`, metadados e revisão | contratos, serviço e `tests/integration/event-repository.test.ts`   |
| EVT-02    | Validação de sessão/entidade/campanha e substituição transacional de vínculos           | testes de serviço, integração e `tests/e2e/events-timeline.spec.ts` |
| TIM-01    | `TimelineRepository`/`TimelineService`, cursor e ordem narrativa de campanha            | contratos, serviço, integração, IPC/preload e E2E com duas sessões  |
| TIM-02    | Filtro por entidade, preservação de papéis/ordem e consulta histórica                   | contratos, serviço, integração, IPC/preload e E2E de entidade       |

O E2E cria duas sessões, registra um evento e seu vínculo pelo formulário acessível de Eventos e usa
o gateway público apenas para dados complementares. Ele também cria uma segunda campanha com evento
próprio, preserva os dados após reiniciar o Electron e confere ordem, papéis e isolamento nas
cronologias da campanha e da entidade da primeira campanha.

## Controles verificados

- Schemas Zod estritos validam UUIDs, limites, enums, metadados, vínculos e paginação.
- Serviços aplicam isolamento entre campanhas, entidades ativas para escrita, sessão pertencente à
  campanha, proveniência e revisão otimista.
- Repositórios executam substituição de vínculos na mesma transação da escrita de evento.
- Handlers validam remetente, entrada e saída, retornando `Result<T>` sem detalhes internos; o preload
  expõe somente gateways tipados.
- A cronologia não calcula ordem a partir de texto livre e mantém desempates estáveis no cursor.

## Limites mantidos

Não fazem parte deste incremento: captura rápida (2.8), Caixa de Entrada (2.9), integração final
(2.10), IA, busca global, geração de documentos ou novas migrações além da estrutura já existente.
