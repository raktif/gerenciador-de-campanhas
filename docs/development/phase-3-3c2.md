# Fase 3C.2 — Encerramento de sessão e preparação

Implementação técnica da 3C.2, pendente de validação independente do QA e de UX manual.

## Escopo entregue

- Migração aditiva v36 com progresso persistente por sessão em `session_closing_steps`.
- Oito etapas independentes: Caixa de Entrada, Eventos, Mudanças, Relógios, Consequências,
  Fios Abertos, Sinais e preparação da próxima sessão.
- Estados `pending`, `completed` e `skipped`, com revisão otimista e retomada.
- Encerramento rápido explícito, que marca apenas etapas pendentes como ignoradas.
- Seleção persistente e explícita de elementos relevantes em `session_preparation_items`.
- A confirmação da etapa Sinais chama o `CampaignSignalService` no processo principal antes de
  persistir `completed`; falha no recálculo mantém a etapa pendente e retorna erro recuperável.
- Candidatos determinísticos derivados de Fios Abertos, Relógios ativos, Demandas disponíveis/ativas
  e Sinais revisáveis; nenhuma alteração automática de cânone.
- Contratos Zod, serviço, persistência nativa, IPC, gateway preload e interface integrada ao editor
  de sessão.

Cada operação de etapa é gravada individualmente. Falhas posteriores não desfazem etapas já
confirmadas. O encerramento rápido também executa atualizações por etapa e não promete atomicidade
de uma operação narrativa longa.

## Verificações desta entrega

- `pnpm typecheck`: passou.
- Testes direcionados de contratos e integração/migração: bloqueados antes da coleta pelo ambiente
  Vitest com `spawn EPERM` ao carregar `vitest.config.mts`.
- E2E: pendente para o QA.
- UX manual: pendente para o responsável pelo projeto após aprovação técnica do QA.
