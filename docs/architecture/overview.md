# Arquitetura e segurança

O processo principal controla ciclo de vida, SQLite, filesystem, logs e janelas. O preload oferece ao renderer apenas um gateway IPC mínimo e tipado. O renderer React não acessa Node.js, Electron ou o banco diretamente.

As janelas usam `contextIsolation`, sandbox e `webSecurity`, com `nodeIntegration` desativado. Navegação externa, novas janelas e webviews são bloqueadas. Toda chamada IPC valida remetente, entrada e saída e retorna um envelope de resultado seguro. A política de conteúdo impede scripts e conexões externas; não existe servidor HTTP local.

O SQLite usa WAL, foreign keys, busy timeout e migrações versionadas com checksum. FTS5 é verificado no bootstrap. Antes de alterar um banco existente, a aplicação usa a API de backup do SQLite e confirma a integridade da cópia. Segredos futuros deverão usar `safeStorage`; a Fase 0 não persiste credenciais.

### Compatibilidade LF/CRLF das migrações

Para as definições dinâmicas (v1–5, v7 e v16–23), o checksum armazenado para novas
migrações é SHA-256 do SQL com CRLF convertido para LF. Na abertura, também é aceito
o hash da variante integral CRLF desse mesmo SQL, independentemente do checkout
(`core.autocrlf`). Nenhuma outra normalização é feita: espaços, BOM, CR isolado,
newline final e conteúdo continuam significativos; hashes de finais de linha mistos
não são aceitos. Assim, uma alteração no SQL atual de uma migração dinâmica já
registrada não corresponde aos hashes aceitos e bloqueia a inicialização.

As versões fixas v6 e v8–15 preservam a política histórica: seus checksums são
comparados com os valores fixos, sem validação dinâmica do conteúdo SQL atual. Para
versões já registradas, alterações no SQL atual dessas migrações não são detectadas
por hash dinâmico. Checksums armazenados desconhecidos continuam bloqueando a
inicialização. O runner não sobrescreve checksums, nomes ou datas de migrações já
aplicadas nem apaga dados.
Não há nova migração de schema: backup verificado e transações continuam sendo usados
quando há migrações pendentes.

## Estado arquitetural da Fase 2

Os agregados entregues na Fase 2 — relações, afirmações, notas, sessões, eventos, cronologia e Caixa
de Entrada — continuam no processo principal, com contratos Zod estritos, revisão otimista,
transações para operações compostas e isolamento obrigatório por `campaignId`. A navegação interna
da campanha fica no renderer e só troca telas já implementadas; ela não cria rotas, IPC ou dados
para funcionalidades futuras. Campanhas arquivadas ou na lixeira não expõem módulos mutáveis.

O shell do renderer mantém a campanha selecionada, marca o destino atual semanticamente e move o
foco ao título após trocar de módulo. Estados de carregamento, vazio, erro recuperável e operação
ocupada permanecem responsabilidade de cada tela. A Caixa de Entrada mantém seus diálogos com foco
contido e fundo inerte; o renderer continua sem acesso privilegiado.

O histórico de navegação é uma coleção central em memória, compartilhada pelas telas do renderer.
Cada entrada guarda o módulo e suas telas internas (listas, detalhes, formulários, campos e
sessões abertas), incluindo o registro selecionado. Alterações de contexto da mesma transição são
agrupadas em uma única entrada; filtros e carregamentos apenas atualizam a entrada atual.
Alt+Seta Esquerda/Direita e os botões laterais do mouse percorrem esse histórico sem mudar a URL.
Uma nova navegação após voltar elimina o ramo de avanço. O histórico não é persistido no banco e
os dados de formulário ainda não salvos são descartados ao sair; voltar/avançar não salva dados.
Registros selecionados são recarregados ao restaurar uma tela, para usar sua revisão atual.
Conversões de Intenção concluídas são retiradas do histórico e retornam à sessão de origem,
sem permitir reabrir o formulário concluído pelo avanço.

As subtarefas 3A.1–3A.4 receberam aprovação técnica do QA, e o usuário confirmou aprovação manual
de UX de toda a etapa 3A em 2026-11-16; essa aprovação manual é do usuário, não do implementador.
Os sinais persistidos continuam determinísticos e não criam Eventos, Demandas ou fatos nem alteram
o cânone.
O recálculo adquire transação SQLite imediata antes de ler as fontes e mantém leitura, detecção,
reconciliação e evidências no mesmo snapshot; contenção `SQLITE_BUSY`/`SQLITE_LOCKED` retorna erro
explícito, sem gravar parcialmente nem repetir a ação silenciosamente.

Migração 24 adiciona Fios Abertos (`story_threads`, vínculos e transições), aprovada tecnicamente
pelo QA independente. Os alvos permitidos são Entidades, Relações, Afirmações, Notas, Eventos e
Sessões; exclusão de alvo vinculado é restrita, vínculos históricos sobrevivem ao arquivamento do
alvo e Sessões concluídas não são consideradas arquivadas. Reabertura e arquivamento são ações
explícitas, com estado anterior preservado e transições específicas do fio. Por decisão do
responsável em 2026-11-16, a UX da 3B.1 permanece pendente e será testada pelo usuário junto das
demais subtarefas 3B ao final da etapa; a aprovação técnica não é aprovação de UX. Detalhes estão em
[`phase-3-3b1.md`](../development/phase-3-3b1.md).
Migrações 25–28 adicionam Relógios, a proteção contra substituição de concluídos com
`INSERT OR REPLACE`/`UPDATE OR REPLACE`, inclusive com `recursive_triggers=0`. O modelo permanece
com divisões limitadas a 4/6/8/10/12, avanço somente por comando
explícito do narrador e estados atuais `active`/`completed`. Preenchimento total conclui na mesma
transação; conclusão manual parcial ou vazia preserva o progresso. Relógios concluídos são
imutáveis, sem reabertura ou arquivamento, mas permanecem consultáveis. Não há histórico de
transições, vínculo de avanço com Sessão ou automação por tempo/tipo/recálculo. As decisões
autoritativas de produto e o estado de QA/UX estão em
[`phase-3-3b2.md`](../development/phase-3-3b2.md).
A v27 exige entidade única da mesma campanha, consequência e metadados narrativos. Conclusão pede
decisão explícita prévia e, se autorizado, cria Evento `draft`/`possibility` relacionado à entidade
na mesma transação; arquivar a entidade preserva o vínculo e destaca o relógio, sem gerar Evento.
v28 registra chave idempotente e payload de cada criação para que retries após resposta perdida ou
reinício retornem o mesmo relógio/Evento; reutilização com payload/campanha diferente é recusada.
Upgrade vazio v25/v26/v27 é suportado; se já houver relógios incompatíveis sem entidade/consequência, a
migração falha explicitamente e reverte o lote, preservando dados/versão/backup, sem reparar por
inferência. Os dois novos achados da revalidação QA foram corrigidos e aprovados pelo QA independente;
UX manual conjunta de 3B permanece pendente conforme decisão do responsável.
Esses limites preservam o modo local sem IA e sem rede: não há servidor HTTP, provedor de IA, modelo
ou chamada externa necessária aos fluxos atuais. O fechamento 2.10E foi aprovado em 2026-09-21 com
verify, 12 E2E, pacote Windows x64 e smoke test de SQLite/FTS5.

Migração **29** acrescenta Demandas Emergentes, pendentes de QA independente. Sugestões reutilizam
somente sinais `explicit_need`; aceitação é transação idempotente sinal→Demanda, sem promover
cânone. Vínculos são Entidades, Relógios e Sessões; transformação cria filha e arquiva pai
atomicamente. Resolução manual, após encerrar filhas, cria obrigatoriamente Evento Rascunho com
todas as entidades vinculadas. Evento gerado tem conteúdo/origem/vínculos congelados, permitindo
somente promoção explícita a Aceito/Fato e arquivamento/restauração.
Referências estruturadas e snapshots preservam a necessidade original: valor, papel/tipo da
definição e tipo da entidade recebem guardas permanentes específicas, sem congelar atributos
independentes nem valores de entidades irmãs. Serviços antecipam erros e SQLite repete as
invariantes contra bypass/REPLACE. A entidade não pode ser arquivada enquanto houver Demanda
pendente vinculada. Não há novo detector, causalidade, IA/rede ou histórico geral. Contratos,
estados e limites estão em [phase-3-3b3.md](../development/phase-3-3b3.md); UX conjunta 3B permanece
pendente para o final da etapa.

Decisões detalhadas ficam em [docs/adr](../adr/README.md).
