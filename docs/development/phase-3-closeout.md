# Relatório de fechamento técnico da Fase 3

Estado: implementação da 3C.3 entregue ao QA; não é aprovação própria.

## Escopo revisado

Foram lidos os relatórios de 3A (`phase-3-3a1.md` a `phase-3-3a4.md`), 3B
(`phase-3-3b1.md` a `phase-3-3b4.md` e `manual-ux-feedback-3b.md`), 3C
(`phase-3-3c2.md`) e `phase-3-preparation.md`. A revisão ficou limitada à integração da Fase 3;
3C.1 e 3C.2 não foram reabertas e a Fase 4 não foi iniciada.

## Alterações 3C.3

- Adicionado `tests/e2e/phase-3c.spec.ts`, cobrindo no mesmo fluxo a criação de campanha, sessão,
  fio aberto, encerramento incremental, seleção explícita para a próxima sessão e criação/consulta
  do mapa causal.
- Corrigido `causality-manager.tsx` para que a criação use a raiz recém-informada na recarga e para
  que as mensagens de sucesso de criação/edição não sejam apagadas pela própria recarga.
- Corrigido `tests/e2e/phase-3c.spec.ts` após devolução do QA: a criação causal agora é escopada ao
  formulário acessível, verifica exatamente três comboboxes e usa campos/botão com nomes acessíveis
  exatos, eliminando a ambiguidade de strict mode sem reduzir as asserções do fluxo.
- Corrigidos os bloqueios de lint da integração: uso deprecated de `z.number().finite()` removido
  conforme Zod 4, normalização da galeria de imagens ajustada e `package-native-smoke.cjs` confirmado
  como script rastreado existente, com exclusão limitada ao arquivo CommonJS fora do projeto TypeScript.
- Atualizados `phase-3-preparation.md` e este relatório.

As estruturas da 3C.1/3C.2 continuam usando contratos Zod, IPC/gateway, isolamento por campanha,
revisão otimista, migrações aditivas e execução no processo principal. O encerramento de sinais
continua recálculo determinístico antes da confirmação; a preparação permanece seleção explícita,
sem IA/rede e sem alteração automática de cânone.

## Verificações

- `node scripts\build-e2e.mjs`: passou.
- `pnpm typecheck`: passou.
- `git diff --check`: passou; apenas avisos normais de conversão LF/CRLF foram emitidos pelo Git.
- Lint direcionado dos arquivos corrigidos: passou.
- `package`: passou.
- `test:package`: passou (`startup=ok`, schema 36, SQLite e FTS5 validados).
- `verify`: permanece bloqueado por erro preexistente fora da 3C.3 em
  `src/db/repositories/image-field-value-repository.ts:121` (`prefer-nullish-coalescing`). Esse arquivo
  não foi alterado para preservar o escopo autorizado.
- Após a correção desse erro, o lint global do `verify` passou. A execução avançou até
  `prettier --check .`, que falhou com 313 arquivos preexistentes fora do padrão de formatação;
  nenhuma formatação global foi aplicada nesta entrega.
- Foram corrigidos os seis achados funcionais observados no verify: expectativa do preload para
  `causality`/`sessionClosing`, fixture de entidade da conversão IPC, tradução do erro de preview de
  capa, mensagem pública de Need e tokens/classes semânticos do `clock-manager`. O teste Vitest
  direcionado permaneceu bloqueado antes da coleta por `spawn EPERM` no Vite/Rolldown.
- Na rodada de integração final, foram ajustados harnesses de migração para usar
  `latestMigrationVersion` nas verificações do schema atual, registrar
  `structured_json_to_rich_text` em bancos legados, corrigir os parâmetros do fixture de sessão e
  alinhar a mensagem do trigger de capa. A suíte elevada reproduziu 24 falhas em 12 arquivos antes
  dessas correções; a rerodada pós-correção foi interrompida por duração, portanto a quantidade
  residual ainda não foi determinada.
- Testes Vitest direcionados de causalidade e encerramento: inconclusivos. O processo falhou antes
  da coleta ao carregar `vitest.config.mts`, com `Error: Build failed with 1 error` e
  `[plugin externalize-deps] Error: spawn EPERM` no Vite/Rolldown.
- `build-e2e` e E2E direcionado `tests/e2e/phase-3c.spec.ts`: bloqueados por `spawn EPERM` no Vite/Rolldown
  ao carregar `vite.preload.config.mts` e também ao criar o worker do Playwright (`WorkerHost.startRunner`).
  A falha de strict mode não reapareceu, mas o fluxo permanece inconclusivo e pendente de execução independente pelo QA.
- `pnpm verify`, `pnpm test:e2e`, `pnpm package` e `pnpm test:package`: permanecem pendentes nesta
  entrega quando a execução excede a janela segura ou depende da coleta Vitest; não são tratados
  como aprovados.

## Banco, isolamento e preservação

As migrações v35/v36 e seus testes de integração existentes cobrem a cadeia aditiva, banco vazio,
upgrade, isolamento SQL e preservação de referências históricas conforme os relatórios 3C.1/3C.2.
Como a coleta Vitest foi bloqueada por `spawn EPERM`, essa cobertura deve ser reexecutada e
confirmada pelo QA. Não foi introduzida alteração de schema nesta 3C.3.

## Checklist único de UX manual — responsável pelo projeto

- [ ] Abrir uma sessão e confirmar uma etapa individual; recarregar e verificar que ela permanece confirmada.
- [ ] Interromper/retomar o encerramento e confirmar que etapas anteriores não desaparecem.
- [ ] Usar encerramento rápido e conferir estados de todas as etapas.
- [ ] Forçar/observar erro recuperável no recálculo de Sinais e confirmar ausência de falso sucesso.
- [ ] Selecionar elementos da preparação da próxima sessão e verificar que nada altera o cânone automaticamente.
- [ ] Abrir Mapa causal, criar vínculo, consultar cadeia, editar descrição e validar estados vazio/erro/recuperação.
- [ ] Confirmar que registros arquivados mantêm histórico e que campanhas diferentes não se misturam.
- [ ] Repetir o fluxo sem IA e sem rede.

Este checklist está pendente e não foi aprovado pelo implementador.
