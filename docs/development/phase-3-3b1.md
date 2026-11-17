# Fase 3B.1 — Fios Abertos

## Escopo e aprovação de produto

Implementação limitada à 3B.1, conforme §§32 e 39 e DoD do adendo 03 v2. O responsável autorizou
explicitamente:

- alvos existentes: Entidades, Relações, Afirmações, Notas, Eventos e Sessões; não inclui Relógios,
  Demandas nem tipos futuros;
- vínculos existentes são preservados quando um alvo é arquivado; vínculos novos a alvos
  arquivados são recusados. Sessões têm status próprio e conclusão não equivale a arquivamento;
- exclusão de alvo vinculado é restrita até a remoção explícita do vínculo, inclusive contra
  substituição (`REPLACE`) no SQLite;
- `resolved` e `abandoned` podem ser reabertos explicitamente para `open`; arquivar preserva o
  estado anterior, que é restaurado ao desarquivar;
- origem manual ou por Sessão e transições específicas do fio registram instante, estado anterior e
  novo, com motivo e Sessão opcionais. A Sessão deve existir na mesma campanha.

Não há transições automáticas, alteração de cânone, IA, rede ou detecção de sinais nova. A exclusão
física de campanha não é uma operação suportada nesta entrega; as FKs do agregado são declaradas
com cascata para o ciclo de vida da campanha, mas a imutabilidade do histórico pode bloquear uma
cascata física no SQLite. Se essa operação vier a ser introduzida, sua política e interação com a
proveniência precisarão ser deliberadas antes de expô-la.

## Persistência e consistência

A versão 24 é uma migração aditiva posterior ao schema 23; os SQLs e checksums anteriores não foram
alterados. Cria `story_threads`, `story_thread_links` e `story_thread_transitions`, com constraints,
índices, chaves estrangeiras `ON DELETE RESTRICT` por tipo de alvo, e triggers SQLite para conferir
campanha do fio, existência/campanha do alvo, arquivamento de alvos novos e Sessão de origem. A
substituição de vínculos mantém as linhas existentes que ainda fazem parte do conjunto, inclusive
alvos arquivados, em vez de apagá-las e recriá-las. Tabelas do agregado pertencem à campanha e as
escritas compostas são transacionadas com `IMMEDIATE`.

Fios usam revisão otimista. Criação e transição de estado gravam a linha e sua proveniência na
mesma transação. O histórico é somente anexável, possui sequência para ordenação determinística e
não é um histórico geral de domínio. O arquivamento usa `status_before_archive`; a reabertura
explícita de Resolvido/Abandonado tem destino Aberto. Substituir a lista de vínculos verifica
alvos novos contra arquivamento, mas não rejeita vínculos idênticos já existentes apenas por o
alvo ter sido arquivado. A remoção de vínculo é explícita.

A navegação existente da campanha é protegida para campanhas que não estejam ativas, no serviço e
dentro da transação do repositório. O renderer usa gateway IPC validado; os candidatos e fios são
paginados. Sessões usadas na origem/proveniência são carregadas por todas as páginas, com erro e
tentativa novamente explícitos, para que registros posteriores à primeira página também possam ser
selecionados. IDs permanecem internos e não são apresentados na interface.

Escolhas de preservação: origem e contexto inicial são definidos na criação e não podem ser
reescritos na edição; as Sessões usadas como origem ou proveniência de transição também ficam
protegidas por FK `RESTRICT`, além da restrição aplicável quando uma Sessão é alvo de vínculo.
Alterar esses registros de proveniência exigiria uma decisão explícita, não uma correção silenciosa.

## Estado da validação

**APROVADA PARA UX MANUAL pelo QA independente após revalidação das correções.** O mesmo QA
confirmou a resolução dos quatro achados anteriores, sem novos problemas no escopo avaliado.
Por decisão do responsável em 2026-11-16, os testes manuais de UX de toda a etapa 3B serão realizados
pelo usuário ao final da etapa. Assim, a UX 3B.1 permanece pendente legitimamente e nenhum item
abaixo está aprovado; não solicitar nem alegar UX intermediária.

### Devolução do QA e correções focais

- **Sessões:** o carregamento agora consome cursores sucessivos até o fim, mantém estado de
  carregamento e apresenta erro recuperável; o retry reinicia a carga completa. Uma requisição
  obsoleta não substitui sessões após trocar de campanha ou sair da tela. A E2E usa 101 Sessões e
  seleciona a primeira sequência (na página seguinte) como origem e proveniência de transição.
- **Retry de detalhe:** uma falha de `get` guarda o fio solicitado; “Tentar novamente” executa
  novamente `get` para esse mesmo ID. Não recorre a `save` quando não há detalhe selecionado.
  E2E injeta falha controlada, compara as duas entradas `get` e confirma zero chamadas de criação
  ou edição.
- **Rótulo de Relação:** detalhes agora usam o mesmo padrão de fallback dos candidatos:
  entidade de origem — tipo de relação — entidade de destino. Integração SQLite verifica duas
  relações sem descrição com rótulos distintos, sem UUID.
- **Paginação de fios:** integração adicional percorre páginas sucessivas e confirma total,
  ausência de duplicatas/perdas e rejeição de cursor em outra campanha.

Verificações direcionadas após as correções:

- typecheck passou;
- unitários de carga paginada de Sessões e despacho de retry: 2 passaram;
- integração SQLite filtrada para paginação de fios e rótulos de Relações: 2 passaram (6 testes
  aprovados anteriormente no mesmo arquivo foram ignorados);
- E2E focal em perfil temporário: 2 passaram, com 101 Sessões, seleção na segunda página nos dois
  campos e falha/retry de `get` sem criação/edição;
- ESLint direcionado, Prettier e `git diff --check` passaram.

Na revalidação independente, o QA confirmou 2 testes unitários, 2 de integração filtrados e
2 E2E focais aprovados. Também executou E2E adicional isolado para carregamento visível,
falha na segunda página, resposta `ok: false`, exceção IPC, recuperação e descarte de resposta
obsoleta ao sair da tela. Typecheck, ESLint, Prettier direcionados e `git diff --check` passaram.
Não foram executadas suítes amplas nem UX manual.

As suítes aprovadas em arquivos inalterados não foram repetidas; UX continua pendente.

- [ ] Abrir Fios Abertos numa campanha ativa, consultar fios e estados vazios/carregamento/erro;
- [ ] Criar fio com cada tipo disponível, origem manual ou Sessão e contexto opcional;
- [ ] Editar título, descrição, tipo e vínculos; paginar candidatos e lista de fios;
- [ ] Vincular alvos dos seis tipos permitidos e confirmar rótulos legíveis sem UUID;
- [ ] Conferir que Sessão concluída continua elegível, enquanto alvos realmente arquivados não são
      candidatos a novos vínculos; vínculo histórico permanece na edição;
- [ ] Resolver, abandonar, reabrir explicitamente para Aberto, arquivar e restaurar o estado de
      retorno; conferir motivos, Sessão e histórico do fio;
- [ ] Conferir mensagens de falha/concorrência e recuperar por nova tentativa sem sucesso falso;
- [ ] Alternar campanha/tela durante consulta e confirmar ausência de conteúdo pendente/vazamento.

A revisão técnica inicial do QA cobriu upgrades de banco v23 e banco vazio, backup, FKs e cascatas/restrições,
campanhas não ativas, alvos cross-campaign, alvos arquivados, `DELETE`/`REPLACE`, transação
abortada, revisão otimista, proveniência (inclusive Sessões referenciadas fora de vínculos) e
paginação/cursor. A 3B.2 é uma atividade separada; esta entrega não altera seu escopo nem inicia
3B.3, 3B.4 ou 3C.
