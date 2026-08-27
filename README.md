# Gerenciador de Campanhas de RPG

Aplicativo desktop local-first para organizar campanhas de RPG. A Fase 0 entrega a fundação técnica: Electron seguro, React, persistência SQLite, migrações, busca FTS5, backup anterior a migrações, observabilidade local, IPC tipado e empacotamento.

O aplicativo não abre servidor HTTP e não exige Node.js na máquina do usuário final. Nesta fase, a tela técnica permite verificar o ambiente, gravar e reler um valor persistente e abrir a pasta local de dados.

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

## Estado e limites

A Fase 0 não inclui ainda campanhas, personagens ou conteúdo de jogo. Assinatura de código, notarização e publicação automática dependem de certificados e credenciais de release. Os makers para Windows, macOS e Linux estão configurados, mas cada artefato deve ser produzido no respectivo sistema operacional.
