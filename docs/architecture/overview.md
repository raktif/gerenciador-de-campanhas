# Arquitetura e segurança

O processo principal controla ciclo de vida, SQLite, filesystem, logs e janelas. O preload oferece ao renderer apenas um gateway IPC mínimo e tipado. O renderer React não acessa Node.js, Electron ou o banco diretamente.

As janelas usam `contextIsolation`, sandbox e `webSecurity`, com `nodeIntegration` desativado. Navegação externa, novas janelas e webviews são bloqueadas. Toda chamada IPC valida remetente, entrada e saída e retorna um envelope de resultado seguro. A política de conteúdo impede scripts e conexões externas; não existe servidor HTTP local.

O SQLite usa WAL, foreign keys, busy timeout e migrações versionadas com checksum. FTS5 é verificado no bootstrap. Antes de alterar um banco existente, a aplicação usa a API de backup do SQLite e confirma a integridade da cópia. Segredos futuros deverão usar `safeStorage`; a Fase 0 não persiste credenciais.

## Estado arquitetural da Fase 2

Os agregados entregues até 2.9 — relações, afirmações, notas, sessões, eventos, cronologia e Caixa
de Entrada — continuam no processo principal, com contratos Zod estritos, revisão otimista,
transações para operações compostas e isolamento obrigatório por `campaignId`. A navegação interna
da campanha fica no renderer e só troca telas já implementadas; ela não cria rotas, IPC ou dados
para funcionalidades futuras. Campanhas arquivadas ou na lixeira não expõem módulos mutáveis.

O shell do renderer mantém a campanha selecionada, marca o destino atual semanticamente e move o
foco ao título após trocar de módulo. Estados de carregamento, vazio, erro recuperável e operação
ocupada permanecem responsabilidade de cada tela. A Caixa de Entrada mantém seus diálogos com foco
contido e fundo inerte; o renderer continua sem acesso privilegiado.

A Fase 2 ainda não introduz Relógios, Demandas, Consequências, portabilidade, Biblioteca/PDFs ou
IA. Esses limites preservam o modo local sem IA e sem rede: não há servidor HTTP, provedor de IA,
modelo ou chamada externa necessária aos fluxos atuais. O fechamento 2.10E deverá reexecutar
verificações, pacote e smoke test antes de declarar a fase completa.

Decisões detalhadas ficam em [docs/adr](../adr/README.md).
