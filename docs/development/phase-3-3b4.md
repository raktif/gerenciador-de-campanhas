# Fase 3B.4 — Painel Mundo em Movimento

## Estado e escopo

Implementação autorizada exclusivamente para 3B.4 em 2026-11-18. O QA devolveu a atividade por
um achado alto: a listagem de Sinais expirava adiamentos ao abrir o painel. O QA confirmou a
correção desse achado, mas devolveu a atividade por perda de foco e falta de anúncio na nova
tentativa (média) e por uma classe de superfície inexistente (baixa). Na última rodada, o QA
confirmou o comportamento em sondagem independente, mas devolveu a atividade por falta de
cobertura E2E quando a primeira nova tentativa também falha. A cobertura foi ampliada e aguarda
nova revalidação independente; a 3B.4 ainda não está aprovada.
A UX manual do painel não foi executada nem aprovada; será avaliada pelo usuário junto das demais
subtarefas da 3B, conforme decisão vigente. Não inicia nem altera 3C.

O painel é de contexto e navegação. Não oferece ações de gravação, não altera cânone, não decide
acontecimentos, não usa IA/rede e encaminha a navegação para os gerenciadores existentes.

## Agregação disponível

Usa gateways tipados, sempre com o `campaignId` selecionado:

- Sinais persistidos nos estados Novo ou Revisado, com resumo, tipo, prioridade e evidências
  retornadas pelo serviço. O detalhe “Por que estou vendo isto?” informa o estado e as evidências;
  necessidades explícitas encaminham para Demandas e os demais sinais para Sinais da campanha.
- Fios Abertos existentes nos estados Aberto, Ativo ou Adormecido.
- Relógios existentes no estado Ativo, mostrando o progresso que está salvo, sem avançá-lo.
- Demandas explicitamente salvas nos estados Disponível ou Ativa.

As listas paginadas são lidas até o fim. Uma falha em qualquer fonte ou divergência de campanha
interrompe a apresentação; não há agregação parcial tratada como vazia. Erros oferecem retry.
Ao tentar novamente, o foco vai para o título do painel antes que o botão desapareça. Uma
região de status persistente informa o carregamento e anuncia a recuperação em caso de sucesso,
sem mover o foco novamente ao receber a resposta. Em caso de nova falha, o alerta e o botão
voltam a aparecer. Os cartões de sinais usam `semantic-surface-muted`, cuja superfície elevada
é definida nos temas claro e escuro.
Não há cache entre campanhas. O painel usa `campaign-signals:list-for-world-in-motion`, que
consulta somente os sinais persistidos pelo mesmo repositório, sem detecção nem expiração.
Um sinal adiado permanece fora do painel mesmo após o prazo, até que o fluxo existente o
processe. A listagem original `campaign-signals:list`, usada por Sinais e Demandas, conserva
exatamente a expiração existente.

## Limites explicitados na interface

- Consequências pendentes e mistérios sem detector são identificados como **não disponíveis nesta
  versão**, não como resultados vazios de detecção.
- “Mudanças desde a última sessão” é indisponível: os registros atuais não comprovam vínculo
  explícito com a última sessão. `updatedAt` não é usado para inferir mudanças.
- O estado vazio cobre somente registros ativos nas fontes atualmente consultadas e avisa que
  categorias indisponíveis não foram verificadas.

Sem migração de banco. O novo canal IPC valida entrada, saída e remetente e reutiliza os
esquemas de listagem existentes. Nenhum contrato de canal anterior foi alterado.

## Validação e QA independente

Testes unitários verificam paginação, estados incluídos/excluídos, erro de fonte, proteção de
isolamento por campanha e apresentação de carregamento/erro/vazio/justificativa/indisponibilidade.
O teste focal em SQLite real chama a operação de dados do painel via gateway e handler de Sinais
e confirma que status, prazo, `updatedAt` e revisão permanecem intactos. Em seguida, a listagem
original expira o mesmo adiamento. O QA revalidou ambos os caminhos; não foram alterados nesta rodada.

O teste E2E focal cobre falha inicial, Enter no botão de retry e nova falha controlada. Confirma
que o carregamento termina, o alerta reaparece, o status fica vazio e o título mantém o foco.
Em seguida, Tab alcança o botão de retry e Espaço dispara a tentativa bem-sucedida, com anúncio
de recuperação e foco no título. O teste libera cada resposta só após verificar o carregamento,
sem pausas temporizadas. O teste unitário de superfície permanece inalterado.

Na rodada anterior, o QA informou 28/28 nas integrações e 18/18 nas suítes focais. A suíte global
teve cinco falhas, e lint e formatação globais apontaram arquivos fora do diff. Esses resultados
são baseline reportado pelo QA; a correção atual não intervém neles.

Na rodada anterior de implementação, o E2E focal e os cinco unitários do painel passaram, assim como TypeScript,
ESLint e Prettier direcionados e `git diff --check`. A checagem adicional do contrato visual
global teve duas falhas fora dos arquivos desta correção: paleta rígida em Relógios e classe
`semantic-text` sem definição em Demandas.

Nesta rodada, `node scripts/build-e2e.mjs` e o teste focal `world-in-motion-retry.spec.ts`
passaram (1 teste em Playwright/Electron), assim como TypeScript, ESLint e Prettier direcionados e
`git diff --check`. Nenhum código de produção foi alterado. O QA confirmou a leitura sem mutação
em SQLite, a listagem ordinária, isolamento, paginação, estados, agregação e os temas claro/escuro.
O baseline mais recente reportado pelo QA é de 13 falhas globais em arquivos fora do diff; a suíte
global não foi repetida nem houve correções fora do escopo.
A UX manual conjunta da 3B continua pendente e pertence ao usuário.
