# Fase 3A.3 — Motor de Sinais determinístico

## Estado e dependências

Atividade aprovada tecnicamente pelo QA independente. A 3A.1 e a 3A.2 também receberam aprovação
técnica, sem aprovação de UX. Conforme orientação do responsável, a UX manual de todas as
atividades da 3A ocorrerá somente após a conclusão técnica da etapa 3A. A implementação 3A.4 é
documentada em [phase-3-3a4.md](phase-3-3a4.md) e aguarda QA; não houve início de 3B.

Esta atividade reutiliza `campaign_signals` e `signal_evidence` do schema 22. Não altera a migração
v22, não adiciona estrutura e não requer migração nem backup adicional. Banco novo e bancos já em
v22 utilizam as tabelas e as guardas existentes. O serviço/repositório permanecem no processo
principal; IPC e gateway tipados fazem a fronteira com a interface.

## Regra inicial executável

A versão `explicit-need-v1` detecta somente uma necessidade quando todos estes fatos estruturados
existem:

1. campanha ativa e entidade da campanha solicitada com `archived_at IS NULL`;
2. tipo da entidade e definição de campo não arquivados, com a definição associada ao tipo e
   `semantic_role = need` e
   `data_type` `short_text` ou `long_text`;
3. registro existente em `field_values` com `value_text` não nulo e texto não vazio após trim
   ECMAScript.

Cada par entidade/campo gera no máximo um sinal. O título identifica “Necessidade explícita” e o
nome da entidade; o resumo reproduz o conteúdo textual preenchido após trim, sem inferir se a necessidade foi
atendida, pendente, urgente ou se implica uma situação narrativa. A prioridade inicial é `high`
(Alta), e generator `deterministic`. A 3A.4 removeu score e severidade internos na migração v23;
consulte o mapeamento e o backup pré-migração em [phase-3-3a4.md](phase-3-3a4.md). Nenhum outro
tipo ou peso da tabela de sinais foi implementado.
Campos não textuais, objetivos, relações, eventos, intenções de sessão, relógios, consequências,
fios, pistas, demandas e contradições não são avaliados.

Tipos ou campos arquivados não geram nem atualizam detecções. Se forem arquivados depois que o
sinal já existe, o recálculo trata a condição como ausente: `new`/`viewed` tornam-se `stale`, e
decisões como `dismissed`/`snoozed` são preservadas. Ao restaurar o tipo ou campo, a mesma
identidade é detectada de novo e o estado narrador continua preservado.

O ID determinístico usa campanha, entidade e definição de campo, e não o texto nem a versão de
regra: editar o valor ou atualizá-lo por recálculo preserva a identidade e evita duplicatas. A
versão de regra é persistida como metadado. A consulta e as mutações sempre recebem `campaignId`;
IDs internos não são apresentados visualmente.

Cada sinal possui evidência `entity`, com papel explicando que se trata de necessidade explícita e
o rótulo do campo, além do nome legível da entidade e conteúdo preenchido. O resumo mantém o texto
completo trimado. Para satisfazer o limite de 2.000 pontos de código da evidência existente, a
descrição da evidência é truncada quando necessário; NUL é representado por `�` na apresentação do
resumo e da evidência. Esses tratamentos não alteram o valor estruturado de origem. A exclusão
da entidade remove a evidência pelas triggers existentes; a lista indica que a evidência original
foi removida.

## Recálculo, expiração e transições

- Uma detecção repetida não cria duplicata. Mudanças no texto atualizam resumo/evidência, `last_detected_at`
  e revisão, preservando a identidade e o estado escolhido pelo narrador.
- Ao desaparecer a condição, sinais `new` e `viewed` passam a `stale`. Os estados
  `dismissed`, `converted` e `resolved` são preservados. `snoozed` permanece até o prazo, mesmo se
  a necessidade desaparecer.
- Um sinal `stale` que volte a satisfazer a regra permanece `stale`; só evidência e última detecção
  são atualizadas. A revisão explícita (`reativar para revisão`) leva `stale`, `dismissed` ou
  `snoozed` para `viewed`; se a condição continuar ausente, o próximo recálculo torna-o `stale`
  novamente.
- O vencimento é processado ao consultar a lista ou recalcular: adiamento vencido com condição
  detectada passa a `new`; sem condição detectada passa a `stale`. Em ambos os casos o registro volta
  a aparecer para revisão e o prazo é limpo. Assim, uma necessidade que desapareceu não volta a ser
  afirmada como ativa: permanece visível como obsoleta, com evidência histórica quando o alvo ainda
  existe, e pode ser reativada explicitamente pelo narrador.
- `new` pode ser marcado `viewed`; `new`, `viewed` ou `stale` podem ser adiados com prazo futuro ou
  descartados; `snoozed` também pode ser descartado ou reativado explicitamente. Estados
  `converted` e `resolved` não têm ação de transição nesta entrega. As operações conferem
  `revision` em escrita condicional; conflitos não repetem automaticamente a ação.
- Recálculo e ações de revisão só aceitam campanhas `active`. A checagem existe no serviço e
  novamente nas transações de persistência para recálculo, expiração e atualização de estado.
  Campanhas `archived`/`deleted` continuam consultáveis pela listagem, conforme a política de
  leitura histórica; consultar não expira adiamentos nem modifica sinais nessas campanhas.
- O repositório inicia o recálculo com transação SQLite `BEGIN IMMEDIATE` (`better-sqlite3`:
  `.transaction(...).immediate()`) antes de consultar campanha, entidades, tipos, definições e
  valores; detecção, expiração, reconciliação, evidência e leitura de retorno pertencem à mesma
  transação. Isso serializa writers SQLite antes do snapshot de leitura, impedindo que arquivamento
  ou edição de uma fonte passe entre a consulta e a gravação. A consulta que pode expirar adiamentos
  usa igualmente leitura de fonte e expiração dentro de uma transação imediata. Em `SQLITE_BUSY` ou
  `SQLITE_LOCKED`, a transação é revertida e retorna `DATABASE_BUSY`; não há retry silencioso ou
  resultado parcial. A operação pode ser repetida explicitamente após o lock ser liberado.
- Não existe operação pública de expiração que receba um conjunto de IDs pré-detectados. O cálculo
  das detecções ocorre dentro de `listAndExpireSnoozes`/`recalculate`, sob a transação imediata; a
  função de gravação da expiração é privada e recebe somente o conjunto calculado nessa mesma
  transação. As APIs públicas do repositório não aceitam detecções ou IDs detectados do chamador.
- Nenhum recálculo ou vencimento cria Evento, transforma Intenção de Sessão, promove afirmação,
  escreve fato ou altera qualquer outro registro narrativo. A transformação manual/guiada de
  Intenção concluída em rascunho de Evento permanece adiada para 3C.

## Visibilidade e limite conhecido

O motor consulta campos e valores existentes no banco principal; `secret_by_default`, a visibilidade
da entidade e sua natureza de conhecimento não são um contexto de audiência ou autorização. A tela
de sinais é uma superfície do gerenciador local para o narrador (GM), e não há renderer de jogador
nem contrato que informe uma audiência a filtrar. A evidência secreta permanece limitada a consultas
da campanha proprietária, como ocorre com os demais dados narrativos consultados por campanha.
Foi acrescentado teste de `secret_by_default=1`, entidade `knowledge_state='secret'`/`visibility='gm'`
e isolamento entre campanhas.

**Bloqueio explícito para qualquer superfície futura voltada a jogadores:** a especificação e os
contratos atuais não definem como combinar segredo padrão de campo, visibilidade da entidade e
visibilidade da necessidade/evidência, nem qual política de redação usar. Não foi inventado filtro
ou alterada a regra de detecção. Até haver decisão de produto e audiência autenticada, esta superfície
deve permanecer restrita ao narrador; QA pode validar que dados secretos não cruzam campanhas, mas
não deve interpretar isso como política de renderização para jogadores.

O vencimento é uma transição de estado do próprio sinal e pode ocorrer durante a consulta, sem
depender de botão de recálculo. A interface lista os sinais e oferece recálculo manual, revisão,
adiamento com prazo informado, descarte e reativação explícita. Não há painel “Mundo em Movimento”
(3B.4), Demandas, botão inoperante de conversão, nem ação de conversão automática.

## Arquivos da entrega

- Contratos: `src/core/contracts/campaign-signal-engine.ts`,
  `src/core/contracts/ipc-channels.ts`, `src/core/contracts/gateway.ts` e
  `src/core/contracts/diagnostics.ts`.
- Motor/serviço/persistência: `src/main/services/campaign-signal-engine.ts`,
  `src/main/services/campaign-signal-service.ts` e
  `src/db/repositories/campaign-signal-repository.ts`.
- IPC/composição/gateway: `src/main/ipc/campaign-signal-handlers.ts`,
  `src/main/bootstrap/application.ts` e `src/preload/gateways/campaign-manager-gateway.ts`.
- Interface: `src/renderer/features/signals/signal-manager.tsx` e
  `src/renderer/app/campaign-app.tsx`.
- Erros, testes e documentação: `src/core/errors/user-facing-error.ts`,
  arquivos focais `tests/{unit,ipc,integration}/campaign-signal-*` e esta documentação, além da
  atualização do plano e da arquitetura.

## Registro da validação técnica da 3A.3

Verificações direcionadas após as correções:

- `rtk .\node_modules\.bin\vitest.cmd run tests/unit/campaign-signal-service.test.ts` — 1 arquivo,
  5 testes aprovados;
- `rtk .\node_modules\.bin\vitest.cmd run --config vitest.integration.config.mts tests/integration/campaign-signal-engine.test.ts`
  — 1 arquivo, 13 testes SQLite aprovados, incluindo conexões reais, contenção de lock, retry
  explícito, tentativa de arquivamento controlada após leitura e matriz de estados;
- ESLint direcionado aos arquivos TS/TSX reabertos — aprovado;
- `rtk .\node_modules\.bin\tsc.cmd --noEmit` — aprovado;
- Prettier `--check` direcionado aos arquivos reabertos — aprovado;
- `rtk git diff --check` — aprovado; a migração v22 não foi alterada.

Os seletores focais de integração incluem `usa bloqueio real entre conexões`, `expira para stale
quando outra conexão arquiva a fonte antes do prazo do adiamento` e `preserva identidade, estado,
prazo, revisão e evidência na matriz de arquivamento/restauração`. A antiga prova com
microtasks/`Promise.all` foi removida; ela não demonstrava concorrência real.

As suítes aprovadas da 3A.1/3A.2, os arquivos unitários/IPC não reabertos, e as suítes globais/E2E
não serão repetidos sem necessidade. O relato anterior de `EBUSY` permanece inconclusivo e não é
tratado como aprovação ou falha reproduzida.

### Verificar pelo QA

- detecção estrita de `need` textual, trim, prioridade Alta, identidade determinística e
  isolamento de campanha;
- bloqueio de recálculo/ações em campanhas arquivadas e na lixeira, tanto no serviço quanto na
  persistência/IPC, verificando que nenhum dado é alterado; leitura histórica sem expiração;
- tipos/campos arquivados e restaurados, com identidade e decisão preservadas;
- recálculo repetido, atualização de texto/evidência e remoção de evidência quando a entidade é
  excluída;
- desaparecimento e retorno da necessidade, preservação de descartado/adiado, vencimento com e sem
  condição presente, e conflito de revisão concorrente;
- validação de contratos IPC e isolamento do remetente, gateway sem API bruta e ausência de IDs
  técnicos na interface;
- confirmar que nenhum Evento, fato, demanda ou decisão narrativa é produzido pelo motor;
- rollback completo após falha induzida, contenção de lock de duas conexões, atualização de fonte
  intercalada, revisão otimista e retomada do mesmo banco após reabertura;
- campo secreto limitado ao escopo narrador e isolamento por campanha; a política para eventual
  visualização de jogador continua bloqueada por falta de decisão de produto;
- comportamento das ações exibidas na interface, erros, estados vazio/carregamento e retry.

### Checklist manual de UX diferido

O teste manual ocorrerá ao final de toda a etapa 3A; nenhum item está aprovado:

- legibilidade da explicação e proveniência da necessidade;
- compreensão dos estados Novo, Revisado, Adiado, Descartado e Condição não detectada;
- compreensão de que recálculo sugere/atualiza sinais, sem criar cânone ou Evento;
- uso de prazo futuro, vencimento, reativação explícita e conflito de revisão;
- foco, teclado, contraste, estados vazio/erro/carregamento e mensagens de recuperação.
