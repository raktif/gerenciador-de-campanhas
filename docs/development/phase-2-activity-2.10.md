# Fase 2 — Atividade 2.10C: Rastreabilidade integrada

Estado: 2.10A (navegação), 2.10B (acessibilidade/resiliência) e 2.10C (rastreabilidade) concluídas
em 2026-09-18. A 2.10D está em fechamento documental; 2.10E permanece pendente. Este registro não
declara a Fase 2 concluída: a execução única de fechamento, o empacotamento e o smoke test continuam
reservados à 2.10E.

## Método e limites

Esta matriz parte dos requisitos REL/GRF/AST/NOT/SES/EVT/TIM/INB definidos em
[Fase 2 — Refinamento técnico](phase-2-refinement.md). Ela aponta a menor evidência já existente
por requisito e não duplica testes que já foram aprovados nos incrementos 2.2 a 2.9.

As referências a testes indicam cobertura implementada. A reexecução consolidada continua pendente
para o fechamento da 2.10; não se deve inferir deste documento que uma suíte não executada nesta
atividade tenha sido aprovada novamente.

## Matriz de requisitos e evidências

| Requisito | Regra verificável                                                | Evidência de domínio, persistência e IPC                                                                                  | Evidência de interface                                                                                                | Situação para 2.10E               |
| --------- | ---------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- | --------------------------------- |
| REL-T-01  | nome e `slug` são únicos por campanha                            | `relationship-type-contracts`, `relationship-type-service`, `relationship-type-repository` e `relationship-type-handlers` | `tests/e2e/relationship-types.spec.ts` cria, arquiva e persiste tipos                                                 | Coberto; reexecutar no fechamento |
| REL-T-02  | forma inversa é apresentada no sentido oposto                    | contratos/serviço de tipo de relação e integração de repositório                                                          | `relationship-types.spec.ts` confere a forma inversa; `relationship-neighborhood.spec.ts` percorre direção inversa    | Coberto; reexecutar no fechamento |
| REL-T-03  | vínculo simétrico é único                                        | contratos e serviço normalizam e detectam duplicidade; integração de tipos/relações                                       | `relationship-types.spec.ts` configura simetria; E2E de vizinhança consulta o vínculo                                 | Coberto; reexecutar no fechamento |
| REL-T-04  | origem e destino respeitam tipos permitidos                      | contratos e `relationship-service.test.ts` rejeitam `RELATIONSHIP_ENTITY_TYPE_NOT_ALLOWED`; integração cobre a restrição  | formulário configura as listas permitidas; E2E cria uma relação compatível                                            | Coberto; reexecutar no fechamento |
| REL-01    | extremos pertencem à mesma campanha                              | `relationship-service`, `relationship-repository` e `relationship-handlers` cobrem isolamento                             | `relationship-neighborhood.spec.ts` usa campanha isolada                                                              | Coberto; reexecutar no fechamento |
| REL-02    | relação mantém estado, natureza, visibilidade e origem           | contratos, serviço e repositório de relações                                                                              | `relationship-neighborhood.spec.ts` exercita criação e consulta; os metadados são evidenciados nas camadas de domínio | Coberto; reexecutar no fechamento |
| REL-03    | duplicidade retorna aviso sem perder dados                       | `relationship-service` e integração de relações verificam aviso e persistência                                            | `relationship-neighborhood.spec.ts` mantém consulta navegável                                                         | Coberto; reexecutar no fechamento |
| REL-04    | eventos de vigência pertencem à campanha da relação              | `relationship-service`, `event-service` e integração de eventos/relações                                                  | fluxo permanece restrito à campanha selecionada                                                                       | Coberto; reexecutar no fechamento |
| REL-05    | referências de entidade usam somente relações                    | contratos de entidades/relações e serviços correspondentes                                                                | `entities.spec.ts` e `relationship-neighborhood.spec.ts` exercitam referências e a navegação                          | Coberto; reexecutar no fechamento |
| GRF-01    | lista mostra direção direta ou inversa corretamente              | consultas de relações e contratos                                                                                         | `relationship-neighborhood.spec.ts` verifica direção                                                                  | Coberto; reexecutar no fechamento |
| GRF-02    | profundidade 1–3 não repete nós em ciclos                        | `relationship-service`, `relationship-repository` e `relationship-manager-pagination`                                     | `relationship-neighborhood.spec.ts` exercita profundidade e ciclo                                                     | Coberto; reexecutar no fechamento |
| GRF-03    | filtros de tipo, estado, natureza e visibilidade são aplicados   | contratos e consulta de vizinhança                                                                                        | `relationship-neighborhood.spec.ts` verifica filtros                                                                  | Coberto; reexecutar no fechamento |
| AST-01    | sujeito obrigatório; objeto opcional                             | `assertion-contracts`, `assertion-service`, integração e `narrative-handlers`                                             | `narrative.spec.ts` cria e edita afirmação                                                                            | Coberto; reexecutar no fechamento |
| AST-02    | declaração textual ou predicado/valor é válida                   | contratos e serviço de afirmação                                                                                          | `narrative.spec.ts` cobre validação e apresentação de possibilidade                                                   | Coberto; reexecutar no fechamento |
| NOT-01    | tipo/corpo são validados e arquivamento preserva conteúdo        | `note-contracts`, `note-service`, `note-repository` e IPC narrativo                                                       | `narrative.spec.ts` cobre CRUD, arquivamento e restauração                                                            | Coberto; reexecutar no fechamento |
| NOT-02    | vínculos de notas não cruzam campanhas                           | transação de vínculos em `note-repository` e validação de serviço                                                         | `narrative.spec.ts` consulta a mesma nota pelas duas entidades                                                        | Coberto; reexecutar no fechamento |
| SES-01    | sequência positiva e única por campanha                          | contratos/serviço/repositório de sessão, IPC e preload                                                                    | `sessions.spec.ts` planeja e persiste sessão                                                                          | Coberto; reexecutar no fechamento |
| SES-02    | só transições permitidas são aceitas                             | `session-service` e `session-contracts`                                                                                   | `sessions.spec.ts` inicia e conclui sob confirmação                                                                   | Coberto; reexecutar no fechamento |
| SES-03    | participantes, papéis e campanha são validados transacionalmente | `session-participant-service` e integração de participantes                                                               | `sessions.spec.ts` persiste participantes após reinício                                                               | Coberto; reexecutar no fechamento |
| SES-04    | intenções obedecem estados e transições                          | contratos/serviço/integração de intenções e IPC de sessão                                                                 | `sessions.spec.ts` cobre edição, transição e paginação                                                                | Coberto; reexecutar no fechamento |
| EVT-01    | evento tem sessão opcional e ordem estável                       | `event-contracts`, `event-service`, `event-repository` e `event-handlers`                                                 | `events-timeline.spec.ts` registra evento e ordenação                                                                 | Coberto; reexecutar no fechamento |
| EVT-02    | vínculos preservam papel e ordem                                 | serviço/integracão de eventos em transação                                                                                | `events-timeline.spec.ts` confere papéis e ordem                                                                      | Coberto; reexecutar no fechamento |
| TIM-01    | cronologia de campanha é determinística                          | `timeline-contracts`, `timeline-service`, `timeline-repository` e IPC                                                     | `events-timeline.spec.ts` cobre duas sessões, evento solto e reinício                                                 | Coberto; reexecutar no fechamento |
| TIM-02    | cronologia de entidade só traz vínculos dela                     | consulta de entidade, serviço e integração de cronologia                                                                  | `events-timeline.spec.ts` verifica exclusão de evento alheio e papéis                                                 | Coberto; reexecutar no fechamento |
| INB-01    | captura não exige classificação                                  | `inbox-contracts`, `inbox-service`, `inbox-repository`, IPC/preload e `quick-capture-model`                               | `quick-capture.spec.ts` cobre botão, atalho e reinício                                                                | Coberto; reexecutar no fechamento |
| INB-02    | sessão é opcional e da mesma campanha                            | serviço/integração de Inbox e guarda SQLite                                                                               | `quick-capture.spec.ts` cobre captura com e sem sessão                                                                | Coberto; reexecutar no fechamento |
| INB-03    | estados da triagem são válidos                                   | contratos/serviço/repositório/handlers de Inbox                                                                           | primeiro cenário de `inbox.spec.ts` cobre revisão, descarte, arquivamento, restauração e paginação                    | Coberto; reexecutar no fechamento |
| INB-04    | destino e atualização da captura são atômicos                    | `inbox-repository.test.ts` cobre rollback, conflitos e isolamento por destino                                             | `inbox.spec.ts` cobre as cinco conversões visíveis                                                                    | Coberto; reexecutar no fechamento |
| INB-05    | destino convertido referencia o texto-fonte                      | `sources`, pontes `inbox_*_conversions` e guardas SQLite; integração valida origem                                        | `inbox.spec.ts` reinicia e consulta pontes/fontes de todos os destinos                                                | Coberto; reexecutar no fechamento |

Os incrementos anteriores detalham a evidência por agregado em
[Afirmações e Notas](phase-2-activity-2.5.md), [Eventos e cronologia](phase-2-activity-2.7.md),
[Captura rápida](phase-2-activity-2.8.md) e [Triagem da Caixa de Entrada](phase-2-activity-2.9.md).

## Evidência adicional de integração 2.10A/2.10B

- `tests/e2e/campaigns.spec.ts` contém o cenário de navegação interna: todos os módulos entregues
  aparecem somente em campanha ativa, o destino atual possui `aria-current="page"`, cada destino
  recebe foco no seu título e o atalho de Relógios não é exposto. A ausência de Demandas e
  Consequências permanece como inspeção estática/manual deste incremento.
- O mesmo cenário confirma que campanha arquivada não expõe módulos mutáveis, preservando apenas
  detalhes e retorno à lista de campanhas.
- `CampaignApp` centraliza o foco do título em trocas pelo shell. Os retornos contextuais de
  afirmações/notas/cronologia para Entidades continuam cobertos por `narrative.spec.ts` e
  `events-timeline.spec.ts`.
- `RelationshipManager` declara carregamento com `aria-busy`/`role="status"`, não troca erro por
  vazio, oferece retry e libera controles em `finally`; a validação visual/manual abaixo confirma
  estes estados que não têm injeção de falha no E2E.

## Verificações manuais obrigatórias para fechamento

Registrar o resultado, sistema operacional e versão do pacote no fechamento 2.10E.

1. Com uma campanha ativa, percorra por `Tab` o shell interno. Acione cada destino por `Enter` ou
   `Space`; confirme um único `aria-current="page"`, título focalizado e persistência da campanha
   selecionada. Confirme ausência de Relógios, Demandas, Consequências, Biblioteca e IA.
2. A partir de uma entidade, abra Afirmações, Notas e Cronologia; use o retorno de cada tela e
   confirme retorno à lista de Entidades. Pela navegação lateral, abra a versão da campanha e
   confirme que o contexto da entidade não persiste indevidamente.
3. Arquive e envie uma campanha à lixeira. Ao abri-la, confirme que somente Detalhes e Campanhas
   são navegáveis e que restaurar reabilita os módulos da Fase 2.
4. Na tela Relações, confirme separadamente carregamento, vazio ativo, vazio arquivado, erro com
   retry e controles desabilitados durante uma escrita. A injeção de erro deve ocorrer somente por
   harness/local de desenvolvimento, sem apontar `APP_DATA_DIR` a dados reais.
5. Em cada tela entregue, use apenas teclado para criar, editar, confirmar arquivamento/descarte e
   recuperar erro. Confirme rótulos, foco visível, anúncio de erro/sucesso e que cor não é a única
   indicação de estado.
6. Com rede indisponível e sem runtime/modelo de IA, crie campanha, tipos, entidades, relação,
   sessão, evento, captura e conversão. Confirme que não há bloqueio, solicitação de credencial ou
   erro relacionado a IA.

## Lacunas e decisão

Não foi identificada lacuna de requisito que justifique novo contrato, persistência, IPC ou teste
duplicado. A lacuna de integração de navegação/foco recebeu cenário E2E novo em 2.10A; a lacuna de
carregamento/erro de Relações foi corrigida em 2.10B e depende da verificação manual controlada
acima. A execução de Vitest/Playwright focal permanece pendente neste ambiente por bloqueio de
criação de processos (`spawn EPERM`); não é evidência de aprovação nem falha funcional.

## Limites mantidos

Este incremento não cria objetos, botões, tabelas, gateways ou conversões de Relógios, Demandas,
Consequências, Biblioteca, documentos, IA, exportação, importação ou histórico geral. Também não
substitui a execução única de `pnpm verify`, E2E, empacotamento e smoke test da 2.10E.
