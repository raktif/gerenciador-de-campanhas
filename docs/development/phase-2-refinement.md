# Fase 2 — Refinamento técnico

## Objetivo

Este documento transforma o escopo de relações e cronologia em incrementos implementáveis e
testáveis. Ele complementa as especificações do produto, sem substituí-las, e adota a arquitetura
desktop vigente no repositório: Electron sem servidor HTTP, contratos TypeScript validados com Zod,
IPC assíncrono, serviços no processo principal e SQLite acessado apenas pela camada de persistência.

A Fase 2 termina quando uma campanha puder representar conexões e acontecimentos, registrar uma
sessão e capturar informações durante o jogo, integralmente sem IA.

Estado atual: os incrementos 2.0 (refinamento), 2.1 (fundação narrativa persistente), 2.2 (tipos de
relação), 2.3 (relações e campos de referência), 2.4 (lista e vizinhança) e 2.5 (afirmações e
notas) estão concluídos. Sessões permanecem como o próximo incremento planejado.

## Escopo

Incluído:

- tipos de relação e relações entre entidades;
- campos de entidade do tipo referência, persistidos como relações;
- lista de relações e vizinhança de uma entidade;
- afirmações narrativas;
- notas e vínculos de notas com entidades;
- sessões, participantes e intenções;
- eventos e vínculos de eventos com entidades;
- linha do tempo da campanha e de uma entidade;
- captura rápida e triagem da Caixa de Entrada;
- proveniência manual e de sessão necessária aos registros desta fase;
- paginação por cursor, revisão otimista, arquivamento e isolamento entre campanhas.

Adiado:

- relógios, demandas, consequências e o gerador determinístico, pertencentes à Fase 3;
- histórico geral em `change_log`, exportação, importação e restauração, pertencentes à Fase 4;
- Biblioteca, documentos e PDFs, pertencentes à Fase 5;
- provedores, recursos ou sugestões de IA, pertencentes às fases 6 em diante;
- visualização simultânea do grafo completo da campanha.

Durante a Fase 2, a Caixa de Entrada não deve oferecer conversões para objetos ainda adiados. Os
tipos futuros podem constar em contratos de domínio apenas quando isso não criar botões inoperantes,
tabelas prematuras ou dependências da Fase 3.

## Regras transversais

Todos os módulos desta fase devem seguir estas regras:

1. IDs são UUIDs e datas persistidas usam ISO 8601 em UTC.
2. Toda leitura e escrita recebe `campaignId` e impede referências entre campanhas.
3. Listas usam cursor, limite padrão 50 e limite máximo 100.
4. Atualizações de registros mutáveis exigem `revision` e retornam `REVISION_CONFLICT` quando a
   versão persistida divergir.
5. Arquivamento preserva o registro e o exclui das listagens ativas por padrão.
6. Relações, afirmações, eventos e notas preservam estado canônico, natureza do conhecimento,
   visibilidade e origem quando definidos pelo modelo.
7. Entradas manuais usam por padrão `accepted`, `fact`, `gm` e origem `manual`.
8. Todo handler IPC valida remetente, entrada e saída, usa o envelope `Result<T>` e não expõe
   detalhes internos de erro.
9. O renderer depende de `CampaignManagerGateway`; não acessa Node.js, SQLite ou `ipcRenderer`.
10. Cada tela possui carregamento, estado vazio, erro recuperável, confirmação para ação destrutiva
    e operação completa por teclado.

## Matriz de requisitos

| ID       | Requisito                         | Regra principal                                                         | Evidência de aceite                    |
| -------- | --------------------------------- | ----------------------------------------------------------------------- | -------------------------------------- |
| REL-T-01 | Cadastrar tipos de relação        | Nome e `slug` são únicos por campanha                                   | CRUD unitário, integração e interface  |
| REL-T-02 | Configurar direção                | Forma inversa é exibida no sentido oposto                               | Teste dos dois sentidos                |
| REL-T-03 | Configurar simetria               | Uma relação simétrica representa um único vínculo                       | Teste de normalização e duplicidade    |
| REL-T-04 | Restringir tipos de entidade      | Origem e destino respeitam listas permitidas                            | Serviço rejeita combinações inválidas  |
| REL-01   | Relacionar duas entidades         | Ambas pertencem à mesma campanha                                        | Integração cobre isolamento            |
| REL-02   | Preservar semântica narrativa     | Relação possui estado, natureza, visibilidade e origem                  | Contrato e persistência validados      |
| REL-03   | Controlar duplicidade             | Duplicata gera aviso explícito sem perda de dados                       | Retorno estruturado e teste de serviço |
| REL-04   | Definir vigência                  | Eventos inicial e final pertencem à mesma campanha                      | Validação de serviço                   |
| REL-05   | Editar campos de referência       | Relação é a única fonte de verdade                                      | E2E cria e edita referência pela ficha |
| GRF-01   | Listar relações                   | Forma direta ou inversa é apresentada corretamente                      | Teste de apresentação                  |
| GRF-02   | Consultar vizinhança              | Profundidades 1, 2 e 3 não repetem nós indevidamente                    | Integração com ciclos                  |
| GRF-03   | Filtrar vizinhança                | Filtros de tipo, estado, natureza e visibilidade são aplicados          | Testes de consulta e interface         |
| AST-01   | Manter afirmações                 | Sujeito é obrigatório; objeto é opcional                                | CRUD e validação                       |
| AST-02   | Representar declaração textual    | `statement` ou predicado/valor forma uma declaração válida              | Casos válidos e inválidos              |
| NOT-01   | Manter notas                      | Tipo e corpo são validados; arquivamento preserva conteúdo              | CRUD completo                          |
| NOT-02   | Vincular notas a entidades        | Vínculo não cruza campanhas                                             | Integração cobre vínculo e remoção     |
| SES-01   | Manter sessões                    | Número sequencial é único por campanha                                  | CRUD e conflito de sequência           |
| SES-02   | Controlar status                  | Transições inválidas de status são rejeitadas                           | Teste unitário da máquina de estados   |
| SES-03   | Registrar participantes           | Entidades e papéis pertencem à sessão e campanha                        | Integração transacional                |
| SES-04   | Registrar intenções               | Intenções seguem `open`, `completed`, `abandoned` ou `transformed`      | CRUD e transições                      |
| EVT-01   | Manter eventos                    | Evento pode pertencer a uma sessão e tem ordem estável                  | CRUD e ordenação                       |
| EVT-02   | Vincular eventos a entidades      | Papéis e ordem dos vínculos são preservados                             | Integração e interface                 |
| TIM-01   | Exibir linha do tempo da campanha | Eventos são ordenados deterministicamente                               | E2E com duas sessões                   |
| TIM-02   | Exibir linha do tempo da entidade | Somente eventos vinculados à entidade são exibidos                      | Teste de isolamento                    |
| INB-01   | Capturar texto rapidamente        | Captura não exige classificação                                         | E2E pelo atalho global                 |
| INB-02   | Associar captura à sessão         | Sessão é opcional e deve pertencer à campanha                           | Validação de serviço                   |
| INB-03   | Triar uma captura                 | Status segue `new`, `reviewing`, `converted`, `dismissed` ou `archived` | Testes de transição                    |
| INB-04   | Converter captura                 | Criação do destino e atualização do item são atômicas                   | Teste de rollback                      |
| INB-05   | Preservar texto original          | Objeto convertido referencia a captura como fonte                       | Integração de proveniência             |

## Incrementos de implementação

### 2.1 — Fundação narrativa

- adicionar migrações somente aditivas posteriores à versão 7;
- modelar a proveniência necessária para origens `manual` e `session`;
- centralizar schemas reutilizáveis de estado, visibilidade, origem, UUID, datas e revisão;
- preparar índices por campanha, arquivamento, ordenação e entidades vinculadas;
- provar migração de um banco existente da Fase 1 e criação de um banco vazio.

Critério de saída: os novos schemas migram com backup prévio, preservam os dados da Fase 1 e não
expõem ainda funcionalidade incompleta na interface.

### 2.2 — Tipos de relação

- implementar contrato, repositório, serviço, IPC, gateway e interface de administração;
- validar `slug`, forma inversa, simetria e tipos de entidade permitidos;
- oferecer ordenação e arquivamento.

Critério de saída: o usuário configura um tipo direcionado e um simétrico em uma campanha sem que
eles apareçam em outra.

### 2.3 — Relações e campos de referência

Estado: concluída em 2026-09-02.

- implementar CRUD e regras de origem/destino;
- normalizar relações simétricas e sinalizar possíveis duplicatas;
- integrar `entity_reference` e `entity_reference_list` à edição de entidades;
- validar eventos de início e fim quando a cronologia estiver disponível.

Critério de saída: o usuário relaciona entidades pelos dois fluxos e a mesma relação é refletida em
ambos, sem duplicar a fonte de verdade.

### 2.4 — Lista e vizinhança

Estado: concluída em 2026-09-02.

- entregar lista textual acessível com direção correta;
- implementar consulta de vizinhança com proteção contra ciclos;
- começar com profundidade 1 e evoluir para 2 e 3;
- adicionar filtros sem retirar a alternativa textual ao grafo.

Critério de saída: o exemplo de Ethéria pode ser navegado a partir de qualquer entidade conectada.

### 2.5 — Afirmações e notas

Estado: concluída em 2026-09-04. Consulte a
[rastreabilidade do incremento 2.5](phase-2-activity-2.5.md).

- implementar CRUD, metadados narrativos e arquivamento;
- vincular notas a entidades com papéis;
- incluir as seções correspondentes na navegação da campanha e da entidade.

Critério de saída: uma possibilidade pode ser registrada sem ser tratada como fato, e uma nota pode
ser encontrada a partir de cada entidade vinculada.

### 2.6 — Sessões

- implementar sessões, participantes e intenções;
- validar sequência e transições de status;
- oferecer planejamento, início, conclusão e cancelamento;
- manter resumo manual; qualquer geração por IA permanece fora do escopo.

Critério de saída: uma sessão pode ser planejada, receber participantes e intenções e ser concluída.

### 2.7 — Eventos e linha do tempo

- implementar eventos e seus vínculos com entidades;
- ordenar eventos dentro da sessão e entre sessões;
- exibir linha do tempo da campanha e da entidade;
- concluir a validação de vigência das relações.

Critério de saída: o evento “Descoberta nos túneis” aparece na sessão, na campanha e nas entidades
vinculadas, sempre na ordem esperada.

### 2.8 — Captura rápida

- disponibilizar captura em todas as telas da campanha;
- usar `Ctrl+K` no Windows/Linux e `Cmd+K` no macOS, sem bloquear uso por botão;
- permitir associação opcional à sessão em andamento;
- manter o fluxo curto e sem classificação obrigatória.

Critério de saída: uma anotação é persistida durante uma sessão apenas com texto e pode ser retomada
após reiniciar o aplicativo.

### 2.9 — Triagem da Caixa de Entrada

- implementar listagem, revisão, descarte e arquivamento;
- converter para entidade, relação, afirmação, nota ou evento;
- permitir selecionar ou criar entidades necessárias ao destino;
- executar criação, proveniência e mudança de status em uma transação.

Critério de saída: uma falha na conversão não cria objeto parcial nem altera o item original.

### 2.10 — Integração e fechamento

- consolidar a navegação interna da campanha;
- revisar carregamento, vazios, erros, teclado, foco e anúncios de acessibilidade;
- executar lint, formatação, tipos, testes unitários, IPC e integração;
- executar E2E, empacotamento e smoke test do pacote;
- atualizar README, arquitetura e estado da fase.

Critério de saída: todos os critérios desta matriz possuem teste ou verificação manual documentada,
e o aplicativo empacotado executa os fluxos essenciais sem IA.

## Contratos IPC planejados

Os nomes abaixo são inventário de casos de uso. Os schemas exatos serão criados no incremento de
cada módulo.

| Gateway               | Operações iniciais                                                                  |
| --------------------- | ----------------------------------------------------------------------------------- |
| `relationshipTypes`   | `create`, `get`, `list`, `update`, `archive`, `restore`                             |
| `relationships`       | `create`, `get`, `list`, `update`, `archive`, `restore`, `neighborhood`             |
| `assertions`          | `create`, `get`, `list`, `update`, `archive`, `restore`                             |
| `notes`               | `create`, `get`, `list`, `update`, `archive`, `restore`                             |
| `sessions`            | `create`, `get`, `list`, `update`                                                   |
| `sessionParticipants` | `replace`                                                                           |
| `sessionIntentions`   | `create`, `list`, `update`                                                          |
| `events`              | `create`, `get`, `list`, `update`, `archive`, `restore`                             |
| `timeline`            | `listCampaign`, `listEntity`                                                        |
| `inbox`               | `capture`, `get`, `list`, `beginReview`, `convert`, `dismiss`, `archive`, `restore` |

Operações compostas, como substituir participantes ou converter uma captura, devem entrar no
serviço como um único caso de uso transacional. O renderer não deve coordenar múltiplas escritas
para simular atomicidade.

## Estratégia de testes

### Unitários

- schemas Zod e valores padrão;
- transições de sessão, intenção e item da Caixa de Entrada;
- simetria, forma inversa e detecção de duplicidade;
- restrições de tipos de entidade;
- construção de vizinhança com ciclos;
- regras de visibilidade, origem e revisão.

### Integração

- CRUD completo de cada agregado;
- migração desde a versão 7 e banco vazio;
- isolamento entre duas campanhas em todas as consultas e vínculos;
- paginação e ordenação determinística;
- concorrência otimista;
- rollback de conversão da Caixa de Entrada;
- cascatas e restrições de arquivamento ou remoção.

### IPC

- rejeição de remetente não autorizado;
- entrada inválida sem chamada ao serviço;
- saída validada e envelope consistente;
- mapeamento seguro dos erros de domínio;
- registro sem conteúdo narrativo sensível.

### E2E progressivos

1. Criar tipos e relações, conferir forma inversa e vizinhança.
2. Planejar sessão, adicionar participantes, registrar eventos e consultar linhas do tempo.
3. Capturar uma anotação, reiniciar o aplicativo, triá-la e conferir o objeto e sua proveniência.

## Dependências e riscos

| Risco                                                        | Tratamento planejado                                                                                                 |
| ------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------- |
| Ciclo lógico entre sessões, eventos, relações e proveniência | Separar migrações aditivas e validar referências no serviço quando a FK ainda não puder representar a regra completa |
| Relações simétricas duplicadas em ordens opostas             | Normalizar o par de entidades antes de persistir e apoiar a regra com índice quando possível                         |
| Vizinhança lenta ou infinita em grafos cíclicos              | Usar conjunto de visitados, profundidade máxima 3 e índices direcionais                                              |
| Crescimento da navegação React atual                         | Introduzir navegação interna da campanha incrementalmente, sem reescrever o shell inteiro                            |
| Conversão parcial da Caixa de Entrada                        | Manter toda a operação no processo principal e em uma única transação SQLite                                         |
| Antecipação acidental da Fase 3                              | Não criar tabelas, gateways nem controles para relógios, demandas ou consequências nesta fase                        |
| Divergência entre campos de referência e relações            | Proibir persistência de referência em `field_values` e reutilizar exclusivamente o serviço de relações               |

## Definition of Done da Fase 2

- todos os requisitos da matriz possuem evidência de aceite;
- todos os registros respeitam campanha, visibilidade, proveniência, revisão e arquivamento;
- nenhum botão ou destino de conversão aponta para funcionalidade futura;
- o fluxo completo funciona com IA desligada e sem acesso à rede;
- `pnpm verify`, testes E2E relevantes, empacotamento e smoke test passam;
- documentação de desenvolvimento e estado do projeto estão atualizados.
