# Configuração de desenvolvimento

## Versões de referência

- Node.js 22 LTS e pnpm 11.24.0;
- Electron 43.4.0 e Electron Forge 7.11.2;
- React 19.2.8, Vite 8.2.2 e TypeScript 6.0.3;
- SQLite embutido pelo better-sqlite3 13.0.3 e Drizzle ORM 0.45.2.

Execute `corepack pnpm@11.24.0 install --frozen-lockfile` e depois `pnpm start`. O TypeScript usa modo estrito. Não defina `ELECTRON_RUN_AS_NODE`; essa variável transforma o binário Electron em um processo Node. Também não desative validação TLS para instalar dependências.

## Dados locais

A aplicação cria pastas separadas para banco, documentos da biblioteca, anexos, miniaturas, backups automáticos e manuais, exportações, logs, segredos, jobs, temporários e configuração. Para um ambiente descartável:

```powershell
$env:APP_DATA_DIR = "$PWD/tmp/development-data"
$env:LOG_LEVEL = "debug"
pnpm start
```

O log é local, rotativo e redige campos sensíveis. Migrações são transacionais e um banco existente recebe backup SQLite verificado antes da primeira migração pendente.

## Verificação

`pnpm verify` executa verificações estáticas e testes sem abrir o Electron. `pnpm test:e2e` compila e inicia o aplicativo duas vezes para comprovar persistência. Para validar a distribuição, rode `pnpm package` seguido de `pnpm test:package`.
