# Fase 3 — Preparação e plano de execução

## Objetivo e estado

Este documento registra a preparação da Fase 3, sua ordem de execução, critérios de aceite e
processo de aprovação. Não implementa funcionalidades da Fase 3.

- A Fase 2.1 foi entregue, conforme confirmação do responsável pelo projeto. Não deverá ser
  reaberta nem repetida como pré-requisito.
- O fechamento da Fase 2 está documentado em `phase-2-refinement.md` e
  `phase-2-activity-2.10.md`.
- A base usa migrações SQLite versionadas; a fundação 3A.1 eleva o schema da versão 21 para a 22.
- A 3A.1 (contratos e fundação persistente) foi aprovada tecnicamente pelo QA. O teste manual de UX
  das atividades 3A foi adiado pelo responsável até a conclusão de toda a etapa 3A.
- A 3A.2 (Registro de Cânone) foi implementada e aguarda validação técnica independente do QA.
  Seu teste manual de UX permanece adiado; a atividade 3A.3 não foi iniciada nem autorizada.
- Esta etapa não autoriza por si só o início da implementação de qualquer subtarefa da Fase 3.

## Base técnica verificada

| Área             | Estado atual                                                                                                                                                                   | Implicação para a Fase 3                                                                                                                                   |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Persistência     | SQLite, migrações SQL versionadas, manifesto e registro contínuo; schema atual na versão 22 após a fundação 3A.1.                                                              | Novas estruturas devem ser adicionadas por migrações aditivas, com upgrade de banco existente e teste de banco vazio.                                      |
| Arquitetura      | Serviços e SQLite no processo principal; contratos Zod; IPC validado; renderer via gateway tipado.                                                                             | Não acessar o banco diretamente pelo renderer nem contornar contratos/handlers.                                                                            |
| Dados narrativos | Afirmações, Eventos, Sessões, Relações, Notas e fontes já persistidos. Os contratos narrativos já distinguem estado canônico, natureza do conhecimento, visibilidade e origem. | Reutilizar esses registros para o Registro de Cânone, evidências e sinais; evitar uma segunda fonte de verdade.                                            |
| Integridade      | O padrão existente inclui escopo por campanha, revisão otimista, validação de origem e operações compostas no serviço/repositório.                                             | Reaplicar essas garantias a cada novo agregado e testar referências cruzadas entre campanhas.                                                              |
| IA e rede        | A Fase 3 é determinística e não depende de IA nem de rede.                                                                                                                     | Regras e sugestões da Fase 3 devem funcionar sem provedor, modelo ou conexão externa.                                                                      |
| Verificação      | O projeto oferece `pnpm verify`, `pnpm test:e2e`, `pnpm package` e `pnpm test:package`. O fechamento da Fase 2 registra a aprovação dos quatro comandos.                       | O implementador executa os testes unitários e verificações direcionadas; QA executa validação independente e a integração final roda a sequência adequada. |
| Agentes          | Os agentes locais de implementação e QA estão em `.github/agents/`, diretório ignorado pelo Git.                                                                               | Usar o implementador para uma subtarefa por vez e o QA independente antes do teste manual de UX.                                                           |

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

| ID   | Etapa                                | Subtarefa                           | Critérios verificáveis de aceite                                                                                                                                                                                                                                       | Dependências          |
| ---- | ------------------------------------ | ----------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------- |
| P0   | Preparação                           | Auditoria de prontidão e critérios  | Base técnica, estado entregue, requisitos, lacunas e fluxo de aprovação registrados neste documento; nenhuma funcionalidade da Fase 3 implementada.                                                                                                                    | Concluída             |
| 3A.1 | 3A — Motor de Sinais e Cânone        | Contratos e fundação persistente    | Esquemas estritos; migrações aditivas; isolamento por campanha; índices e integridade adequados; teste de banco vazio e upgrade a partir do schema 21; nenhuma tabela ou fluxo futuro não autorizado.                                                                  | P0                    |
| 3A.2 | 3A                                   | Registro de Cânone                  | Exibe afirmações e seus estados/natureza/visibilidade/origem sem duplicar o registro; ações de revisão respeitam revisão otimista; promoção de Possibilidade a Fato exige confirmação explícita; nenhuma promoção automática.                                          | 3A.1                  |
| 3A.3 | 3A                                   | Motor de Sinais determinístico      | Regras iniciais documentadas; mesma entrada e versão de regra produzem o mesmo resultado; evidências rastreáveis; recálculo não duplica sinais nem apaga decisões do usuário; transições de estado validadas e explicáveis.                                            | 3A.1                  |
| 3A.4 | 3A                                   | Avisos de possíveis contradições    | Regras determinísticas e limitadas a casos definidos; aviso sempre apresentado como possibilidade; revisar, manter, marcar exceção, corrigir ou descartar não altera outros dados sem ação explícita; testes de falsos positivos relevantes e isolamento por campanha. | 3A.2, 3A.3            |
| 3B.1 | 3B — Mundo em Movimento              | Fios Abertos                        | Criar, editar, vincular, resolver e arquivar fios; estados e tipos permitidos conforme contrato; vínculos não cruzam campanhas; mudanças de estado preservam revisão e proveniência.                                                                                   | 3A.1                  |
| 3B.2 | 3B                                   | Relógios                            | Criar, configurar, consultar e avançar/resolver com ação explícita do narrador; progresso permanece estável após reinício; regras de avanço são testáveis e nenhum relógio avança automaticamente.                                                                     | 3A.1                  |
| 3B.3 | 3B                                   | Demandas emergentes                 | Sugestões derivadas apenas de sinais/dados disponíveis; fontes e justificativas visíveis; sugestão não é demanda aceita até revisão explícita; suportar ignorar/adiar/aceitar conforme contrato.                                                                       | 3A.3, 3B.1, 3B.2      |
| 3B.4 | 3B                                   | Painel Mundo em Movimento           | Agrega mudanças e sugestões disponíveis sem inventar dados; mostra evidências e ação “por que estou vendo isto?”; carregamento, vazio, erro e recuperação cobertos; funciona offline e sem IA.                                                                         | 3A.3, 3A.4, 3B.1–3B.3 |
| 3C.1 | 3C — Consequências e ciclo de sessão | Consequências e mapa causal         | Representa eventos/objetos narrativos e vínculos causais distintos das Relações comuns; operações preservam campanha, revisão e histórico narrativo aplicável; cadeias e ciclos têm comportamento delimitado e testado.                                                | 3A.1, 3B.2            |
| 3C.2 | 3C                                   | Encerramento de sessão e preparação | Fluxo reúne capturas, eventos, mudanças, relógios, consequências, fios e recálculo; etapas opcionais e encerramento rápido; falhas ou interrupções não perdem silenciosamente progresso já confirmado.                                                                 | 3A.3, 3B.1–3B.4, 3C.1 |
| 3C.3 | 3C                                   | Integração e fechamento da Fase 3   | QA independente confirma critérios, regressões, migração, fluxo completo e verificações de pacote; documentação/estado atualizados; teste manual de UX aprovado pelo responsável; nenhuma pendência bloqueadora aberta.                                                | Todas as anteriores   |

## Decisões obrigatórias antes das subtarefas afetadas

Os documentos estabelecem conceitos e exemplos, mas alguns detalhes operacionais precisam ser
definidos pelo responsável antes de codificar a regra correspondente. O implementador deve registrar
essas perguntas e aguardar decisão, em vez de assumir comportamento narrativo:

- **3A.3 — Sinais:** quais tipos entram no primeiro conjunto executável, regras de pontuação/severidade,
  expiração e significado de “stale”; se o estado do sinal é preservado quando a regra deixa de
  detectá-lo.
- **3A.4 — Contradições:** quais combinações específicas entre afirmações/relações devem disparar os
  avisos iniciais e como exceções interagem com alterações posteriores dos registros.
- **3B.2 — Relógios:** escala/progresso, limites, regra de avanço manual, resolução/reabertura e
  relação entre avanço e sessão. Nenhum incremento automático deve ser presumido.
- **3B.3 — Demandas:** entidade persistida, estados de ciclo de vida, critérios de conversão e
  diferenças entre sugestão emergente e demanda aceita.
- **3C.1 — Causalidade:** cardinalidade e tipos de alvo, permissão de ciclos, como arquivamento e
  exclusão afetam a cadeia e limites para consulta de caminhos.
- **3C.2 — Encerramento:** quais etapas gravam individualmente, como retomar uma sessão interrompida
  e quais ações podem ser desfeitas. O fluxo não deve prometer atomicidade de uma operação longa sem
  a especificar.

## Protocolo de implementação, QA e UX

**Estado após a implementação 3A.2:** entrega técnica pendente do QA independente; UX manual das
atividades 3A permanece adiada até a conclusão da etapa, conforme orientação do responsável. A
implementação 3A.2 e suas decisões estão registradas em
[phase-3-3a2.md](phase-3-3a2.md). Nenhuma atividade seguinte está autorizada por este registro.

1. O responsável autoriza uma única subtarefa e seu escopo.
2. O implementador consulta os requisitos aplicáveis, implementa a subtarefa e adiciona/executa
   testes unitários e outras verificações necessárias. Entrega arquivos alterados, resultados,
   riscos e pontos para QA.
3. O agente QA valida o diff e os requisitos de forma independente, executa testes e verifica
   regressões. Qualquer bug ou comportamento inesperado devolve a atividade ao implementador com
   evidências reproduzíveis. Não há aprovação condicional.
4. Após aprovação técnica, o responsável executa o teste manual de UX da subtarefa usando o
   checklist enviado pelo QA. A aprovação técnica não representa aprovação de UX.
5. A subtarefa só é encerrada depois do UX manual. O responsável então autoriza a próxima
   subtarefa; achados de UX retornam ao desenvolvimento e passam novamente pelo QA.

O QA não deve editar a implementação nem substituir o teste manual do usuário. O implementador não
deve aprovar o próprio trabalho. Uma subtarefa não autoriza automaticamente a seguinte.

## Validação de encerramento

No fechamento da Fase 3, executar e registrar:

- `pnpm verify`;
- `pnpm test:e2e`;
- `pnpm package`;
- `pnpm test:package`;
- testes manuais de UX de todas as subtarefas aprovadas;
- upgrade de banco da versão 21, inicialização em banco vazio, integridade e preservação dos dados;
- confirmação de que o fluxo completo funciona sem rede/IA e não altera cânone automaticamente.

Falhas ambientais devem ser registradas como inconclusivas, nunca como aprovação. Se uma verificação
falhar por causa da entrega, corrigir e repetir a validação aplicável antes de encerrar a fase.
