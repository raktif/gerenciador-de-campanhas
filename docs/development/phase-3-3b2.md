# Fase 3B.2 — Relógios

## Decisões de produto autorizadas

Em 2026-11-16, o responsável respondeu às questões pendentes da 3B.2. Essas decisões posteriores
prevalecem sobre campos e estados conflitantes da especificação-base para esta atividade:

- total de divisões exclusivamente 4, 6, 8, 10 ou 12, escolhido por picklist;
- divisões são partes de objetivo/acontecimento, não partidas nem Sessões da campanha; tipos
  `progress`, `threat`, `countdown`, `project`, `investigation` e `custom` são classificatórios e
  seguem a mesma regra;
- o narrador escolhe explicitamente preenchimento inteiro de zero ao total. Nada avança por tempo,
  partida/Sessão, recálculo ou tipo;
- preencher todas as divisões conclui automaticamente na mesma operação/transação. O narrador
  também pode concluir manualmente com progresso parcial ou zero, preservando o preenchimento;
- os únicos estados são `active` (Ativo) e `completed` (Concluído). Concluídos permanecem
  consultáveis, mas são imutáveis: não se editam, reabrem, reativam, arquivam nem restauram;
- persiste-se o estado e progresso atuais, sem log de avanços/transições, motivo ou Sessão por
  avanço. Nenhuma tabela de histórico de relógios é criada. O histórico da 3B.1 não é afetado;
- alterar o total para abaixo do preenchimento atual é recusado explicitamente, sem redução
  silenciosa.

## Implementação

A migração aditiva **v25** cria `clocks`, com identidade/campanha, nome/descrição, tipo, total e
preenchimento, estado atual, timestamps e revisão otimista. Constraints SQLite limitam total,
preenchimento, tipo e estado; triggers impedem edição de registros concluídos e sua remoção. Índices
cobrem listagem por campanha/estado e campanha/tipo.

Após devolução do QA independente em 2026-11-16, a migração aditiva **v26**
(`0026_clock_completed_replace_guard.sql`) acrescenta guardas `BEFORE INSERT` e `BEFORE UPDATE`
para impedir que `INSERT OR REPLACE` ou `UPDATE OR REPLACE` com colisão no ID substituam um relógio
concluído. A regressão executa SQLite com `recursive_triggers=0`, confirma erro e preservação dos
registros originais. A v25 e seus checksums não foram alterados: como sua aplicação prévia não pode
ser presumida nem descartada, a proteção foi adicionada por migração posterior, com backup
verificado pelo fluxo padrão. Há teste específico de upgrade v25→v26 que confirma o checksum v25 e
a preservação de relógio concluído.

Após as decisões finais sobre metadados, vínculos e Eventos, a migração aditiva **v27**
(`0027_clock_entity_consequence_and_generated_events.sql`) estabelece o modelo final sem alterar
v25/v26 nem seus checksums. Todo relógio contém consequência e referência obrigatória a exatamente
uma entidade (`clock_entity_links.clock_id` é chave primária), além de `visibility`, `canon_state`,
`knowledge_state`, `origin_kind` e `source_id`. As guardas verificam mesma campanha, origem/fonte e
entidade ativa para novos vínculos; FKs restritivas preservam o vínculo histórico e impedem excluir
entidade vinculada. Arquivar a entidade não arquiva nem altera o relógio.

Como v25/v26 não armazenavam entidade ou consequência, a v27 aborta explicitamente se encontrar
qualquer relógio legado. O runner normal cria e verifica backup e executa migrações pendentes numa
transação; o erro `CLOCKS_V27_INCOMPATIBLE_LEGACY_CLOCKS` reverte o lote, inclusive v26 ao atualizar
de v25, preservando a versão e os dados anteriores. Não é inventada entidade/consequência, não se
apagam registros e não há exceção read-only. Upgrade vazio de v24, v25 ou v26 segue até a versão
atual; testes
SQLite verificam upgrade vazio, falha atômica de v25/v26 incompatíveis, backup, versão, checksum e
integridade do banco após erro.

Na revalidação independente, o QA encontrou dois novos defeitos. A migração aditiva **v28**
(`0028_clock_create_idempotency.sql`) cria um registro técnico por tentativa lógica de criação,
com chave idempotente global, campanha, hash do payload normalizado e referência única ao relógio.
Essa tabela não registra progresso/transições narrativas. A criação verifica e grava a chave,
relógio e Evento na mesma transação `IMMEDIATE`: repetição idêntica devolve o relógio já criado,
enquanto reutilização com payload ou campanha diferente falha explicitamente. Chave nova permite
criar intencionalmente relógios de conteúdo igual. v25–v27 e seus checksums permanecem intactos.

Contratos estritos, repositório, serviço e handlers IPC mantêm acesso SQLite no processo principal,
campanha ativa e isolamento por campanha. Criação, edição e conclusão explícita são transacionadas
com `IMMEDIATE`; revisão obsoleta gera conflito sem gravação. A conclusão automática decorrente do
preenchimento total é a única mudança automática autorizada e limita-se à transição de estado na
mesma operação explícita. A geração de Evento não é automática: só ocorre após confirmação
explícita do narrador; não promove cânone nem registra histórico de progresso.

A interface lista relógios Ativos e Concluídos, permite escolher total por picklist e preencher
divisões por seleção. O detalhe concluído é somente leitura. Paginação, estados de carregamento,
lista vazia, erro e descarte explícito de edição para recarregar foram tratados. Após falha
recuperável em `clocks.get`, o retry repete o GET do ID solicitado mesmo sem objeto carregado; E2E
confirma dois GETs idênticos e nenhuma chamada de criar/editar/concluir. Token de requisição e
invalidação ao sair preservam a segurança assíncrona. Nenhum UUID é exibido. As divisões são
rotuladas para não confundir com Sessões da campanha.

Após a devolução do QA independente `0a318fb1-86e7-4d04-881b-397165665871`, os bugs de v25 `REPLACE`
(corrigido por v26) e retry do GET exato (corrigido na UI) estão implementados com regressões. As
decisões finais posteriores do responsável, autoritativas para 3B.2:

- todo relógio exige exatamente uma entidade da mesma campanha e consequência textual obrigatória
  desde a criação; ambos só podem ser alterados enquanto o relógio estiver Ativo;
- vínculo a entidade arquivada não pode ser criado; arquivar depois preserva vínculo e consulta/
  conclusão do relógio; entidade vinculada não pode ser excluída, apenas arquivada; concluído torna
  o vínculo imutável; não ampliar essas regras para entidades sem relógio;
- não há role livre no vínculo do relógio: consequência descreve o evento potencial;
- toda conclusão — preenchimento total, conclusão manual parcial ou vazia — deve perguntar antes
  da gravação se o narrador quer gerar Evento. Cancelar o diálogo não muta; “não” conclui sem Evento;
  “sim” cria, atomicamente, Evento Rascunho para revisão, com título do relógio, descrição da
  consequência e vínculo à entidade. Não promover a Aceito/Fato nem ao cânone;
- a confirmação também se aplica à criação com preenchimento total, se a interface oferecer esse
  estado inicial; a UI pode iniciar em zero, mas preserva a escolha de preenchimento inicial;
- evento, vínculo e conclusão devem ser uma operação atômica/idempotente; sem tabela de histórico
  por avanço, preservando referência rastreável do Evento se necessária.
- usar `NarrativeMetadataFields` e `manualNarrativeDefaults` para relógios (`accepted`, `fact`,
  `gm`, `manual`, sem fonte inicialmente), editáveis enquanto Ativo, com as validações padrão de
  origem/fonte;
- Evento gerado usa `draft`/`possibility`/`gm`/`manual`, sem Sessão, e o vínculo evento→entidade
  usa o papel existente `related` (“Relacionada — associação geral com o evento”);
- se a entidade vinculada for arquivada, o relógio permanece Ativo e seu vínculo é preservado. Não
  se criam novos relógios, vínculos ou Eventos para entidade arquivada. Relógios Ativos assim
  vinculados devem destacar visivelmente “Entidade arquivada — encerre o relógio manualmente”.
  Concluir sem Evento continua permitido; ao pedir Evento, a confirmação informa que a entidade
  arquivada impede a geração. Cancelar não muta; tentar gerar e encontrar arquivamento concorrente
  falha sem concluir o relógio. Não relaxar guardas existentes de Eventos.

Concluindo com Evento, o repositório cria o Evento `draft`/`possibility`/`gm`/`manual`, sem Sessão,
e o vínculo `related` na mesma transação `IMMEDIATE` que conclui/cria o relógio. Colisão, revisão
obsoleta ou entidade arquivada falham sem mutação parcial; `generated_event_id` mantém a referência
única para idempotência/consistência, sem histórico de avanços. A UI oferece as opções explícitas
Gerar Evento, Concluir sem Evento e Cancelar; em entidade arquivada, oculta a opção de geração,
destaca o vínculo na lista/detalhe e permite encerrar sem Evento.

**Estado após a segunda devolução:** os achados de `REPLACE`, metadados, vínculo, Eventos,
arquivamento/destaque, atomicidade, migrações e retry GET foram aprovados pelo QA. Os dois achados
novos — idempotência de criação e associação de erros a retries paralelos — foram corrigidos nesta
rodada e revalidados pelo mesmo QA, com decisão **APROVADA TECNICAMENTE**, sem novos achados. No novo
E2E paralelo, a espera foi alinhada ao indicador exibido quando a lista ainda está vazia
(`Carregando relógios…`); os três cenários E2E focais passaram, incluindo a ordem controlada de
falhas/retries e a verificação de zero mutações durante a recuperação. Nenhuma base real foi
consultada ou alterada. UX manual permanece pendente para avaliação conjunta pelo usuário ao final
de toda a 3B.

### Padrões existentes de Evento relevantes à decisão

O contrato de Evento já permite `sessionId = null`, `eventOrder = 0` e `occurredAtLabel = null`.
Para evento de relógio, os metadados aprovados são `draft`/`possibility`/`gm`/`manual`, com
`sourceId = null`; `event_entity_links` usa o papel existente `related`. A criação de Evento valida
campanha e exige entidade ativa; `event_entity_links` tem FK `ON DELETE RESTRICT`; arquivar
entidade não remove vínculos. Não será relaxada a guarda: a operação verifica estado atual e só
cria Evento se a entidade continuar ativa. `NarrativeMetadataFields` possui seleção de Sessão de
origem para origem `session` e validação no serviço.

## Verificações focais do implementador

Verificações focais desta implementação:

- `rtk corepack pnpm@11.24.0 typecheck` — passou;
- integração SQLite de Relógios — 14 testes passaram, cobrindo enum/limites, cardinalidade,
  campanha e fonte, metadados, conclusão com progresso parcial/zero, imutabilidade, Eventos,
  arquivamento, transação/rollback, `REPLACE` com `recursive_triggers=0` e upgrade/falha atômica;
- integração SQLite de Relógios e regressão direta de Fios Abertos — 22 testes passaram em 2
  arquivos, incluindo upgrade v23 existente e banco vazio até schema 27;
- contratos/serviço/gateway/IPC/erros — 16 testes passaram em 5 arquivos, incluindo rejeição de
  atualização total sem decisão explícita de Evento;
- E2E (`tests/e2e/clocks.spec.ts`) — 2 testes passaram com diretórios de dados e perfis Electron
  temporários isolados; cobrem criação inicial totalmente preenchida com cancelamento, confirmação
  de Evento draft, conclusão sem Evento, arquivamento concorrente/destaque, reinício e retry GET
  sem mutações; em seguida, após a correção QA, 3 E2E focal passaram, incluindo chamadas paralelas
  com falhas fora de ordem e retry correto de cada carregamento, sem mutações;
- teste SQLite focal repetiu a mesma criação com Evento após reabrir a conexão, confirmou mesma
  resposta/um relógio/um Evento; conflito por payload/campanha, criação intencional nova,
  concorrência, rollback de colisão e persistência da chave foram verificados; upgrade vazio v25,
  v26 e v27 para v28 também foi coberto;
- `rtk corepack pnpm@11.24.0 typecheck` — passou;
- ESLint direcionado — passou;
- Prettier nos documentos e arquivos focais — passou;
- `rtk corepack pnpm@11.24.0 exec node scripts/build-e2e.mjs` — passou, com aviso upstream de
  `inlineDynamicImports` obsoleto;
- `rtk git diff --check` — passou.

Não foram executadas suítes amplas nem UX manual.

## Revalidação independente final

O QA aprovou tecnicamente a 3B.2 após confirmar os dois últimos ajustes. Executou 7 testes
unitários em 3 arquivos, 16 testes de integração de Relógios e 3 E2E focais, todos aprovados.
Um fluxo automatizado adicional com duas chamadas IPC simultâneas confirmou um único relógio
e Evento para a mesma chave, criação intencional com chave nova e retorno do estado atual
após conclusão ao repetir a criação original. A inspeção confirmou retries independentes,
rotação da chave para nova criação e preservação das migrações v25–v27; `git diff --check` passou.
Typecheck, lint e Prettier foram relatados pelo implementador e não repetidos pelo QA nesta
rodada. Nenhuma suíte ampla ou UX manual foi executada. A aprovação técnica não substitui a UX
conjunta pendente ao final da 3B.

## UX manual da 3B

Por decisão do responsável, os testes manuais de UX de toda a etapa 3B serão feitos pelo usuário
conjuntamente ao final da etapa. A UX desta atividade permanece pendente e nenhum item abaixo está
aprovado.

- [ ] Criar relógios escolhendo cada total permitido; confirmar que valores fora da lista não são
      aceitos.
- [ ] Conferir tipos disponíveis, inclusive `countdown`, e confirmar que todos preenchem na mesma
      direção/regra.
- [ ] Consultar progresso de 0, parcial e total, sem associação automática com partidas/Sessões.
- [ ] Editar um relógio ativo até o total e confirmar conclusão no mesmo salvamento.
- [ ] Criar com preenchimento inicial total; confirmar que a mesma pergunta aparece antes de
      persistir a conclusão e que cancelar não grava nem gera Evento.
- [ ] Concluir manualmente relógios parcialmente preenchidos e vazios; conferir preservação do
      progresso.
- [ ] Tentar reduzir o total abaixo do progresso atual; confirmar erro claro e ausência de
      truncamento.
- [ ] Consultar concluídos na lista/detalhe e confirmar ausência de editar, reabrir, arquivar ou
      restaurar.
- [ ] Fechar e reabrir o aplicativo; confirmar que valores e conclusão permanecem.
- [ ] Confirmar gerar/dispensar Evento em conclusão e que cancelar não persiste a conclusão; revisar
      Eventos Rascunho como não canônicos.
- [ ] Arquivar uma entidade vinculada, conferir destaque em lista/detalhe, bloqueio de geração de
      Evento e conclusão manual sem Evento.
- [ ] Conferir metadados narrativos e origem/fonte, inclusive recuperação clara de fonte incompatível.
- [ ] Conferir lista vazia, carregamento, erros recuperáveis, paginação e troca de tela/campanha sem
      conteúdo obsoleto ou UUID visível.
