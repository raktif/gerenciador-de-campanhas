# Correções de feedback manual de UX — Fase 3B

## Escopo e aprovação

Este registro documenta as correções autorizadas para os achados manuais relacionados às
definições de campo, formulários de Entidades, Relógios, Demandas, Fios Abertos e à linguagem da
interface. Não inicia 3B.4/3C. A QA independente aprovou tecnicamente as correções para liberação
da UX manual; a avaliação de UX de toda a 3B permanece pendente para o usuário.

## Decisões de produto aplicadas

- Progresso mantém valores legados como número atual, sem presumir denominador. Um valor numérico
  antigo — inclusive negativo ou decimal — pode ser preservado ao editar outros campos; ao informar
  um total, o atual legado exato continua identificável. Valores novos exigem atual e total, com
  atual não negativo, total positivo e atual menor ou igual ao total.
- Campos `structured` passam a `rich_text`. A decisão posterior de produto **substitui o pedido
  original de conversão preservadora**: os antigos valores JSON devem ser apagados no upgrade
  da v33, sem backup integral novo. O editor Rich Text mantém formatação e tabelas; a renderização
  limita elementos e atributos permitidos.
- Seleções simples e múltiplas usam opções separadas por vírgula e ordenadas em pt-BR. Os valores
  selecionados são gravados como escolha ou lista de escolhas, não como texto digitado pelo usuário.
- Relógios com origem Sessão usam o seletor paginado de sessões existente. A sessão escolhida é
  mantida separada do identificador interno de fonte; o repositório cria/reutiliza a fonte de sessão
  na mesma transação e devolve a sessão associada para edição.
- Identificadores de domínio e persistência continuam estáveis em inglês; os rótulos destinados ao
  usuário são apresentados em pt-BR.

## Persistência e compatibilidade

As migrações SQL 1–33 e seus checksums permanecem imutáveis. A v33 limpa, uma única vez:

- todo `field_values.value_json`, incluindo seleções múltiplas, pares de progresso e JSON escalar
  ou `null`;
- qualquer `value_text` que seja integralmente um objeto ou uma lista JSON válida, inclusive em
  campo de texto comum;
- todos os valores existentes dos tipos Estruturado e Rich Text, **inclusive Rich Text autoral**,
  sem tentar comprovar a origem ou distinguir edições posteriores.

Entidades, definições, opções e valores padrão não são apagados. Fora dos alvos acima, são
preservados seleção simples, progresso numérico, booleanos, datas e textos, inclusive textos que
são JSON escalar ou têm apenas um trecho que parece JSON. O campo fica vazio: a linha é removida,
exceto quando uma Demanda a referencia. Nesse caso, mantém-se o identificador com texto vazio,
preservando a Demanda, seu histórico e a proteção do vínculo. Valores criados após a v33 não
passam pela limpeza.

No upgrade que inclui a v33, o runner não cria backup integral antes do lote nem entre migrações.
Apaga os valores antes da primeira migração pendente entre v30 e v33, executa o SQL histórico e
registra seus checksums sem preencher o estágio de recuperação v31/v32. Na v33, esvazia integralmente
`structured_value_migration_snapshots`, inclusive linhas órfãs e linhas com `source_json` nulo,
pois elas também podem guardar HTML derivado. Ausência ou divergência de backups não
bloqueia a limpeza, e nenhum backup anterior é consultado ou alterado nesse caminho. O lote roda
em uma transação, com verificação de chaves estrangeiras, `secure_delete` e journal SQLite
transitório de rollback, sem reter um WAL pré-limpeza. A política normal de backup permanece para
lotes que não incluem a v33 nem a v34.

A decisão posterior autoriza a v34 aditiva a substituir cópias em Demandas, sinais e evidências
por “Conteúdo removido pela limpeza de campos.” somente quando a origem exata é comprovável.
No lote v33+v34, a v34 identifica antes da limpeza os sinais determinísticos gerados a partir dos
valores atingidos e retém apenas IDs em uma tabela temporária. Para uma Demanda aceita, a v34
confronta o vínculo protegido com o valor vazio, campanha, entidade, definição, ID determinístico,
regra e snapshot original. Limpa a necessidade copiada, a necessidade do `acceptedPayload`,
o resumo gerado e a descrição da evidência de origem, sem apagar linhas ou reescrever IDs,
revisões, estados, vínculos e histórico. Campos autorais independentes não são substituídos
por coincidência de texto. Em um banco que já chegou à v33, sinais avulsos sem o vínculo que
comprove a limpeza são preservados. Não há novo backup integral nem mesmo no upgrade apenas v34.
As regressões reproduzem a aceitação de Need JSON, cobrem as duas origens de upgrade, proteção
dos vínculos, cópias sem prova, rollback conjunto e ausência de backup. Não houve UX manual.

Progresso novo continua exigindo par atual/final também no serviço, e o usuário pode trocar
explicitamente `-2.5` por `2/10` sem carregar o marcador legado.
Não foi necessária coluna nova para Relógios: a sessão continua representada pela fonte de sessão
existente, e o contrato de saída inclui seu identificador de sessão resolvido.

## Superfícies alteradas

- Formulários e apresentação de campos personalizados: tipo, opções de seleção, progresso, Rich
  Text e layout dos campos longos.
- Metadados de Relógios, revisão de Demandas e lista de Fios Abertos.
- Textos apresentados pela interface e mensagens de erro abrangidas pelas telas alteradas.

## Revalidação técnica e limitação aceita

A QA independente revalidou a limpeza v33/v34, as cópias derivadas em Demandas/Sinais e as
correções transversais sem identificar problemas funcionais pendentes. Foram aprovados os testes
focais reportados: 35 integrações SQLite, 9 unitários e 1 E2E, além de TypeScript, ESLint,
Prettier aplicável e `git diff --check`. Nenhum banco real foi aberto; UX manual não foi executada.

O checksum canônico LF da v30 foi confirmado como
`f1f37e9cf5e2d8dff6f82c92230df8afde7902458c0950a0268ebd2d8a1df30c`. Não há baseline Git nem
cópia anterior disponível para comparar os checksums das migrações v31–v33. O responsável aceitou
registrar essa limitação; a aprovação não afirma que a imutabilidade histórica dessas três
migrações foi verificada.

## UX manual pendente

O QA independente deve revisar segurança/conversão Rich Text, preservação de dados legados,
validação de opções e progresso no contrato e na persistência, isolamento da sessão por campanha,
lista de sugestões após conversão, layouts responsivos e textos acessíveis. Após QA, a UX manual
continua a cargo do usuário; os itens a avaliar incluem alinhamento dos rótulos/controles, seleção
de opções, leitura de progresso, edição Rich Text e tabelas, seleção de sessão, legibilidade da
revisão de Demandas e interações de Fios Abertos. Nenhum desses itens é marcado como aprovado por
este documento.

## Correções focais após devolução de QA

- Implementação anterior (superada pela v33): migrações 31/32 aditivas com recuperação de conteúdo
  token-preserving com backups pré-v30; conteúdo alterado no Rich Text é preservado, conteúdo sem
  proveniência segura bloqueia atomicamente o lote.
- O domínio, a interface e o serviço preservam o atual legado exato, inclusive `-2.5`, e só aceitam
  números sem par no update quando correspondem ao número já persistido. O serviço não aceita esse
  formato na criação.
- Opções de seleção são ordenadas em pt-BR na validação do contrato, no serviço e no repositório,
  inclusive quando a gravação não passa pelo formulário. Novas opções não aceitam vírgulas, e arrays
  legados com vírgulas são preservados e selecionados como valores únicos sem reserialização
  ambígua.
- O progresso legado pode trocar explicitamente seu atual por um par atual/final válido sem carregar
  o marcador que só autoriza preservar o número antigo exato; os limites numéricos exibidos aceitam
  os mesmos decimais positivos que o domínio.
- Demandas mostram a necessidade uma única vez abaixo do subtítulo e apresentam regra/papel em
  português, inclusive ao ler snapshots históricos. Erros de JSON em Afirmações usam mensagem fixa
  localizada. O editor Rich Text recebe estilos visíveis de tabela/lista; o aviso de total indefinido
  aparece apenas para valor legado existente e explica que outros campos podem ser salvos.
- Revalidação posterior: a v32 enumera todos os backups SQLite pré-v30 elegíveis e valida campanha,
  entidade, definição, versão de schema e JSON de origem. Fontes divergentes que possam corresponder
  ao conteúdo atual bloqueiam a migração antes das escritas; a comparação semântica de HTML aceita
  apenas normalizações textuais de serialização do DOM, sem ignorar estrutura ou atributos. A
  proveniência já gravada pela v31 não substitui um backup pré-v30 independente.
- Regressão atual: o E2E passa HTML com CRLF e aspas pelo editor real e verifica que o startup v33
  remove o Rich Text existente e o snapshot, sem depender de equivalência HTML. As integrações
  SQLite cobrem upgrades v29–v32, rollback, preservação de dados fora do escopo, Rich Text autoral
  gravado depois da limpeza, backups externos conflitantes e imutáveis e a política normal de backup.
- O snapshot de Demandas omite a evidência que repete o valor Need, mantendo a origem e a justificativa;
  o formulário de progresso também inclui exemplos visíveis `2/4` e `75/100`.
- Formulários de Entidades mantêm os controles alinhados pela base, com texto longo e Rich Text
  no fim. A apresentação de Demandas mantém regras/papéis em pt-BR, e o erro de JSON inválido em
  Afirmações não expõe o texto do parser. O editor Rich Text mantém estilos de tabelas e listas.
