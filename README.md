# Gerenciador de Campanhas de RPG

Aplicativo desktop local-first para organizar campanhas de RPG. A Fase 0 entrega a fundação técnica: Electron seguro, React, persistência SQLite, migrações, busca FTS5, backup anterior a migrações, observabilidade local, IPC tipado e empacotamento. Conforme a ordem revisada pelo adendo 01, a Fase 1 entrega campanhas, tipos de entidade, definições de campo, entidades e arquivamento.

O aplicativo não abre servidor HTTP e não exige Node.js na máquina do usuário final.

## Desenvolvimento

Pré-requisitos: Node.js 22 LTS, Corepack, Git e as ferramentas nativas exigidas pelo Electron na plataforma. O gerenciador e as versões de dependências estão fixados no repositório.

```powershell
corepack pnpm@11.24.0 install --frozen-lockfile
corepack pnpm@11.24.0 start
```

Comandos principais:

- `pnpm verify`: lint, formatação, tipos, testes unitários e de integração;
- `pnpm test:e2e`: persistência real por duas inicializações do Electron;
- `pnpm package`: gera o aplicativo desempacotado;
- `pnpm test:package`: valida o executável gerado, SQLite e FTS5;
- `pnpm make`: produz o instalador/artefato nativo da plataforma.

Por padrão os dados ficam em `userData/campaign-manager-data`. `APP_DATA_DIR` permite isolar dados em desenvolvimento e testes; `LOG_LEVEL` aceita `debug`, `info`, `warn` ou `error`. Nunca aponte `APP_DATA_DIR` para uma pasta de produção ao testar.

Consulte [configuração de desenvolvimento](docs/development/setup.md), [arquitetura e segurança](docs/architecture/overview.md) e [empacotamento](docs/release/packaging.md).

O refinamento técnico e a divisão incremental da próxima etapa estão em
[Fase 2 — Refinamento técnico](docs/development/phase-2-refinement.md).

As atividades 2.1 e 2.2 entregam a fundação persistente de relações e cronologia e o gerenciamento
completo de tipos de relação. Relações entre entidades e visualização do grafo começam na atividade
2.3.

## Estado e limites

A Fase 1 ainda não inclui relações entre entidades, etiquetas, busca textual de conteúdo, inserção rápida em massa, sessões, eventos, caixa de entrada, relógios, demandas, consequências, biblioteca de PDFs ou IA — previstos para fases seguintes. Campos do tipo `entity_reference`/`entity_reference_list` são aceitos no modelo de dados, mas ainda não são editáveis pela interface (dependem do módulo de relações). A infraestrutura FTS5 criada na Fase 0 permanece reservada para a futura busca. Assinatura de código, notarização e publicação automática dependem de certificados e credenciais de release. Os makers para Windows, macOS e Linux estão configurados, mas cada artefato deve ser produzido no respectivo sistema operacional.
