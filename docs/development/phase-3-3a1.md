# Fase 3A.1 — Contratos e fundação persistente

A versão 22 adiciona apenas `campaign_signals` e `signal_evidence`. Os tipos e estados aceitos
seguem o Adendo Técnico 03 v2 §§28.2–28.5. O score persistido é inteiro de -5 a +5; a severidade
interna é `low`, `medium` ou `high`, com rótulos pt-BR disponíveis no contrato; e o único
`generator_kind` aceito nesta fundação é `deterministic`.

Os registros de evidência têm chave estrangeira para o sinal e são removidos com ele. Por decisão do
responsável, os únicos alvos nesta fundação são `entity`, `relationship`, `assertion`, `event`,
`session` e `note`, mapeados às respectivas tabelas existentes. Triggers validam existência e
`campaign_id` compatível ao inserir/atualizar evidências, impedem mudança de campanha que quebre
vínculos existentes e removem a evidência ao excluir seu alvo. Arquivar o alvo não remove a
referência.

As guardas de identificador usam comparação null-safe (`IS NOT`), inclusive para impedir `id=NULL`
em alvos referenciados. Inserts que conflitem com um alvo referenciado são recusados, inclusive
`INSERT OR REPLACE`, independentemente de `recursive_triggers`. A proteção cobre o ID nos seis
tipos e a chave natural `(campaign_id, sequence_number)` de sessões. Substituições de alvos
referenciados devem usar UPDATE, não REPLACE; inserts/REPLACE sem conflito com evidências continuam
permitidos. Nenhuma configuração global de conexão foi modificada.
As guardas também impedem `UPDATE OR REPLACE` que sobrescreva outro alvo referenciado pelo ID ou
pela chave natural de sessão.

Scores, revisões e ordenação são inteiros também na camada SQLite. UUIDs das estruturas usam a
mesma forma canônica minúscula e hífens exatos nos contratos e no banco. Timestamps persistidos
seguem o formato UTC ISO com milissegundos (`YYYY-MM-DDTHH:mm:ss.sssZ`); `dismissed_until` permanece
nullable, mas quando presente precisa ser um timestamp válido. Os CHECKs rejeitam explicitamente
resultados NULL da conversão SQLite, e os testes verificam falha de constraint (não somente uma
exceção de bind). O conjunto de whitespace do trim SQL corresponde ao trim ECMAScript/Zod.
Revisão é limitada a `1..9007199254740991` e ordenação a `0..9007199254740991`, para garantir
representação inteira segura no gateway TypeScript futuro.

Os limites de `role` (100) e `description` (2000) contam **pontos de código Unicode após trim**,
como `length(TEXT)` do SQLite, não unidades UTF-16 nem grafemas. Por exemplo, 100 emojis
suplementares são aceitos em `role`; 101 são rejeitados. NUL (`U+0000`) é rejeitado nesses dois
campos pelo contrato e por CHECKs SQL/Drizzle com `instr(texto, char(0)) = 0`: `length(TEXT)`
para no primeiro NUL e, sozinho, não garante o limite. A normalização de whitespace e a
semântica nullable de `description` permanecem inalteradas.

A v22 ainda está em revisão pré-entrega; as correções SQL das rodadas anteriores alteraram seu
checksum, sem mudar migrações 1–21. A correção inicial dos limites Unicode mudou somente o
contrato; a correção posterior de NUL altera SQL/Drizzle e, portanto, o checksum calculado da
v22. Manifesto e registro permanecem inalterados. Banco v21 migra normalmente com backup
pré-migração. Um banco descartável que já
aplicou uma versão anterior de v22 não tem upgrade automático para esta revisão: o checksum
divergente é recusado pelo bootstrap, sem apagar dados. Não usar esses bancos de QA como produção.

Validação e aprovação permanecem responsabilidade do QA independente. Os testes focais exercitam
SQL real com `foreign_keys=1` e `recursive_triggers=0`, além de executar os CHECKs do Drizzle.
Na rodada Unicode, os novos arquivos `signal-evidence-unicode-contracts.test.ts` (unit) e
`signal-evidence-unicode.test.ts` (integration) cobrem ASCII, BMP, caracteres suplementares e texto
misto nos limites e acima deles, trim, vazio e nullable, além de NUL (inclusive os payloads
de overflow do QA) em INSERT e UPDATE na persistência. A próxima rodada de QA deve se restringir
a esses arquivos, às reproduções/boundaries Unicode/NUL e aos seletores da fundação correspondentes
ao diff SQL/Drizzle; não repetir outras suítes aprovadas inalteradas.

Esta fundação não implementa detecção, cálculo de score, transições de estado, recálculo,
serviços, IPC ou interface.
