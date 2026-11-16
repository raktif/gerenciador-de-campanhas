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
$env:APP_ELECTRON_USER_DATA_DIR = "$PWD/tmp/development-electron-profile"
$env:LOG_LEVEL = "debug"
pnpm start
```

`APP_DATA_DIR` isola os dados da aplicação; `APP_ELECTRON_USER_DATA_DIR` também
isola o perfil e os dados de sessão do Electron. Defina ambas para testes que
não devem acessar o perfil existente.

O log é local, rotativo e redige campos sensíveis. Migrações são transacionais e um banco existente recebe backup SQLite verificado antes da primeira migração pendente.

### Erro de checksum na inicialização

Erro de checksum indica divergência entre uma migração registrada e a definição aceita
pelo aplicativo; **não significa, por si só, banco corrompido nem necessidade de apagar
dados**. Preserve o banco e registre a mensagem, versão do aplicativo e versão da migração
para diagnóstico. Não edite `schema_migrations`, não exclua dados/caches e não altere a
configuração global do Git para contornar a validação.

A diferença exclusivamente LF/CRLF é aceita nas migrações de checksum dinâmico, com
checksum canônico LF em bancos novos e sem regravar registros existentes. Uma alteração
no SQL atual de uma migração dinâmica já registrada (por exemplo, uma versão anterior
de desenvolvimento da v22) é recusada; hashes desconhecidos e finais de linha mistos
também são recusados. v6 e v8–15 preservam os hashes fixos históricos, sem validação
dinâmica do SQL atual dessas versões já registradas. Consulte a
[política de compatibilidade](../architecture/overview.md#compatibilidade-lfcrlf-das-migrações).

Testes focais, sem abrir Electron e usando bancos temporários descartáveis:

```powershell
rtk corepack pnpm@11.24.0 exec vitest run tests/unit/migration-checksum.test.ts
rtk corepack pnpm@11.24.0 exec vitest run --config vitest.integration.config.mts tests/integration/migration-checksum.test.ts
```

## Verificação

`pnpm verify` executa verificações estáticas e testes sem abrir o Electron. `pnpm test:e2e` compila e inicia o aplicativo duas vezes para comprovar persistência. Para validar a distribuição, rode `pnpm package` seguido de `pnpm test:package`.
