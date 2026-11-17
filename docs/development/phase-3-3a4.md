# Fase 3A.4 — Possíveis Contradições

## Estado e dependências

**Fechamento confirmado pelo responsável em 2026-11-16:** as subtarefas 3A.1–3A.4 receberam
aprovação técnica do QA, e o usuário confirmou que todos os testes manuais de UX da etapa 3A
passaram. A validação manual foi realizada pelo usuário, não pelo implementador; este registro
documental não representa aprovação própria nem substitui a validação independente do QA.

Nas rodadas anteriores ao fechamento, o QA devolveu uma versão da implementação por navegação
genérica em Revisar/Corrigir; o fluxo contextual recebeu correções após esse retorno. O registro
abaixo preserva os estados e evidências dessas rodadas, não o estado atual. A confirmação de
conclusão acima prevalece sobre referências históricas a validações pendentes. Esta entrega
documental não inicia outras atividades.

Na segunda revalidação, o QA confirmou o par real, seleção/edição de ambos os alvos, histórico
e guardas contextuais; devolveu somente proveniência ausente na apresentação e falta de prova
runtime com terceira evidência válida. Esses dois pontos foram tratados nas rodadas subsequentes.

Na rodada focal seguinte, o QA reproduziu fonte manual compartilhada entre campanhas e
divergência entre a sessão da fonte e da captura na mesma campanha. A publicação contextual foi
endurecida para esses dois casos. Nenhuma migração, escrita corretiva automática, funcionalidade
da Fase 2.1 ou etapa 3B foi implementada naquela correção.

## Regra inicial, determinística e limitada

A versão `potential-contradiction-v1` só gera um aviso quando há, na mesma campanha, duas
afirmações distintas com:

- o mesmo `subjectEntityId`;
- `canonState = accepted` em ambas e nenhuma arquivada;
- uma `knowledgeState = fact` e outra `knowledgeState = disproved`;
- conteúdo estrutural igual em `predicate`, `objectEntityId`, `value` e `statement`.

O aviso é “Possível contradição”; não identifica qual afirmação está errada, não altera os textos,
estados de conhecimento ou canonicidade e não promove/rejeita nada. Diferenças textuais não são
interpretadas semanticamente. Rumores, suspeitas, rascunhos, registros arquivados, sujeitos
diferentes e campanhas diferentes não são combinados. Locais incompatíveis, datas, relações,
duplicidades prováveis ou outras classes do §34.2 não são detectadas nesta regra.

### Comparação estrutural conservadora

- IDs de sujeito/objeto e `predicate`/`statement` são comparados exatamente; texto não sofre
  lowercasing, trim adicional, normalização Unicode ou aproximação.
- Os quatro campos de conteúdo são comparados em conjunto, inclusive `null`; não basta uma
  declaração parecida.
- Para `value`, tipos escalares devem ser iguais; arrays mantêm a ordem; propriedades de objetos
  JSON são comparadas estruturalmente sem considerar ordem de chaves. A API atual representa tanto
  coluna ausente quanto JSON `null` como `null`; portanto essa distinção de armazenamento não pode
  ser usada para diferenciar conteúdo.
- O modelo não contém snapshot de nomes como identidade semântica: `objectEntityId` é comparado
  como a referência persistida. Nomes de entidades são apresentados apenas como contexto legível.

Isso intencionalmente deixa de detectar frases diferentes que talvez tenham o mesmo significado.
Também não detecta contradição semântica em conteúdos estruturalmente diferentes. Não há IA, rede,
inferência linguística ou escrita automática no cânone.

O sinal tem ID determinístico por campanha e par ordenado de IDs de afirmação, prioridade `high`
(Alta), e duas evidências `assertion` reais, com papel e texto legível. O gateway/IPC mantém
validação Zod e escopo explícito de campanha; a interface não mostra UUID. Nenhum resultado “sem
conflitos” é inferido antes de o usuário acionar o recálculo. Falha de listagem/recálculo continua
distinta de lista vazia.

## Ações da revisão

As ações seguem a intenção do §34.3 e usam operações existentes:

- **Revisar** abre um contexto dedicado com as duas afirmações reais do par.
- **Corrigir** abre o mesmo par e solicita escolha explícita entre a afirmação marcada como fato
  e a marcada como refutada. Cada botão abre o formulário existente “Editar afirmação” para o alvo
  escolhido, com sua revisão otimista. Não há escolha automática, mudança de cânone ao navegar
  nem editor paralelo. Cancelar/voltar retorna ao par; o histórico e Alt+setas preservam o alvo.
  O Registro de Cânone normal mantém seus filtros e comportamento.
- **Manter** usa a transição de revisão do sinal; mantém intactas as duas afirmações.
- **Marcar exceção** registra a decisão para aquele par exato e conclui o sinal sem alterar as
  afirmações.
- **Descartar aviso** usa o descarte existente do sinal; não arquiva nem descarta afirmações.

“Manter” e “Descartar aviso” não criam exceção persistente: o primeiro registra revisão e o
segundo descarta apenas o sinal. O cálculo determinístico pode reencontrar o aviso conforme as
transições existentes do motor.

### Correção solicitada pelo QA — contexto do par

O contrato anterior da listagem só oferecia descrições, sem identidades de afirmações. A consulta
aditiva `campaign-signals:get-contradiction-review`, validada por Zod, resolve o par exclusivamente
no processo principal sob transação `IMMEDIATE`: exige campanha ativa, sinal/revisão atuais,
duas evidências reais e correspondência à regra existente. Retorna as afirmações da campanha e
nomes legíveis, sem expor IDs na apresentação. Não altera migrações nem a regra de domínio.

A escolha revalida o par e a revisão da afirmação antes de abrir o formulário. Evidência ausente,
afirmação/sinal removidos, afirmação arquivada, par desatualizado e falhas de consulta impedem
a abertura e exibem feedback com retorno aos sinais. Após salvar uma correção que desfaz o par,
o retorno não fabrica um par válido: pede atualização dos sinais. O formulário continua usando
as validações e a atualização otimista existentes; alterações concorrentes exigem nova revisão.

Cada afirmação contextual agora mostra **Origem**, **Fonte** e **Sessão**, com labels e helpers
do Registro de Cânone. A consulta reutiliza `AssertionRepository.findSourceContext` e valida a
origem, o escopo de todas as associações e a correspondência fonte/captura antes de publicar descrição
ou título. Fontes não têm uma coluna de campanha própria: o isolamento usa os vínculos persistidos
descritos abaixo, além da consulta reutilizada do Registro. Fonte/sessão alheia ou captura vinculada indisponível falham explicitamente;
não devolvem metadados alheios. A consulta permanece na transação `IMMEDIATE`.

O contrato conserva `sourceState` e seu label de indisponibilidade por compatibilidade, mas a
consulta agora **recusa fonte vinculada ausente** com erro, sem resultado parcial nem `data`.
Sem fonte é mostrado “Sem fonte vinculada”; descrição nula em fonte cujo escopo foi validado
é marcada indisponível, não preenchida por suposição. Para origem de sessão, título ausente é
explicitado; nas demais origens, sessão é “Não se aplica”. Capturas usam a descrição persistida
da conversão (texto original), nunca conteúdo inferido. UUIDs de fonte/sessão não são apresentados.
Não houve mudança em migrações, regra de contradição ou canonicidade nesta segunda devolução.

### Garantias e limites efetivos de escopo da proveniência contextual

- `entities`, `assertions`, `relationships`, `notes` e `events` são todas as tabelas narrativas
  atuais com `source_id`; registros arquivados também contam como associação.
- Os cinco registros `inbox_*_conversions` também referenciam fontes. São verificados tanto a
  campanha da captura quanto a do alvo da conversão, mesmo se o alvo não tiver mais `source_id`.
  A sessão e a captura diretamente vinculadas em `sources` também entram na verificação.
- Todas essas associações são lidas em uma consulta parametrizada dentro da mesma transação
  `IMMEDIATE` do sinal/par. Nenhuma associação pode ter campanha nula/indisponível ou diferente da
  solicitada; a presença do vínculo da afirmação atual fornece a associação positiva. Não basta
  encontrar uma associação local ignorando as outras.
- Fonte inexistente ou vínculo não resolvível gera `ASSERTION_SOURCE_SCOPE_UNVERIFIABLE`.
  Fonte compartilhada entre campanhas gera `ASSERTION_SOURCE_CAMPAIGN_MISMATCH`. O handler
  retorna `ok: false`, sem `data`, mesmo se a descrição da fonte for nula. Não se tenta “resolver”
  o conflito apagando vínculos, alterando cânone ou ocultando descrição com sucesso.
- Para captura vinculada, `sources.kind`, origem da afirmação e `inbox_items.origin_kind`
  precisam coincidir. `sources.session_id` deve ser exatamente igual a `inbox_items.session_id`.
  Manual exige ambos nulos; sessão exige ambos presentes e iguais, da campanha validada.
  Divergência, inclusive entre duas sessões da mesma campanha, gera
  `ASSERTION_SOURCE_CAPTURE_MISMATCH`, sem publicar título/descrição.
- **Limitação:** isto comprova o escopo das associações atuais, não propriedade histórica.
  O modelo não registra dono/criador de fonte manual. Uma fonte manual ligada somente a registros
  da mesma campanha funciona; uma fonte compartilhada não funciona. Não se deduz posse pelo texto,
  pela primeira referência ou pelo ID. Propriedade histórica exigiria decisão/modelo adicionais,
  não implementados. Identificadores opacos de documento/importação/regras etc não fornecem
  evidência adicional de campanha no schema atual. Novas tabelas que venham a referenciar fontes
  exigirão inclusão explícita na auditoria de associações.
- O Registro de Cânone/Fase 2.1 não foi reimplementado nem teve sua política de leitura alterada;
  estas garantias são da publicação do par contextual.

## Exceções e conteúdo relevante

A exceção é persistida em `potential_contradiction_exceptions`, isolada por campanha e vinculada
ao par real de afirmações e ao sinal. Permanece válida enquanto não mudar nenhum campo que define
elegibilidade/conteúdo da regra: `subject_entity_id`, `predicate`, `object_entity_id`, `value_json`,
`statement`, `canon_state`, `knowledge_state` ou `archived_at`. Mudança real em qualquer um deles,
inclusive arquivar/restaurar ou mudar o estado de conhecimento/canônico, apaga a exceção e marca o
sinal antigo como obsoleto; uma reversão posterior não restaura a escolha removida. Se o par voltar
a corresponder à regra, o sinal é reaberto como novo para revisão; o recálculo não restaura a
exceção.

Proveniência (`origin_kind`, fonte, sessão), visibilidade, nomes de entidades, timestamps e revisão
otimista não alteram a comparação nem invalidam a exceção. O JSON é comparado estruturalmente para
a detecção; qualquer edição persistida em `value_json` é tratada pelo gatilho como alteração
relevante e invalida conservadoramente a exceção. Os gatilhos executam no mesmo commit da alteração
da afirmação, inclusive entre recálculos concorrentes. Pares não relacionados mantêm suas escolhas.

O banco impõe referências e guardas de campanha. Marcar exceção relê as afirmações e grava a decisão
sob `BEGIN IMMEDIATE`, valida revisão e campanha ativa; ações em campanhas arquivadas/na lixeira
seguem as guardas existentes do motor. Evidências de afirmações são limpas pelas guardas existentes
quando a origem é removida.

## Prioridade e migração

A pontuação numérica e a severidade foram removidas do domínio, contratos, persistência e UI. A
prioridade é um único enum, com ordenação explícita e rótulos: `low` = Baixa, `medium` = Média,
`high` = Alta, `very_high` = Altíssima. `explicit_need` permanece Alta e `potential_contradiction`
começa Alta, sem criar pesos novos.

A migração aditiva **23** substitui as colunas provisórias de score/severidade por `priority`:

|    Score v22 | Prioridade v23 |
| -----------: | -------------- |
|  menor que 0 | Baixa          |
|            0 | Baixa          |
|            1 | Média          |
|            2 | Alta           |
|        3 a 5 | Altíssima      |
| menor que -5 | Baixa          |
|  maior que 5 | Altíssima      |

Para `explicit_need`, qualquer score legado, inclusive +5 e fora da faixa, mapeia para Alta,
conforme decisão do responsável. Para os demais tipos, o mapeamento usa o score e não a severidade
legada. Os valores numéricos e a severidade deixam de existir no banco v23; o backup pré-migração
verificado preserva o banco v22 original, incluindo esses valores. A migração v22 não foi editada
nem teve seu checksum alterado. O runner desativa FKs apenas durante a substituição transacional,
restaura a configuração e executa `foreign_key_check`; erro reverte a migração. Banco vazio, upgrade,
backup íntegro e rollback são cobertos por integração.

## Testes e validações executadas

- `pnpm exec vitest run ...` em testes unitários de domínio/contrato, serviço, gateway, IPC e UI.
- `pnpm exec vitest run --config vitest.integration.config.mts ...` em motor SQLite, estrutura v23,
  migração/backup/rollback e evidências Unicode.
- `pnpm typecheck`.

Naquele registro, os comandos exatos e resultados da entrega eram encaminhados ao QA para repetição
independente, e a UX ainda estava pendente. Esse estado é histórico; o fechamento confirmado pelo
responsável em 2026-11-16 está registrado no início deste documento.

### Validação direcionada da devolução do QA

Comandos prefixados por `rtk` e executados com `corepack pnpm@11.24.0`:

- `exec vitest run tests/unit/campaign-signal-service.test.ts -t 'consulta contextual'`:
  1 teste passou; os outros 6 não foram repetidos.
- `exec vitest run tests/ipc/campaign-signal-handlers.test.ts
tests/unit/campaign-signal-preload-gateway.test.ts tests/unit/campaign-signal-manager-ui.test.tsx`:
  8 testes passaram nos arquivos diretamente ligados ao novo canal/fluxo.
- `exec vitest run --config vitest.integration.config.mts
tests/integration/campaign-signal-engine.test.ts -t 'consulta contextual'`:
  1 teste novo de resolução do par passou; os 17 testes aprovados anteriormente não foram repetidos.
- `rtk node scripts/build-e2e.mjs`, seguido de `exec playwright test
tests/e2e/contradiction-review.spec.ts`: testes automatizados de ambos os alvos, histórico,
  cancelamento/reentrada, falha de consulta, arquivo entre visualização/escolha e troca de campanha.
  4 testes passaram. Não são validação manual nem aprovação de UX.
- `typecheck`, ESLint e Prettier direcionados, além de `rtk git diff --check`.

Nenhuma suíte global, migração aprovada ou fluxo de domínio inalterado foi repetido para esta
devolução. Build apresenta aviso de depreciação de `inlineDynamicImports` já existente.

### Segunda devolução — proveniência e terceira evidência

Validações direcionadas: novo `tests/unit/contradiction-provenance-ui.test.tsx`, somente o caso
“consulta contextual” no arquivo IPC alterado, somente “consulta contextual”/“proveniência
contextual” na integração do motor e somente “proveniência contextual” no E2E.
Os demais testes previamente aprovados, migrações e suítes globais não são repetidos.

A integração cria fonte de sessão e conversão real de captura, verifica ausência de fonte,
descrição nula, fonte ausente, origem incompatível, sessão/captura alheias e falha de consulta.
Além disso insere uma terceira evidência válida, confirma o erro explícito e restaura duas
evidências para demonstrar recuperação. UI/E2E conferem labels e ausência de UUID.

Resultados finais desta segunda devolução (todos os comandos via `rtk`):

- `corepack pnpm@11.24.0 exec vitest run tests/unit/contradiction-provenance-ui.test.tsx
tests/ipc/campaign-signal-handlers.test.ts -t 'proveniência|consulta contextual'`:
  4 testes passaram; os 2 casos IPC inalterados foram ignorados.
- `corepack pnpm@11.24.0 exec vitest run --config vitest.integration.config.mts
tests/integration/campaign-signal-engine.test.ts -t 'consulta contextual|proveniência contextual'`:
  2 testes passaram; os outros 17 foram ignorados.
- `node scripts/build-e2e.mjs` e `corepack pnpm@11.24.0 exec playwright test
tests/e2e/contradiction-review.spec.ts -g 'proveniência contextual'`:
  1 teste novo passou; os 4 fluxos já aprovados não foram repetidos.
- `typecheck`, ESLint/Prettier nos arquivos alterados e `git diff --check`: sem erros finais.

### Rodada focal — fontes compartilhadas e captura divergente

Arquivos desta correção: repositórios de sinais/afirmações, apresentação dos erros, integração
do motor, testes seletivos de mensagens e este documento. Nenhuma migração ou contrato IPC foi
alterado. O repositório de afirmações apenas expõe também origem/sessão da captura na consulta
reutilizada; sua política de escrita e os fluxos da Fase 2.1 permanecem intactos.

Comandos via `rtk`, com resultados finais:

- `corepack pnpm@11.24.0 exec vitest run --config vitest.integration.config.mts
tests/integration/campaign-signal-engine.test.ts -t
'escopo da fonte contextual|sessão da fonte contextual|proveniência contextual'`:
  **3 passaram, 18 ignorados**. Inclui handler IPC real, cinco vínculos narrativos arquivados,
  cinco tabelas de conversão com ambos os endpoints verificados isoladamente, descrição nula,
  recuperação, ausência de `data`/conteúdo privado, fonte ausente e bloqueio concorrente.
  Checks/FKs/triggers permanecem ativos nos dois novos testes; o caso legado já existente de
  fonte ausente continua simulando corrupção explicitamente, agora com falha em vez de sucesso.
- `corepack pnpm@11.24.0 exec vitest run tests/unit/campaign-signal-user-errors.test.ts
-t 'proveniência'`: **3 passaram, 1 ignorado**; mensagens sem UUID/conteúdo privado.
- `corepack pnpm@11.24.0 typecheck`, ESLint/Prettier direcionados aos arquivos alterados e
  `rtk git diff --check`: sem erros finais.

Não foram repetidos E2E de proveniência, revisão/edição, teste da terceira evidência, IPC com
serviço fake, suítes globais ou migrações já aprovados e inalterados nesta rodada.
QA deve verificar novamente as duas reproduções via IPC e a limitação de escopo atual versus
propriedade histórica; a implementação não se declara aprovada.

## Pontos para QA

- Igualdade conservadora de todos os campos, `null`, predicado/objeto, texto e valores JSON
  (chaves de objeto, ordem de array, tipos escalares); ausência de falsos pares por frase próxima.
- Escopo por campanha, aceita/fato/refutada, afirmações arquivadas, duplicidades e múltiplos pares;
  IDs internos estáveis e duas evidências reais sem UUID na apresentação.
- Transação `IMMEDIATE`, concorrência com edição/arquivamento, pares intercalados, exceção que
  persiste apenas para o par escolhido e invalidação após edição, status, arquivo/restauração e
  reversão; preservar revisão otimista e estados de outros sinais.
- Isolamento e permissões em campanhas ativas, arquivadas e na lixeira; erros e retry sem falso
  resultado vazio; recálculo pendente sem alegar inexistência de conflitos.
- Migração desde v22 com todos os valores -5..5 e `explicit_need`, campos não-score preservados,
  índices/triggers/FKs, checksum v22, backup e rollback; banco vazio.
- IPC/renderer via gateway tipado, sem acesso do renderer ao banco, sem UUID, sem alteração de
  cânone; Revisar mostra o par real e Corrigir abre cada alvo somente após escolha explícita.
  Verificar cancelar, voltar/avançar por teclado, alvo indisponível e Registro normal após o fluxo.

## Checklist manual de UX para a etapa 3A

**Estado:** o usuário confirmou em 2026-11-16 que todos os testes manuais de UX de 3A passaram.
O implementador não executou esses testes. Os itens abaixo são o checklist de escopo documentado,
não uma declaração de aprovação própria nem evidência de nova execução:

- [x] Ler e compreender que “possível” não atribui erro a nenhuma afirmação.
- [x] Diferenciar Revisar/Corrigir, Manter, Marcar exceção e Descartar aviso.
- [x] Confirmar que Revisar mostra ambas as afirmações reais e Corrigir permite escolher cada alvo.
- [x] Conferir origem, fonte e sessão de cada afirmação, incluindo ausência e indisponibilidade.
- [x] Entender os bloqueios de fonte compartilhada e de sessão divergente, sem correção automática.
- [x] Confirmar retorno ao par, histórico por teclado e Registro normal após edição/cancelamento.
- [x] Entender quais campos invalidam uma exceção e perceber a necessidade de nova revisão.
- [x] Distinguir carregamento, falha, vazio antes do cálculo e recálculo concluído.
- [x] Confirmar legibilidade dos níveis Baixa, Média, Alta e Altíssima e ausência de UUID.
- [x] Validar teclado, foco, leitores de tela, mensagens e recuperação de erros no fluxo completo.
