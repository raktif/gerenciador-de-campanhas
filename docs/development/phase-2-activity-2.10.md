# Fase 2 â€” Atividade 2.10: IntegraÃ§Ã£o e fechamento

Estado final em 2026-09-21: 2.10A (navegaÃ§Ã£o), 2.10B (acessibilidade/resiliÃªncia), 2.10C
(rastreabilidade), 2.10D (documentaÃ§Ã£o) e 2.10E (validaÃ§Ã£o final) concluÃ­das. A Fase 2 estÃ¡
concluÃ­da.

## Resultado factual da 2.10E

A etapa Ãºnica 1/4 foi executada em 2026-09-18 com `APP_DATA_DIR` isolado em
`tmp/phase-2-final-20260918-6f7b1a`:

```powershell
pnpm verify
```

Resultado: falhou com cÃ³digo de saÃ­da `1` durante `pnpm lint`, antes de Prettier, typecheck,
unitÃ¡rios ou integraÃ§Ã£o. O lint reportou 10 erros: quatro
`@typescript-eslint/no-unnecessary-condition` em
`src/renderer/features/inbox/inbox-manager.tsx` (linhas 444, 873, 880 e 886) e seis
`@typescript-eslint/no-unused-vars` para `_input` em `tests/ipc/inbox-handlers.test.ts` (linhas
271, 274, 277, 280, 283 e 286).

Em conformidade com o fechamento Ãºnico, a sequÃªncia foi interrompida nesse resultado. Os comandos
seguintes â€” `pnpm test:e2e`, `pnpm package` e `pnpm test:package` â€” nÃ£o foram executados; nÃ£o hÃ¡
artefato de pacote ou smoke test aprovado. A Fase 2 e a 2.10E permanecem pendentes atÃ© correÃ§Ã£o e
nova autorizaÃ§Ã£o para uma sequÃªncia completa.

ApÃ³s a correÃ§Ã£o focal de lint, uma nova rodada completa foi autorizada. Ela iniciou `pnpm verify`
com `APP_DATA_DIR` isolado em `tmp/phase-2-final-20260918-9c4d2e`. O executor mostrou apenas o
inÃ­cio de `pnpm verify` e `eslint .`; os processos Node dessa rodada foram observados em execuÃ§Ã£o e
depois encerraram, mas o executor nÃ£o retornou cÃ³digo de saÃ­da, a linha explÃ­cita de captura
`PHASE_2_10E_VERIFY_EXIT` nem qualquer saÃ­da posterior ao ESLint. O resultado dessa rodada Ã©
inconclusivo, nÃ£o aprovado. Para preservar a sequÃªncia Ãºnica, `pnpm test:e2e`, `pnpm package` e
`pnpm test:package` nÃ£o foram iniciados.

Uma rodada final posterior iniciou corretamente com `APP_DATA_DIR` isolado em
`tmp/phase-2-final-20260918-a47e`. `pnpm verify` retornou cÃ³digo de saÃ­da `1`: o ESLint concluiu e
o `prettier --check .` identificou problemas de estilo em `docs/development/phase-2-activity-2.9.md`,
`src/db/schema/index.ts` e `tests/unit/inbox-contracts.test.ts`. A sequÃªncia foi interrompida antes
de typecheck, testes unitÃ¡rios, integraÃ§Ã£o, `pnpm test:e2e`, `pnpm package` e `pnpm test:package`.
NÃ£o hÃ¡ evidÃªncia de pacote ou smoke test aprovado; a 2.10E e a Fase 2 continuam pendentes.

ApÃ³s a correÃ§Ã£o de estilo, a rodada seguinte usou `APP_DATA_DIR` isolado em
`tmp/phase-2-final-20260918-b91f`. `pnpm verify` alcanÃ§ou e aprovou ESLint, `prettier --check .` e
`tsc --noEmit`, mas terminou com cÃ³digo `1` ao iniciar `vitest run`: o Vite nÃ£o carregou
`vitest.config.mts` porque a resoluÃ§Ã£o de dependÃªncias recebeu `spawn EPERM`. Por isso nÃ£o houve
testes unitÃ¡rios ou de integraÃ§Ã£o executados, nem inÃ­cio de `pnpm test:e2e`, `pnpm package` ou
`pnpm test:package`. A falha de criaÃ§Ã£o de processo Ã© um bloqueio de ambiente, nÃ£o aprovaÃ§Ã£o de
testes; a 2.10E e a Fase 2 permanecem pendentes.

A repetiÃ§Ã£o tecnicamente justificada fora do sandbox usou `APP_DATA_DIR` isolado em
`tmp/phase-2-final-20260918-c52e` e eliminou o `spawn EPERM`. ESLint, Prettier e typecheck passaram;
o Vitest unitÃ¡rio passou com 57 arquivos e 196 testes. A integraÃ§Ã£o terminou com cÃ³digo `1`: 14 de
16 arquivos passaram, mas `tests/integration/database.test.ts` e
`tests/integration/phase-two-foundation.test.ts` tiveram cinco asserÃ§Ãµes que esperavam versÃ£o de
schema `9` e receberam `15`; a limpeza dos bancos tambÃ©m registrou `EBUSY` ao remover arquivos
SQLite. `pnpm test:e2e`, `pnpm package` e `pnpm test:package` nÃ£o foram iniciados. Sem aprovaÃ§Ã£o da
integraÃ§Ã£o, a 2.10E e a Fase 2 continuam pendentes.

A correÃ§Ã£o focal confirmou que a versÃ£o corrente `15` Ã© definida pelo registro de migraÃ§Ãµes, e nÃ£o
uma alteraÃ§Ã£o produtiva inesperada. Os dois testes agora comparam a versÃ£o aberta Ã  Ãºltima migraÃ§Ã£o
registrada e seu `afterEach` fecha contextos SQLite ainda abertos antes de remover diretÃ³rios, com
tentativas limitadas para `EBUSY` no Windows. A execuÃ§Ã£o escalada de apenas
`database.test.ts` e `phase-two-foundation.test.ts` passou (2 arquivos, 11 testes); typecheck e
checagem de diff tambÃ©m passaram. Isso nÃ£o substitui uma nova execuÃ§Ã£o completa autorizada de
`pnpm verify`, E2E, empacotamento e smoke test: a 2.10E e a Fase 2 permanecem pendentes.

A nova rodada completa escalada com `APP_DATA_DIR` em `tmp/phase-2-final-20260918-d73b` aprovou
`pnpm verify`: lint, Prettier, typecheck, 57 arquivos/196 testes unitÃ¡rios e 16 arquivos/66 testes
de integraÃ§Ã£o. `pnpm test:e2e` terminou com cÃ³digo `1`, com 10 de 12 cenÃ¡rios aprovados. As falhas
foram: `campaigns.spec.ts` usa `getByText('Detalhes da campanha')`, agora ambÃ­guo entre o destino do
shell e o tÃ­tulo do formulÃ¡rio; e `inbox.spec.ts` espera aviso de possÃ­vel duplicidade depois da
conversÃ£o de relaÃ§Ã£o, mas recebeu apenas a confirmaÃ§Ã£o de criaÃ§Ã£o. Por isso `pnpm package` e
`pnpm test:package` nÃ£o foram iniciados. A 2.10E e a Fase 2 continuam pendentes.

Os dois cenÃ¡rios foram corrigidos sem mudanÃ§a produtiva. Campanhas verifica o botÃ£o semÃ¢ntico de
salvar em vez de texto duplicado do shell. Inbox seleciona explicitamente `Mara â†’ Nara`, que forma
uma duplicata com o tipo `Conhece`, e verifica a mensagem contratual retornada pela regra REL-03;
tambÃ©m restringe a leitura do texto original da afirmaÃ§Ã£o Ã  sua regiÃ£o acessÃ­vel. A geraÃ§Ã£o do bundle
E2E e a execuÃ§Ã£o escalada focal passaram para ambos os cenÃ¡rios (2 testes); Prettier, typecheck e
checagem de diff passaram. Essa evidÃªncia nÃ£o substitui a nova execuÃ§Ã£o E2E completa, nem
empacotamento ou smoke test: a 2.10E e a Fase 2 permanecem pendentes.

Na rodada final `f44a`, `pnpm verify`, os 12 E2E e o empacotamento Windows x64 passaram, mas o
smoke test encontrou a expectativa obsoleta de schema `8`. A correÃ§Ã£o substituiu esse nÃºmero mÃ¡gico
por um manifesto compartilhado: o registro valida que o histÃ³rico Ã© contÃ­nuo e alcanÃ§a a versÃ£o do
manifesto, e o smoke compara o banco do pacote ao mesmo valor. O smoke focal passou com schema `15`,
SQLite `3.53.4` e FTS5. Como o pacote foi gerado antes dessa alteraÃ§Ã£o no registro, Ã© necessÃ¡ria uma
nova rodada completa para concluir a 2.10E e a Fase 2.

O fechamento verificÃ¡vel foi concluÃ­do em 2026-09-21 com `APP_DATA_DIR` isolado e evidÃªncias
persistentes em `tmp/phase-2-final-verifiable-20260921-h7p3`. Os quatro markers registraram saÃ­da
`0`: `pnpm verify` (196 testes unitÃ¡rios e 66 de integraÃ§Ã£o), `pnpm test:e2e` (12 cenÃ¡rios),
`pnpm package` (pacote Windows x64) e `pnpm test:package` (startup, schema `15`, SQLite `3.53.4` e
FTS5). As tentativas anteriores acima permanecem histÃ³rico; este Ã© o resultado final aprovado da
2.10E e da Fase 2.

## MÃ©todo e limites

Esta matriz parte dos requisitos REL/GRF/AST/NOT/SES/EVT/TIM/INB definidos em
[Fase 2 â€” Refinamento tÃ©cnico](phase-2-refinement.md). Ela aponta a menor evidÃªncia jÃ¡ existente
por requisito e nÃ£o duplica testes que jÃ¡ foram aprovados nos incrementos 2.2 a 2.9.

As referÃªncias a testes indicam cobertura implementada. A reexecuÃ§Ã£o consolidada foi aprovada no
fechamento verificÃ¡vel de 2026-09-21; as tentativas histÃ³ricas nÃ£o substituem essa evidÃªncia final.

## Matriz de requisitos e evidÃªncias

| Requisito | Regra verificÃ¡vel                                                 | EvidÃªncia de domÃ­nio, persistÃªncia e IPC                                                                                  | EvidÃªncia de interface                                                                                                   | SituaÃ§Ã£o para 2.10E              |
| --------- | ------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- | ---------------------------------- |
| REL-T-01  | nome e `slug` sÃ£o Ãºnicos por campanha                            | `relationship-type-contracts`, `relationship-type-service`, `relationship-type-repository` e `relationship-type-handlers`    | `tests/e2e/relationship-types.spec.ts` cria, arquiva e persiste tipos                                                     | Coberto; reexecutado em 2026-09-21 |
| REL-T-02  | forma inversa Ã© apresentada no sentido oposto                     | contratos/serviÃ§o de tipo de relaÃ§Ã£o e integraÃ§Ã£o de repositÃ³rio                                                       | `relationship-types.spec.ts` confere a forma inversa; `relationship-neighborhood.spec.ts` percorre direÃ§Ã£o inversa      | Coberto; reexecutado em 2026-09-21 |
| REL-T-03  | vÃ­nculo simÃ©trico Ã© Ãºnico                                      | contratos e serviÃ§o normalizam e detectam duplicidade; integraÃ§Ã£o de tipos/relaÃ§Ãµes                                     | `relationship-types.spec.ts` configura simetria; E2E de vizinhanÃ§a consulta o vÃ­nculo                                   | Coberto; reexecutado em 2026-09-21 |
| REL-T-04  | origem e destino respeitam tipos permitidos                        | contratos e `relationship-service.test.ts` rejeitam `RELATIONSHIP_ENTITY_TYPE_NOT_ALLOWED`; integraÃ§Ã£o cobre a restriÃ§Ã£o | formulÃ¡rio configura as listas permitidas; E2E cria uma relaÃ§Ã£o compatÃ­vel                                            | Coberto; reexecutado em 2026-09-21 |
| REL-01    | extremos pertencem Ã  mesma campanha                               | `relationship-service`, `relationship-repository` e `relationship-handlers` cobrem isolamento                                | `relationship-neighborhood.spec.ts` usa campanha isolada                                                                  | Coberto; reexecutado em 2026-09-21 |
| REL-02    | relaÃ§Ã£o mantÃ©m estado, natureza, visibilidade e origem          | contratos, serviÃ§o e repositÃ³rio de relaÃ§Ãµes                                                                             | `relationship-neighborhood.spec.ts` exercita criaÃ§Ã£o e consulta; os metadados sÃ£o evidenciados nas camadas de domÃ­nio | Coberto; reexecutado em 2026-09-21 |
| REL-03    | duplicidade retorna aviso sem perder dados                         | `relationship-service` e integraÃ§Ã£o de relaÃ§Ãµes verificam aviso e persistÃªncia                                          | `relationship-neighborhood.spec.ts` mantÃ©m consulta navegÃ¡vel                                                           | Coberto; reexecutado em 2026-09-21 |
| REL-04    | eventos de vigÃªncia pertencem Ã  campanha da relaÃ§Ã£o            | `relationship-service`, `event-service` e integraÃ§Ã£o de eventos/relaÃ§Ãµes                                                 | fluxo permanece restrito Ã  campanha selecionada                                                                          | Coberto; reexecutado em 2026-09-21 |
| REL-05    | referÃªncias de entidade usam somente relaÃ§Ãµes                   | contratos de entidades/relaÃ§Ãµes e serviÃ§os correspondentes                                                                | `entities.spec.ts` e `relationship-neighborhood.spec.ts` exercitam referÃªncias e a navegaÃ§Ã£o                           | Coberto; reexecutado em 2026-09-21 |
| GRF-01    | lista mostra direÃ§Ã£o direta ou inversa corretamente              | consultas de relaÃ§Ãµes e contratos                                                                                          | `relationship-neighborhood.spec.ts` verifica direÃ§Ã£o                                                                    | Coberto; reexecutado em 2026-09-21 |
| GRF-02    | profundidade 1â€“3 nÃ£o repete nÃ³s em ciclos                      | `relationship-service`, `relationship-repository` e `relationship-manager-pagination`                                        | `relationship-neighborhood.spec.ts` exercita profundidade e ciclo                                                         | Coberto; reexecutado em 2026-09-21 |
| GRF-03    | filtros de tipo, estado, natureza e visibilidade sÃ£o aplicados    | contratos e consulta de vizinhanÃ§a                                                                                          | `relationship-neighborhood.spec.ts` verifica filtros                                                                      | Coberto; reexecutado em 2026-09-21 |
| AST-01    | sujeito obrigatÃ³rio; objeto opcional                              | `assertion-contracts`, `assertion-service`, integraÃ§Ã£o e `narrative-handlers`                                              | `narrative.spec.ts` cria e edita afirmaÃ§Ã£o                                                                              | Coberto; reexecutado em 2026-09-21 |
| AST-02    | declaraÃ§Ã£o textual ou predicado/valor Ã© vÃ¡lida                 | contratos e serviÃ§o de afirmaÃ§Ã£o                                                                                          | `narrative.spec.ts` cobre validaÃ§Ã£o e apresentaÃ§Ã£o de possibilidade                                                   | Coberto; reexecutado em 2026-09-21 |
| NOT-01    | tipo/corpo sÃ£o validados e arquivamento preserva conteÃºdo        | `note-contracts`, `note-service`, `note-repository` e IPC narrativo                                                          | `narrative.spec.ts` cobre CRUD, arquivamento e restauraÃ§Ã£o                                                              | Coberto; reexecutado em 2026-09-21 |
| NOT-02    | vÃ­nculos de notas nÃ£o cruzam campanhas                           | transaÃ§Ã£o de vÃ­nculos em `note-repository` e validaÃ§Ã£o de serviÃ§o                                                      | `narrative.spec.ts` consulta a mesma nota pelas duas entidades                                                            | Coberto; reexecutado em 2026-09-21 |
| SES-01    | sequÃªncia positiva e Ãºnica por campanha                          | contratos/serviÃ§o/repositÃ³rio de sessÃ£o, IPC e preload                                                                    | `sessions.spec.ts` planeja e persiste sessÃ£o                                                                             | Coberto; reexecutado em 2026-09-21 |
| SES-02    | sÃ³ transiÃ§Ãµes permitidas sÃ£o aceitas                           | `session-service` e `session-contracts`                                                                                      | `sessions.spec.ts` inicia e conclui sob confirmaÃ§Ã£o                                                                     | Coberto; reexecutado em 2026-09-21 |
| SES-03    | participantes, papÃ©is e campanha sÃ£o validados transacionalmente | `session-participant-service` e integraÃ§Ã£o de participantes                                                                | `sessions.spec.ts` persiste participantes apÃ³s reinÃ­cio                                                                 | Coberto; reexecutado em 2026-09-21 |
| SES-04    | intenÃ§Ãµes obedecem estados e transiÃ§Ãµes                        | contratos/serviÃ§o/integraÃ§Ã£o de intenÃ§Ãµes e IPC de sessÃ£o                                                              | `sessions.spec.ts` cobre ediÃ§Ã£o, transiÃ§Ã£o e paginaÃ§Ã£o                                                              | Coberto; reexecutado em 2026-09-21 |
| EVT-01    | evento tem sessÃ£o opcional e ordem estÃ¡vel                       | `event-contracts`, `event-service`, `event-repository` e `event-handlers`                                                    | `events-timeline.spec.ts` registra evento e ordenaÃ§Ã£o                                                                   | Coberto; reexecutado em 2026-09-21 |
| EVT-02    | vÃ­nculos preservam papel e ordem                                  | serviÃ§o/integracÃ£o de eventos em transaÃ§Ã£o                                                                               | `events-timeline.spec.ts` confere papÃ©is e ordem                                                                         | Coberto; reexecutado em 2026-09-21 |
| TIM-01    | cronologia de campanha Ã© determinÃ­stica                          | `timeline-contracts`, `timeline-service`, `timeline-repository` e IPC                                                        | `events-timeline.spec.ts` cobre duas sessÃµes, evento solto e reinÃ­cio                                                   | Coberto; reexecutado em 2026-09-21 |
| TIM-02    | cronologia de entidade sÃ³ traz vÃ­nculos dela                     | consulta de entidade, serviÃ§o e integraÃ§Ã£o de cronologia                                                                  | `events-timeline.spec.ts` verifica exclusÃ£o de evento alheio e papÃ©is                                                   | Coberto; reexecutado em 2026-09-21 |
| INB-01    | captura nÃ£o exige classificaÃ§Ã£o                                 | `inbox-contracts`, `inbox-service`, `inbox-repository`, IPC/preload e `quick-capture-model`                                  | `quick-capture.spec.ts` cobre botÃ£o, atalho e reinÃ­cio                                                                  | Coberto; reexecutado em 2026-09-21 |
| INB-02    | sessÃ£o Ã© opcional e da mesma campanha                            | serviÃ§o/integraÃ§Ã£o de Inbox e guarda SQLite                                                                               | `quick-capture.spec.ts` cobre captura com e sem sessÃ£o                                                                   | Coberto; reexecutado em 2026-09-21 |
| INB-03    | estados da triagem sÃ£o vÃ¡lidos                                   | contratos/serviÃ§o/repositÃ³rio/handlers de Inbox                                                                            | primeiro cenÃ¡rio de `inbox.spec.ts` cobre revisÃ£o, descarte, arquivamento, restauraÃ§Ã£o e paginaÃ§Ã£o                  | Coberto; reexecutado em 2026-09-21 |
| INB-04    | destino e atualizaÃ§Ã£o da captura sÃ£o atÃ´micos                  | `inbox-repository.test.ts` cobre rollback, conflitos e isolamento por destino                                                | `inbox.spec.ts` cobre as cinco conversÃµes visÃ­veis                                                                      | Coberto; reexecutado em 2026-09-21 |
| INB-05    | destino convertido referencia o texto-fonte                        | `sources`, pontes `inbox_*_conversions` e guardas SQLite; integraÃ§Ã£o valida origem                                         | `inbox.spec.ts` reinicia e consulta pontes/fontes de todos os destinos                                                    | Coberto; reexecutado em 2026-09-21 |

Os incrementos anteriores detalham a evidÃªncia por agregado em
[AfirmaÃ§Ãµes e Notas](phase-2-activity-2.5.md), [Eventos e cronologia](phase-2-activity-2.7.md),
[Captura rÃ¡pida](phase-2-activity-2.8.md) e [Triagem da Caixa de Entrada](phase-2-activity-2.9.md).

## EvidÃªncia adicional de integraÃ§Ã£o 2.10A/2.10B

- `tests/e2e/campaigns.spec.ts` contÃ©m o cenÃ¡rio de navegaÃ§Ã£o interna: todos os mÃ³dulos entregues
  aparecem somente em campanha ativa, o destino atual possui `aria-current="page"`, cada destino
  recebe foco no seu tÃ­tulo e o atalho de RelÃ³gios nÃ£o Ã© exposto. A ausÃªncia de Demandas e
  ConsequÃªncias permanece como inspeÃ§Ã£o estÃ¡tica/manual deste incremento.
- O mesmo cenÃ¡rio confirma que campanha arquivada nÃ£o expÃµe mÃ³dulos mutÃ¡veis, preservando apenas
  detalhes e retorno Ã  lista de campanhas.
- `CampaignApp` centraliza o foco do tÃ­tulo em trocas pelo shell. Os retornos contextuais de
  afirmaÃ§Ãµes/notas/cronologia para Entidades continuam cobertos por `narrative.spec.ts` e
  `events-timeline.spec.ts`.
- `RelationshipManager` declara carregamento com `aria-busy`/`role="status"`, nÃ£o troca erro por
  vazio, oferece retry e libera controles em `finally`; a validaÃ§Ã£o visual/manual abaixo confirma
  estes estados que nÃ£o tÃªm injeÃ§Ã£o de falha no E2E.

## RevisÃ£o manual/documental do fechamento

RevisÃ£o registrada em 2026-09-21. Ela consolida E2E final, E2E focal e inspeÃ§Ã£o estÃ¡tica/de
validador; nÃ£o declara uma nova interaÃ§Ã£o humana alÃ©m dessas evidÃªncias.

1. Shell interno: aprovado por `campaigns.spec.ts` final e focal, que cobrem campanha ativa,
   destino atual, foco, persistÃªncia e ausÃªncia de RelÃ³gios. Demandas, ConsequÃªncias, Biblioteca e
   IA foram confirmados por inspeÃ§Ã£o estÃ¡tica. LimitaÃ§Ã£o: nÃ£o houve nova sessÃ£o humana de teclado.
2. Retornos contextuais: aprovado por `narrative.spec.ts`, `events-timeline.spec.ts` e inspeÃ§Ã£o do
   shell, que preservam retorno Ã  Entidades e limpam contexto pela navegaÃ§Ã£o lateral. LimitaÃ§Ã£o: a
   revisÃ£o Ã© automatizada/documental, nÃ£o exploratÃ³ria manual.
3. Campanhas nÃ£o ativas: aprovado pelo cenÃ¡rio E2E de navegaÃ§Ã£o e inspeÃ§Ã£o do guarda do shell;
   arquivadas/lixeira expÃµem apenas Detalhes e Campanhas. A restauraÃ§Ã£o Ã© coberta pelo E2E de
   campanhas. Sem limitaÃ§Ã£o adicional identificada.
4. RelaÃ§Ãµes: carregamento, vazio, erro com retry e estado ocupado foram revisados no cÃ³digo e na
   validaÃ§Ã£o independente de 2.10B; o E2E final cobre os fluxos de relaÃ§Ã£o. LimitaÃ§Ã£o: nÃ£o foi
   executado novo harness manual de injeÃ§Ã£o de erro nesta rodada.
5. Acessibilidade transversal: foco, rÃ³tulos, confirmaÃ§Ãµes e anÃºncios foram revisados por E2E final
   e focal, componentes de 2.10B e inspeÃ§Ã£o estÃ¡tica. LimitaÃ§Ã£o: sem auditoria humana assistiva
   adicional nesta rodada.
6. Modo sem IA/rede: inspeÃ§Ã£o de arquitetura e limites confirmou ausÃªncia de provedor, modelo,
   credencial, servidor HTTP ou chamada externa; verify, E2E e pacote foram aprovados. LimitaÃ§Ã£o:
   nÃ£o houve simulaÃ§Ã£o fÃ­sica adicional de indisponibilidade de rede.

## Lacunas e decisÃ£o

NÃ£o foi identificada lacuna de requisito que justifique novo contrato, persistÃªncia, IPC ou teste
duplicado. A lacuna de integraÃ§Ã£o de navegaÃ§Ã£o/foco recebeu cenÃ¡rio E2E novo em 2.10A; a lacuna de
carregamento/erro de RelaÃ§Ãµes foi corrigida em 2.10B e revisada documentalmente acima. As tentativas
histÃ³ricas com `spawn EPERM` foram superadas pela execuÃ§Ã£o verificÃ¡vel final de 2026-09-21.

## Limites mantidos

Este incremento nÃ£o cria objetos, botÃµes, tabelas, gateways ou conversÃµes de RelÃ³gios, Demandas,
ConsequÃªncias, Biblioteca, documentos, IA, exportaÃ§Ã£o, importaÃ§Ã£o ou histÃ³rico geral. A Fase 4+
(inclusive portabilidade) permanece fora do escopo. A execuÃ§Ã£o Ãºnica verificÃ¡vel de verify, E2E,
empacotamento e smoke test foi concluÃ­da em 2026-09-21.
