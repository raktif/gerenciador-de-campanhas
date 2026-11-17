# Fase 3 — Preparação e plano de execução

## Objetivo e estado

Este documento iniciou como preparação da Fase 3 e agora também registra decisões de produto,
estado técnico e processo de aprovação das subtarefas autorizadas; não autoriza por si só trabalho
fora da atividade explicitamente atribuída.

- A Fase 2.1 foi entregue, conforme confirmação do responsável pelo projeto. Não deverá ser
  reaberta nem repetida como pré-requisito.
- O fechamento da Fase 2 está documentado em `phase-2-refinement.md` e
  `phase-2-activity-2.10.md`.
- A base usa migrações SQLite versionadas; a fundação 3A.1 eleva o schema da versão 21 para a 22.
- Em 2026-11-16, o responsável confirmou que todas as subtarefas 3A.1–3A.4 receberam aprovação
  técnica do QA e que todos os testes manuais de UX da etapa 3A passaram. Essa validação manual foi
  realizada pelo usuário; não foi executada nem aprovada pelo implementador. O histórico detalhado
  da 3A.4 está em [phase-3-3a4.md](phase-3-3a4.md).
- Em 2026-11-16, o responsável determinou que os testes manuais de UX das subtarefas 3B sejam
  realizados pelo usuário ao final de toda a etapa 3B. A 3B.1 recebeu aprovação técnica
  independente do QA, mas sua UX permanece legitimamente pendente; não solicitar nem alegar
  aprovação manual intermediária.
- Esta etapa não autoriza por si só o início da implementação de qualquer subtarefa da Fase 3.

## Base técnica verificada

A 3B.3 acrescenta a migração aditiva v29 após a base v28 abaixo, preservando SQL/checksums
anteriores. Está implementada e aguarda QA independente; veja
[phase-3-3b3.md](phase-3-3b3.md).

| Área             | Estado atual                                                                                                                                                                                                                              | Implicação para a Fase 3                                                                                                                                   |
| ---------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Persistência     | SQLite, migrações SQL versionadas; v24 Fios Abertos, v25 Relógios, v26 guarda `REPLACE`, v27 entidade/metadados/Eventos e v28 idempotência de criação. Upgrade legado incompatível falha com rollback/backup; checksums 1–27 preservados. | Novas estruturas devem ser adicionadas por migrações aditivas, com upgrade, backup e testes de banco vazio e dados incompatíveis.                          |
| Arquitetura      | Serviços e SQLite no processo principal; contratos Zod; IPC validado; renderer via gateway tipado.                                                                                                                                        | Não acessar o banco diretamente pelo renderer nem contornar contratos/handlers.                                                                            |
| Dados narrativos | Afirmações, Eventos, Sessões, Relações, Notas e fontes já persistidos. Os contratos narrativos já distinguem estado canônico, natureza do conhecimento, visibilidade e origem.                                                            | Reutilizar esses registros para o Registro de Cânone, evidências e sinais; evitar uma segunda fonte de verdade.                                            |
| Integridade      | O padrão existente inclui escopo por campanha, revisão otimista, validação de origem e operações compostas no serviço/repositório.                                                                                                        | Reaplicar essas garantias a cada novo agregado e testar referências cruzadas entre campanhas.                                                              |
| IA e rede        | A Fase 3 é determinística e não depende de IA nem de rede.                                                                                                                                                                                | Regras e sugestões da Fase 3 devem funcionar sem provedor, modelo ou conexão externa.                                                                      |
| Verificação      | O projeto oferece `pnpm verify`, `pnpm test:e2e`, `pnpm package` e `pnpm test:package`. O fechamento da Fase 2 registra a aprovação dos quatro comandos.                                                                                  | O implementador executa os testes unitários e verificações direcionadas; QA executa validação independente e a integração final roda a sequência adequada. |
| Agentes          | Os agentes locais de implementação e QA estão em `.github/agents/`, diretório ignorado pelo Git.                                                                                                                                          | Usar o implementador para uma subtarefa por vez e o QA independente antes do teste manual de UX.                                                           |

Referências técnicas examinadas: `README.md`, `docs/architecture/overview.md`,
`docs/development/phase-2-refinement.md`, `docs/development/phase-2-activity-2.10.md`,
`src/core/contracts/narrative.ts`, `src/main/services/assertion-service.ts`,
`src/main/services/event-service.ts`, `src/db/migrations/manifest.json` e
`src/db/migrations/registry.ts`.

## Regras transversais de aceite

Toda subtarefa deverá:

1. atender aos requisitos do Adendo Técnico 03 v2 e às decisões anteriores ainda vigentes, sem
   contrariar a precedência documental indicada nesse adendo;
2. preservar o isolamento por `campaignId`, validar entradas e saídas e manter acesso ao banco
   restrito à camada de persistência;
3. tratar erros, estados vazios e carregamento sem ocultar falhas nem apresentar sucesso falso;
4. preservar dados e comportamento existentes; migrações devem ser compatíveis com bancos da
   versão 21 e com bancos novos;
5. ter testes unitários do domínio/serviço e testes adicionais de contrato, integração ou migração
   quando a mudança cruzar essas fronteiras;
6. funcionar sem IA e sem rede, explicar as evidências de sugestões e nunca modificar o cânone ou
   decidir um acontecimento automaticamente;
7. atualizar documentação diretamente relacionada e passar as verificações exigidas para o escopo.

## Ordem de execução proposta

Cada linha de implementação é uma subtarefa independente, atribuída ao agente implementador e
encaminhada ao QA somente após a entrega dos testes e do relatório. Dependências entre linhas são
intencionais.

| ID   | Etapa                                | Subtarefa                           | Critérios verificáveis de aceite                                                                                                                                                                                                                                                                                                                                            | Dependências          |
| ---- | ------------------------------------ | ----------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------- |
| P0   | Preparação                           | Auditoria de prontidão e critérios  | Base técnica, estado entregue, requisitos, lacunas e fluxo de aprovação registrados neste documento; nenhuma funcionalidade da Fase 3 implementada.                                                                                                                                                                                                                         | Concluída             |
| 3A.1 | 3A — Motor de Sinais e Cânone        | Contratos e fundação persistente    | Esquemas estritos; migrações aditivas; isolamento por campanha; índices e integridade adequados; teste de banco vazio e upgrade a partir do schema 21; nenhuma tabela ou fluxo futuro não autorizado.                                                                                                                                                                       | P0                    |
| 3A.2 | 3A                                   | Registro de Cânone                  | Exibe afirmações e seus estados/natureza/visibilidade/origem sem duplicar o registro; ações de revisão respeitam revisão otimista; promoção de Possibilidade a Fato exige confirmação explícita; nenhuma promoção automática.                                                                                                                                               | 3A.1                  |
| 3A.3 | 3A                                   | Motor de Sinais determinístico      | Regras iniciais documentadas; mesma entrada e versão de regra produzem o mesmo resultado; evidências rastreáveis; recálculo não duplica sinais nem apaga decisões do usuário; transições de estado validadas e explicáveis.                                                                                                                                                 | 3A.1                  |
| 3A.4 | 3A                                   | Avisos de possíveis contradições    | Regra determinística de igualdade estrutural estrita; prioridade Alta; evidências reais do par; ações revisam/encaminham ao Registro, mantêm, registram exceção por par, corrigem via edição explícita ou descartam aviso; migração de prioridade preserva backup v22; exceções invalidam-se em alteração relevante; testes de concorrência, isolamento e falsos positivos. | 3A.2, 3A.3            |
| 3B.1 | 3B — Mundo em Movimento              | Fios Abertos                        | Criar, editar, vincular, resolver, abandonar, reabrir e arquivar/restaurar fios; tipos/estados exatos do §32; alvos aprovados e isolados por campanha; exclusão de alvo restrita; transições explícitas com revisão e proveniência; migração, fluxo IPC e interface próprios.                                                                                               | 3A.1                  |
| 3B.2 | 3B                                   | Relógios                            | Picklist de 4/6/8/10/12 divisões; apenas Ativo/Concluído; progresso manual uniforme para todos os tipos; preenchimento total conclui na mesma gravação; conclusão parcial/vazia explícita preserva progresso; concluídos imutáveis e consultáveis; persistência/upgrade testados.                                                                                           | 3A.1                  |
| 3B.3 | 3B                                   | Demandas emergentes                 | Sugestões derivadas apenas de sinais/dados disponíveis; fontes e justificativas visíveis; sugestão não é demanda aceita até revisão explícita; suportar ignorar/adiar/aceitar conforme contrato.                                                                                                                                                                            | 3A.3, 3B.1, 3B.2      |
| 3B.4 | 3B                                   | Painel Mundo em Movimento           | Agrega mudanças e sugestões disponíveis sem inventar dados; mostra evidências e ação “por que estou vendo isto?”; carregamento, vazio, erro e recuperação cobertos; funciona offline e sem IA.                                                                                                                                                                              | 3A.3, 3A.4, 3B.1–3B.3 |
| 3C.1 | 3C — Consequências e ciclo de sessão | Consequências e mapa causal         | Representa eventos/objetos narrativos e vínculos causais distintos das Relações comuns; operações preservam campanha, revisão e histórico narrativo aplicável; cadeias e ciclos têm comportamento delimitado e testado.                                                                                                                                                     | 3A.1, 3B.2            |
| 3C.2 | 3C                                   | Encerramento de sessão e preparação | Fluxo reúne capturas, eventos, mudanças, relógios, consequências, fios e recálculo; etapas opcionais e encerramento rápido; falhas ou interrupções não perdem silenciosamente progresso já confirmado.                                                                                                                                                                      | 3A.3, 3B.1–3B.4, 3C.1 |
| 3C.3 | 3C                                   | Integração e fechamento da Fase 3   | QA independente confirma critérios, regressões, migração, fluxo completo e verificações de pacote; documentação/estado atualizados; teste manual de UX aprovado pelo responsável; nenhuma pendência bloqueadora aberta.                                                                                                                                                     | Todas as anteriores   |

## Decisões registradas e questões pendentes de produto

As decisões da 3A.3, 3A.4 e 3B.2 estão documentadas nas entregas respectivas. Para as atividades
posteriores abaixo, detalhes operacionais ainda precisam de decisão do responsável antes de
codificar qualquer regra; o implementador deve aguardar, sem assumir comportamento narrativo:

- **3A.4 — Contradições (decisão registrada e implementada):** somente afirmações
  aceitas com mesmo assunto e conteúdo estrutural exato, uma fato e outra refutada; não inferir
  equivalência de frases diferentes. Prioridade inicial Alta. Exceções valem para o par enquanto
  os campos de conteúdo/eligibilidade não mudarem; ver [phase-3-3a4.md](phase-3-3a4.md).
- **3B.2 — Relógios (decisões respondidas em 2026-11-16):** total de divisões exclusivamente 4, 6,
  8, 10 ou 12 por picklist; preenchimento inteiro entre zero e o total; tipos são classificatórios
  e usam a mesma regra, inclusive `countdown`. O narrador escolhe explicitamente o preenchimento;
  nada avança por tempo, partida/Sessão da campanha, recálculo ou tipo. Preencher o total conclui o
  relógio na mesma operação/transação. O narrador também pode concluir manualmente com progresso
  parcial ou zero, preservando o valor. Os únicos estados são `active`/Ativo e
  `completed`/Concluído; registro concluído é imutável, sem reabertura ou arquivamento, e permanece
  consultável. Não há histórico de avanços/transições nem vínculo por avanço a Sessão; somente o
  progresso e estado atuais são guardados. Reduzir o total abaixo do progresso atual é erro explícito,
  nunca truncamento. Decisões adicionais exigem entidade única da mesma campanha e consequência
  textual desde a criação; metadados narrativos existentes com defaults manuais; conclusão sempre
  pergunta antes de mutar se deve gerar Evento Rascunho (`draft`/`possibility`/`gm`/`manual`),
  associado por role `related` apenas se a entidade continuar ativa; entidade arquivada mantém o
  vínculo e destaca o relógio Ativo sem concluir automaticamente; nenhuma ligação nova à entidade
  arquivada. Essas decisões posteriores substituem, para 3B.2, os estados e semânticas conflitantes
  do modelo-base. A implementação usa v27–v28; instalações v25/v26 com relógios legados incompatíveis
  falham explicitamente com rollback e backup preservado, sem inferência/perda de dados; upgrades
  vazios avançam. Após corrigir idempotência e retry paralelo, a revalidação independente
  aprovou tecnicamente a 3B.2, sem novos achados. UX de 3B.2
  e 3B.1 continua pendente para avaliação conjunta do usuário ao final de toda a 3B. Ver
  [phase-3-3b2.md](phase-3-3b2.md).
- **3B.3 — Demandas (decisões respondidas em 2026-11-17):** sugestão reutiliza somente sinal
  `explicit_need`; aceitação explícita cria Demanda `available/draft/possibility/gm/generator` e
  converte o sinal atomicamente, uma única vez. Estados, vínculos N (Entidades/Relógios/Sessões),
  subdemanda com arquivamento do pai, resolução manual com Evento Rascunho imutável salvo promoção
  explícita/arquivamento, e proteção permanente do Need original foram aprovados pelo responsável.
  Implementação v29 pendente de QA independente; decisões completas, testes e UX pendente estão em
  [phase-3-3b3.md](phase-3-3b3.md). Não aplica políticas de Fios/Relógios por analogia.
- **3C.1 — Causalidade:** cardinalidade e tipos de alvo, permissão de ciclos, como arquivamento e
  exclusão afetam a cadeia e limites para consulta de caminhos.
- **3C.2 — Encerramento:** quais etapas gravam individualmente, como retomar uma sessão interrompida
  e quais ações podem ser desfeitas. O fluxo não deve prometer atomicidade de uma operação longa sem
  a especificar.

### 3B.1 — decisões de produto e estado

O responsável aprovou explicitamente as decisões abaixo em resposta ao bloqueio inicial. A
implementação e as escolhas técnicas estão em [phase-3-3b1.md](phase-3-3b1.md). O adendo 03
anterior não foi usado para reintroduzir requisitos substituídos pelo v2.

- Alvos aceitos: Entidades, Relações, Afirmações, Notas, Eventos e Sessões existentes. Relógios,
  Demandas e tipos futuros não são alvos desta subtarefa.
- Arquivamento do alvo: manter vínculos existentes, impedir vínculos novos a alvos arquivados e
  permitir editar os demais campos do fio sem invalidar vínculos históricos. Sessões concluídas não
  são inferidas como arquivadas.
- Exclusão de alvo: `RESTRICT`; o registro vinculado não pode ser excluído/substituído até que os
  vínculos sejam removidos explicitamente. A exclusão lógica existente de campanhas não é uma
  exclusão física e não ganhou novo fluxo nesta atividade.
- Transições: alterações explícitas e reversíveis; reabrir `resolved`/`abandoned` leva a `open`.
  Arquivar preserva o estado anterior e desarquivar o restaura. Nenhuma transição automática ou
  alteração canônica.
- Proveniência: origem manual ou por Sessão e histórico específico do fio, com data, estado anterior
  e novo; motivo e Sessão opcionais. A Sessão informada precisa pertencer à campanha.

Em 2026-11-16, a primeira revisão técnica independente de 3B.1 foi devolvida com achados P2/P3.
Após as correções focais, o mesmo QA revalidou os quatro achados e aprovou a entrega para UX manual,
sem novos problemas no escopo avaliado. A aprovação é independente do implementador. O responsável
determinou que os testes manuais de UX de toda a etapa 3B serão realizados pelo usuário ao final da
etapa; portanto, UX 3B.1 e 3B.2 permanecem pendentes e não se solicita validação intermediária. O
responsável respondeu às questões de produto da 3B.2 em 2026-11-16; a implementação completa,
incluindo a migração de compatibilidade segura, foi aprovada na revalidação técnica independente.
3B.3 foi implementada após autorização e aprovada tecnicamente pelo QA independente após correções;
UX manual permanece pendente para o final de toda a 3B. 3B.4 e 3C não foram iniciadas.

## Protocolo de implementação, QA e UX

**Estado em 2026-11-16:** o responsável confirma aprovação técnica de 3A.1–3A.4 pelo QA e aprovação
manual de UX de toda a etapa 3A pelo usuário. A aprovação manual não foi executada pelo
implementador. 3B.1 foi aprovada pelo QA após correções e revalidação técnica independente; sua UX
será realizada pelo usuário ao final de toda a etapa 3B, conforme decisão posterior do
responsável. 3B.2 foi aprovada tecnicamente pelo QA após correções e revalidação; UX manual conjunta
3B permanece pendente. Em 2026-11-17, a 3B.3 foi implementada após decisões finais e aprovada
tecnicamente pelo QA independente após duas rodadas de correções; UX manual conjunta continua
pendente para o final da etapa. 3B.4 e 3C não foram iniciadas.

1. O responsável autoriza uma única subtarefa e seu escopo.
2. O implementador consulta os requisitos aplicáveis, implementa a subtarefa e adiciona/executa
   testes unitários e outras verificações necessárias. Entrega arquivos alterados, resultados,
   riscos e pontos para QA.
3. O agente QA valida o diff e os requisitos de forma independente, executa testes e verifica
   regressões. Qualquer bug ou comportamento inesperado devolve a atividade ao implementador com
   evidências reproduzíveis. Não há aprovação condicional.
4. Os testes manuais de UX são realizados pelo usuário; aprovação técnica não representa aprovação
   de UX. A UX da 3A está encerrada conforme confirmação do usuário em 2026-11-16. Por decisão do
   responsável em 2026-11-16, a UX das subtarefas 3B.1–3B.4 ocorrerá em conjunto ao final da etapa
   3B, após as aprovações técnicas aplicáveis; não se solicita nem se declara UX aprovada por
   subtarefa antes disso.
5. O responsável autoriza cada subtarefa separadamente. A conclusão técnica desta entrega não
   inicia nem autoriza atividades posteriores; decisões bloqueadoras de produto precisam ser
   esclarecidas antes de implementar o comportamento correspondente.

O QA não deve editar a implementação nem substituir o teste manual do usuário. O implementador não
deve aprovar o próprio trabalho. Uma subtarefa não autoriza automaticamente a seguinte.

## Validação de encerramento

No fechamento da Fase 3, executar e registrar:

- `pnpm verify`;
- `pnpm test:e2e`;
- `pnpm package`;
- `pnpm test:package`;
- testes manuais de UX de todas as subtarefas aprovadas; para 3B, realizar a rodada conjunta ao
  final da etapa, conforme decisão do responsável;
- upgrade de banco da versão 21, inicialização em banco vazio, integridade e preservação dos dados;
- confirmação de que o fluxo completo funciona sem rede/IA e não altera cânone automaticamente.

Falhas ambientais devem ser registradas como inconclusivas, nunca como aprovação. Se uma verificação
falhar por causa da entrega, corrigir e repetir a validação aplicável antes de encerrar a fase.
