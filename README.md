# Gerenciador de Campanhas de RPG

Aplicativo desktop local-first para organizar campanhas de RPG. A Fase 0 entrega a fundação técnica: Electron seguro, React, persistência SQLite, migrações, busca FTS5, backup anterior a migrações, observabilidade local, IPC tipado e empacotamento. Conforme a ordem revisada pelo adendo 01, a Fase 1 entrega campanhas, tipos de entidade, definições de campo, entidades e arquivamento. A Fase 2 está concluída: relações, vizinhança, afirmações, notas, sessões, eventos, cronologia, captura rápida, triagem da Caixa de Entrada e integração final.

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

Na atividade 2.10, as subatividades 2.10A–2.10E foram concluídas em 2026-09-21. A rodada verificável
aprovou `pnpm verify` (196 unitários e 66 integrações), 12 E2E, pacote Windows x64 e smoke test
(schema 15, SQLite 3.53.4 e FTS5). Consulte a [rastreabilidade da
2.10](docs/development/phase-2-activity-2.10.md) e o [refinamento da
Fase 2](docs/development/phase-2-refinement.md).

## Estado e limites

O produto disponível inclui o escopo concluído até a Fase 2. Não
inclui Relógios, Demandas, Consequências ou gerador determinístico (Fase 3); histórico geral,
exportação, importação, restauração ou backup de campanha (Fase 4); Biblioteca/PDFs (Fase 5); nem IA
ou provedores (Fases 6+). A infraestrutura FTS5 criada na Fase 0 permanece reservada para a futura
busca. Assinatura de código, notarização e publicação automática dependem de certificados e
credenciais de release. Os makers para Windows, macOS e Linux estão configurados, mas cada artefato
deve ser produzido no respectivo sistema operacional.

## Fechamento da Fase 2

A 2.10E foi executada em 2026-09-21 com dados descartáveis em `APP_DATA_DIR` e IA desligada:

```powershell
pnpm verify
pnpm test:e2e
pnpm package
pnpm test:package
```

`pnpm verify` cobriu lint, formatação, tipos e testes unitários/integração; o E2E comprovou
persistência real; `pnpm package` gerou o aplicativo desempacotado Windows x64; e
`pnpm test:package` confirmou startup, SQLite 3.53.4 e FTS5 com schema 15. `pnpm make` continua
reservado à produção de artefato nativo da plataforma correspondente.

Os fluxos da Fase 2 devem funcionar sem rede, provedor, runtime ou modelo de IA. O aplicativo não
deve iniciar servidor HTTP nem fazer chamadas externas para esses fluxos.
