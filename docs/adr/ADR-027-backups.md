# ADR-027 — Backups verificados antes de migrações

Estado: Aceito.

Quando há migração pendente em banco existente, uma cópia consistente é feita pela API SQLite antes da transação. O backup passa por `quick_check`; falha cancela a migração e preserva o original.

Exceção autorizada: lotes que contêm a v33 (limpeza de valores de campos de Entidades) ou a v34
(limpeza de cópias derivadas com origem comprovada) não criam backup integral antes ou entre
migrações. Isso evita manter uma nova cópia dos valores que serão apagados. Backups preexistentes
não são alterados; lotes sem ambas seguem a política normal. Consulte
[a decisão e o escopo da limpeza](../development/manual-ux-feedback-3b.md).
