# Fase 3B.3 — Demandas Emergentes

## Escopo e estado

Implementação limitada à 3B.3, autorizada pelo responsável em 2026-11-17, com os esclarecimentos
finais registrados abaixo. **Aprovada tecnicamente pelo QA independente em 2026-11-17**, após
duas rodadas de correções. Não houve início da 3B.4 ou 3C. UX de toda a etapa 3B continua pendente
para avaliação conjunta do usuário ao final da etapa.

O QA independente `2d182783-225e-4a2c-9cf9-c57b24df1161` devolveu a implementação por dois
achados médios de UI. As correções abaixo estão entregues para **revalidação pelo mesmo QA**;
não representam autoaprovação nem aprovação de UX.
Na primeira revalidação, os dois achados anteriores passaram, mas o QA identificou outro achado
médio: diagnósticos de operações de sinais, Entidade e Evento ainda eram atribuídos a Demandas.
A correção transversal foi revalidada pelo mesmo QA e aprovada sem novos achados. Para detalhes e
evidências, veja as seções de devolução e correção abaixo.

Precedência: Adendo 03v2 > 02 > 01 > principal; as decisões explícitas do responsável para esta
subtarefa refinam o modelo-base (§32 e §§79–84). O adendo03 antigo não foi usado.

## Contrato de produto aprovado

- Sugestões usam **somente** sinais `explicit_need` existentes. Não combinam tramas, inferem
  obstáculos/urgência, nem acrescentam detectores de Fios, Relógios ou Consequências.
- Antes da revisão explícita não existe registro em `demands`. Ignorar/adiar/reativar atuam no
  mesmo sinal da 3A.3 e respeitam seu ciclo de vida, inclusive stale e vencimento de snooze.
- Aceitação exige sinal `new`/`viewed` ainda detectável, mesma revisão e conteúdo/evidência
  atualizados. A necessidade é copiada literalmente, com solicitante original; título-modelo
  baseado na entidade e resumo editável. Obstáculo/riscos começam vazios. Urgência é escolha
  explícita `low/medium/high/critical`, independente da prioridade do sinal.
- A Demanda aceita operacionalmente começa `available` e permanece
  `draft/possibility/gm/generator`, com fonte explicativa. Aceitar **não** promove cânone.
- No máximo uma conversão por sinal. Demanda, fonte/snapshot e `converted` são gravados na mesma
  transação. Reenvio idêntico retorna a mesma Demanda, inclusive após reinício; payload divergente
  é recusado. Recálculo não altera o conteúdo da Demanda aceita.
- Disponível pode ser ativada. Disponível/Ativa podem ser explicitamente resolvidas, falhadas ou
  ignoradas. Somente Disponível/Ativa permitem editar conteúdo/vínculos. Falhada/Ignorada exigem
  reabertura para Disponível antes de editar. Resolvida é somente leitura.
- Arquivamento preserva o estado anterior e restauração o recupera; conteúdo/vínculos arquivados
  não se editam. Não existe exclusão de Demanda.
- Transformação cria **nova filha**, com novo texto informado pelo narrador, mantendo lookup para
  o pai e linhagem até o sinal/campo originais. Não consome outro sinal. O formulário copia os
  vínculos do pai para revisão. Confirmação cria filha Disponível e arquiva pai atomicamente, com
  chave idempotente. Não substitui objetivo nem altera o Need original.
- Pai só é resolvido por ação manual após todas as filhas encerradas (`resolved/failed/ignored`).
  Filha arquivada só conta se o estado preservado for um desses três. Pai arquivado precisa ser
  restaurado antes de resolver; nada o conclui automaticamente.
- Há um solicitante principal obrigatório, sempre incluído entre os vínculos de Entidade, mais N
  vínculos de Entidades pelos papéis do modelo-base. Clocks e Sessions são associações opcionais.
  Picker: tipo → alvo → botão adicionar. Não inclui Relações, Afirmações, Notas, Eventos ou Fios.
- Novos vínculos exigem mesma campanha e entidades não arquivadas. Sessão concluída continua
  elegível; Relógio concluído continua consultável/elegível. Demandas pendentes impedem arquivar
  entidades vinculadas; arquivar/encerrar a Demanda remove esse bloqueio, não suas referências.
  Qualquer referência de Demanda impede excluir/substituir a entidade.
- Reabrir ou restaurar para estado pendente exige restaurar antes todas as entidades vinculadas.
- Resolver exige popup prévio, cujo cancelamento não grava nada. Confirmar cria obrigatoriamente
  um Evento `draft/possibility/gm/generator`, com título da Demanda, descrição
  `need + "\n\n" + summary` e papel `related` para cada entidade distinta vinculada. Clocks/Sessions
  não viram entidades do Evento. Resolução, Evento e vínculos são atômicos e idempotentes.
- Evento gerado tem conteúdo, origem e vínculos congelados. Permite somente promoção explícita
  `draft/possibility → accepted/fact` e arquivamento/restauração pelo fluxo existente, mantendo
  suas validações de entidades. Não altera eventos comuns nem generaliza imutabilidade a Eventos
  gerados pelos Relógios.

## Proteção permanente da necessidade original

Cada Demanda mantém referências estruturadas ao sinal, entidade, definição e valor exatos. Filhas
mantêm essa linhagem sem competir pela conversão única do sinal. Snapshots preservam sinal,
versão de regra, texto original, evidências, rótulos e justificativa usados na aceitação.

O valor Need original não pode ser alterado/excluído/substituído, mesmo após arquivar ou encerrar
a Demanda. A definição compartilhada não pode trocar papel/tipo, mudar de tipo de entidade, ser
arquivada ou excluída; o tipo de entidade não pode ser arquivado/movido. A entidade fonte não pode
trocar de tipo invalidando o campo. Metadados de apresentação não destrutivos da definição e
atributos alheios à necessidade continuam editáveis; snapshots não são reescritos.

O modelo já permite vários campos de papel Need por tipo e o detector emite um sinal por par
entidade/campo. Orientação na UI/backend: **“Campo usado por Demanda; crie outro campo de Need para
uma nova necessidade.”** O bloqueio do valor é exclusivo da entidade fonte; valores de entidades
irmãs continuam editáveis. O bloqueio da definição compartilhada afeta sua administração para
todo o tipo, como aprovado.

Serviços antecipam erros legíveis; triggers/FKs repetem as garantias contra bypass e REPLACE,
inclusive `recursive_triggers=0`. Atualizações idênticas do valor pelo upsert existente são
permitidas, sem trocar seu ID; isso preserva a edição de outros atributos. O formulário carrega
todas as páginas de definições e bloqueios antes de permitir salvar, para não omitir um campo
protegido além da primeira página.

## Persistência e arquitetura

Migração **v29** (`0029_demands.sql`), estritamente aditiva após v28. Não altera SQL/checksum de
v1–28. Acrescenta Demandas, três tabelas de vínculos e operações idempotentes de transformação,
índices, constraints e triggers específicas da nova funcionalidade. Não introduz histórico geral,
causalidade ou subsistema de Consequências.

Runner existente conserva backup SQLite verificado antes do upgrade e migrações transacionais.
Banco vazio e upgrade v28 são cobertos; dados existentes não são inferidos nem convertidos.
Os locks de Need são permanentes porque Demandas não têm exclusão. Campanhas arquivadas/deletadas
não podem executar comandos de escrita da 3B.3; leituras históricas não removem proveniência.

SQLite/regras de escrita ficam no main/repositório; regras puras de transição ficam em
`core/domain/demand.ts`. IPC valida remetente, frame e contratos Zod de entrada/saída; renderer
acessa exclusivamente gateway tipado. Toda escrita composta usa transação `IMMEDIATE`; revisão
obsoleta falha, locks do banco retornam erro explícito e não há retry silencioso.

Listas e candidatos são paginados. A UI carrega candidatos por todas as páginas, com erro/retry;
requisições obsoletas não substituem a tela após sair. O estado de componente ativo é restaurado
na montagem do efeito para que a repetição de efeitos do React Strict Mode não descarte todas as
respostas iniciais e deixe os controles permanentemente desabilitados. Retry guarda operação e
payload originais, incluindo GET sem detalhe carregado. IDs não são exibidos. Proveniência e fonte
ficam visíveis em rótulos legíveis; a superfície é do narrador, não uma publicação para jogadores.

### Limite de compatibilidade

Necessidade + duas quebras de linha + resumo devem caber no contrato existente de descrição de
Evento (100.000 unidades UTF-16). Conteúdo acima do limite é recusado explicitamente, sem
truncamento/invenção; uma necessidade original longa não pode ser editada silenciosamente para
fazer caber. Unicode, espaços e NUL são preservados no texto/snapshot. Não há rede, IA ou
mudança canônica automática.

## Verificação focal

Testes adicionados:

- `tests/unit/demand-contracts-and-domain.test.ts`: contratos, transições, filhas arquivadas,
  confirmação, reabertura/restauração, limites e erros.
- `tests/unit/demand-gateway.test.ts`: canais tipados e rejeição antes de IPC.
- `tests/ipc/demand-handlers.test.ts`: remetente/frame, entrada/saída e remoção de canais.
- `tests/integration/demand-repository.test.ts`: conversão, snapshots, idempotência, recálculo,
  stale/snooze, Need compartilhado, SQL/REPLACE, isolamento real entre campanhas, vínculos,
  resolução/rollback/Evento/promoção, subdemanda, paginação, Unicode, banco vazio e upgrade/backup.
- `tests/e2e/demands.spec.ts`: Electron com ambos os diretórios isolados; revisão/urgência,
  vínculos N por tipo, pai/filha, cancelamento e confirmação, promoção, reinício, retry de GET
  sem mutação, resposta obsoleta e Need protegido além da primeira página.

Resultados finais: **55 testes unitários/IPC**, **15 testes de integração** (13 novos de Demandas
e 2 regressões de Eventos existentes) e **1 E2E Electron** passaram. Typecheck, ESLint e
formatação focais e `git diff --check` sem erros. Nenhuma suíte ampla, package/make ou UX manual
é parte desta verificação focal.

Comandos de testes executados:

```powershell
rtk corepack pnpm@11.24.0 exec vitest run tests/unit/demand-contracts-and-domain.test.ts tests/unit/demand-gateway.test.ts tests/ipc/demand-handlers.test.ts tests/unit/event-service.test.ts tests/unit/entity-service.test.ts tests/unit/field-definition-service.test.ts tests/unit/entity-type-service.test.ts tests/unit/preload-gateway.test.ts tests/unit/user-facing-error.test.ts tests/unit/event-contracts.test.ts tests/unit/event-manager-model.test.ts
rtk corepack pnpm@11.24.0 exec vitest run --config vitest.integration.config.mts tests/integration/demand-repository.test.ts tests/integration/event-repository.test.ts
rtk run node scripts/build-e2e.mjs
rtk corepack pnpm@11.24.0 exec playwright test tests/e2e/demands.spec.ts --workers=1
rtk corepack pnpm@11.24.0 typecheck
rtk git --no-pager diff --check
```

O caso de integração adicional verifica contenção `BEGIN IMMEDIATE` por segunda conexão:
`DATABASE_BUSY` não grava conversão parcial; após liberar o lock, aceitar/resolver e reiniciar,
retries retornam os mesmos registros. O upgrade parte de v28, verifica backup e preservação
de dados/checksums; o banco vazio chega à v29.

O build focal passou com aviso não bloqueador existente sobre depreciação de
`inlineDynamicImports`. Testes previamente aprovados e inalterados não foram repetidos.

### Devolução QA — diagnóstico e erro/vazio (2026-11-17)

1. **Operação incorreta no diagnóstico:** os dois avisos de operação usavam
   `demands.mutate` fixo. Agora a falha conserva sua operação e os avisos a encaminham ao
   construtor/cópia do diagnóstico. Leituras usam `demands.get`, `demands.list` e `signals.list`;
   a leitura de sugestão passa a ter o identificador específico `demands.suggestion`, acrescentado
   à allowlist validada. Falhas de mutação continuam `demands.mutate`.
2. **Erro e vazio simultâneos:** as consultas de Demandas e sinais deixam de compartilhar um
   único resultado de carga. Cada uma tem estado, aviso, geração assíncrona e retry independentes.
   O texto vazio só aparece para sua própria consulta concluída com sucesso e sem itens.
   A consulta bem-sucedida continua visível se a outra falhar; retry repete apenas a consulta
   que falhou, com os mesmos argumentos, sem executar mutações.

Arquivos desta correção: `src/renderer/features/demands/demand-manager.tsx`,
`src/core/contracts/diagnostics.ts`, novo `tests/e2e/demand-errors.spec.ts` e este documento.
Não há nova migração, mudança no banco ou alteração de regras de domínio.

Evidências: **6 novos testes E2E passaram**, com Electron e ambos os diretórios de dados isolados.
Os testes cobrem falha em cada lista, falhas simultâneas, sucesso vazio inicial e recuperação,
mais falhas de detalhe e sugestão. Clicam em “Copiar diagnóstico” e verificam o payload recebido
no IPC de cópia (operação, tela e código reais); conferem repetição da leitura original e
**zero chamadas de mutação**. Typecheck, ESLint e Prettier focais e diff check passaram.

```powershell
rtk run node scripts/build-e2e.mjs
rtk corepack pnpm@11.24.0 exec playwright test tests/e2e/demand-errors.spec.ts --workers=1
rtk corepack pnpm@11.24.0 typecheck
rtk corepack pnpm@11.24.0 exec eslint src/renderer/features/demands/demand-manager.tsx src/core/contracts/diagnostics.ts tests/e2e/demand-errors.spec.ts
rtk corepack pnpm@11.24.0 exec prettier --check src/renderer/features/demands/demand-manager.tsx src/core/contracts/diagnostics.ts tests/e2e/demand-errors.spec.ts docs/development/phase-3-3b3.md
rtk git --no-pager diff --check
```

As suítes anteriores aprovadas não foram repetidas; o aviso preexistente de build permanece
não bloqueador. QA deve revalidar os dois achados, incluindo ausência de vazio falso durante
falha e sucesso vazio independente na outra seção. UX manual continua reservada ao fim da 3B.

### Segunda devolução QA — operações de todos os subsistemas da tela (2026-11-17)

Foi removida a operação padrão do executor `run`: todo callback agora exige um canal IPC
explícito dos contratos `demandChannels`, `campaignSignalChannels`, `entityChannels` ou
`eventChannels`. O mapa centralizado e tipado `demandScreenDiagnosticOperations`, no contrato
de diagnóstico, determina a operação usada tanto na apresentação do aviso quanto no payload
de cópia. O retry conserva o mesmo canal, callback e payload originais.

Inventário auditado de todos os caminhos assíncronos da tela:

| Canais IPC                                               | Operação de diagnóstico                                |
| -------------------------------------------------------- | ------------------------------------------------------ |
| `demands:list/get/suggestion/targets`                    | `demands.list/get/suggestion/targets`, respectivamente |
| `demands:accept/update/transform/transition`             | `demands.mutate`                                       |
| `campaign-signals:list`                                  | `signals.list`                                         |
| `campaign-signals:recalculate/dismiss/snooze/reactivate` | `signals.mutate`                                       |
| `entities:get`                                           | `entities.get`                                         |
| `events:get`                                             | `events.get`                                           |
| `events:update/archive/restore`                          | `events.mutate`                                        |

`entities.get` e `events.get` foram acrescentadas à allowlist Zod de diagnósticos; os nomes
agrupados de mutação existentes foram preservados. Os catches independentes das listas usam o
mesmo mapa. A falha do picker de alvos preserva agora o código original do backend e usa
`UserFacingErrorNotice`, diagnóstico `demands.targets` e seu retry de leitura, em vez de um
aviso booleano sem diagnóstico.

Arquivos desta devolução: `src/renderer/features/demands/demand-manager.tsx`,
`src/core/contracts/diagnostics.ts`, `tests/e2e/demand-errors.spec.ts`, novo
`tests/unit/demand-screen-diagnostics.test.ts` e este documento.
Não há nova migração, alteração de persistência ou de regras de domínio.

Evidências desta rodada:

- **19 novos testes unitários passaram**: inventário exato dos 18 canais suportados na tela,
  operação por subsistema e payloads de diagnóstico aceitos pelo schema.
- **10 novos E2Es passaram**, com Electron e ambos os diretórios isolados: recálculo,
  ignorar, adiar e reativar sinal; detalhe da entidade fonte e do Evento gerado; promoção,
  arquivamento e restauração de Evento; e falha do picker de alvos.
  Conferem a ação de copiar e seu payload real (tela/operação/código), o canal, IDs e argumentos
  repetidos no retry e ausência de mutações adicionais. Para ações de escrita, apenas o canal
  escolhido é simulado como falha inicial/sucesso no retry; os demais canais de escrita
  são sentinelas que devem permanecer sem chamadas.
- Primeira execução: seis E2Es passaram e os quatro de sinais pararam antes da operação por um
  seletor de teste incorreto (`Necessidade de Fonte` em vez de `Necessidade explícita: Fonte`).
  Após corrigir somente esse seletor, os quatro foram reexecutados e passaram. Os seis já
  bem-sucedidos não foram repetidos.
- Typecheck, ESLint e Prettier focais e `git diff --check` passaram.
  Os seis E2Es anteriores aprovados, os oito testes existentes de erros e as suítes de domínio
  não foram repetidos. Permanece somente o aviso preexistente não bloqueador do build.

```powershell
rtk corepack pnpm@11.24.0 exec vitest run tests/unit/demand-screen-diagnostics.test.ts
rtk run node scripts/build-e2e.mjs
rtk corepack pnpm@11.24.0 exec playwright test tests/e2e/demand-errors.spec.ts --grep 'QA transversal' --workers=1
rtk corepack pnpm@11.24.0 exec playwright test tests/e2e/demand-errors.spec.ts --grep 'QA transversal signals' --workers=1
rtk corepack pnpm@11.24.0 typecheck
rtk corepack pnpm@11.24.0 exec eslint src/core/contracts/diagnostics.ts src/renderer/features/demands/demand-manager.tsx tests/e2e/demand-errors.spec.ts tests/unit/demand-screen-diagnostics.test.ts
rtk corepack pnpm@11.24.0 exec prettier --check src/core/contracts/diagnostics.ts src/renderer/features/demands/demand-manager.tsx tests/e2e/demand-errors.spec.ts tests/unit/demand-screen-diagnostics.test.ts docs/development/phase-3-3b3.md
rtk git --no-pager diff --check
```

Revalidação independente final: o QA executou os 19 testes unitários de diagnóstico, 10 E2E focais,
8 testes de erros existentes, typecheck, ESLint, Prettier e `git diff --check`; todos passaram.
O QA confirmou o inventário de canais, operação real no diagnóstico copiado, retries sem mutação
adicional e contrato Zod restrito. Não repetiu as suítes de domínio aprovadas e não executou UX
manual. Assim, a 3B.3 está aprovada tecnicamente; a UX conjunta continua pendente para o final da 3B.

### Relação exata dos arquivos desta implementação

Novos:

- `src/core/contracts/demands.ts`
- `src/core/domain/demand.ts`
- `src/db/migrations/0029_demands.sql`
- `src/db/repositories/demand-repository.ts`
- `src/main/services/demand-service.ts`
- `src/main/ipc/demand-handlers.ts`
- `src/renderer/features/demands/demand-manager.tsx`
- `tests/unit/demand-contracts-and-domain.test.ts`
- `tests/unit/demand-gateway.test.ts`
- `tests/unit/demand-screen-diagnostics.test.ts`
- `tests/ipc/demand-handlers.test.ts`
- `tests/integration/demand-repository.test.ts`
- `tests/e2e/demands.spec.ts`
- `tests/e2e/demand-errors.spec.ts`
- `docs/development/phase-3-3b3.md`

Alterados, preservando as mudanças anteriores do worktree:

- `src/core/contracts/diagnostics.ts`
- `src/core/contracts/events.ts`
- `src/core/contracts/gateway.ts`
- `src/core/contracts/ipc-channels.ts`
- `src/core/errors/app-error.ts`
- `src/core/errors/user-facing-error.ts`
- `src/db/migrations/manifest.json`
- `src/db/migrations/registry.ts`
- `src/db/schema/index.ts`
- `src/db/repositories/event-repository.ts`
- `src/main/bootstrap/application.ts`
- `src/main/services/entity-service.ts`
- `src/main/services/entity-type-service.ts`
- `src/main/services/field-definition-service.ts`
- `src/main/services/event-service.ts`
- `src/preload/gateways/campaign-manager-gateway.ts`
- `src/renderer/app/campaign-app.tsx`
- `src/renderer/features/entities/entity-form.tsx`
- `src/renderer/features/sessions/event-manager.tsx`
- `tests/unit/preload-gateway.test.ts`
- `docs/architecture/overview.md`
- `docs/development/phase-3-preparation.md`
- `README.md`

Demais arquivos sujos de 3B.1/3B.2/3A.4 encontrados no início foram preservados sem edição por
esta atividade. Não houve commit, acesso ao banco do usuário ou alteração dos SQLs v1–28.

## Pontos para QA independente

1. Repetir conversão/transformação/resolução com resposta perdida e concorrência, sem duplicatas.
2. Conferir locks permanentes de Need, escopo compartilhado da definição, REPLACE e atributos
   independentes; tentar arquivar/reabrir/restaurar com entidades arquivadas.
3. Conferir pai/filhas, especialmente filha arquivada ainda pendente versus terminal.
4. Conferir Evento com N entidades deduplicadas, nenhuma Clock/Session como entidade, metadados
   iniciais, promoção explícita e imutabilidade por todos os caminhos existentes de edição.
5. Conferir upgrade seguro, backup, rollback e preservação do trabalho 3B.1/3B.2.
6. Conferir paginação, erros de segunda página, retries vinculados à operação e descarte assíncrono.

## UX manual — pendente para o final de toda a 3B

- [ ] Distinguir sugestão de Demanda aceita e consultar justificativa/fonte.
- [ ] Ignorar/adiar/reativar sinais sem criar Demanda.
- [ ] Revisar campos obrigatórios, urgência manual e vínculos por tipo/alvo/papel.
- [ ] Editar e percorrer estados, reabertura, arquivamento e restauração.
- [ ] Criar filha, navegar ao pai arquivado, encerrar filhas e resolver o pai manualmente.
- [ ] Cancelar/confirmar resolução e conferir conteúdo/imutabilidade/promoção do Evento.
- [ ] Entender orientação de Need protegido e editar atributos não relacionados.
- [ ] Conferir teclado/foco do diálogo, estados vazios, erros/retry, paginação e reinício.
