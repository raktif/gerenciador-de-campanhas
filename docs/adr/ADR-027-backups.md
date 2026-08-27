# ADR-027 — Backups verificados antes de migrações

Estado: Aceito.

Quando há migração pendente em banco existente, uma cópia consistente é feita pela API SQLite antes da transação. O backup passa por `quick_check`; falha cancela a migração e preserva o original.
