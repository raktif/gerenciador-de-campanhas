# Arquitetura e segurança

O processo principal controla ciclo de vida, SQLite, filesystem, logs e janelas. O preload oferece ao renderer apenas um gateway IPC mínimo e tipado. O renderer React não acessa Node.js, Electron ou o banco diretamente.

As janelas usam `contextIsolation`, sandbox e `webSecurity`, com `nodeIntegration` desativado. Navegação externa, novas janelas e webviews são bloqueadas. Toda chamada IPC valida remetente, entrada e saída e retorna um envelope de resultado seguro. A política de conteúdo impede scripts e conexões externas; não existe servidor HTTP local.

O SQLite usa WAL, foreign keys, busy timeout e migrações versionadas com checksum. FTS5 é verificado no bootstrap. Antes de alterar um banco existente, a aplicação usa a API de backup do SQLite e confirma a integridade da cópia. Segredos futuros deverão usar `safeStorage`; a Fase 0 não persiste credenciais.

Decisões detalhadas ficam em [docs/adr](../adr/README.md).
