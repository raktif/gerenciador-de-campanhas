# ADR-019 — Separação main, preload e renderer

Estado: Aceito.

Main detém privilégios, preload expõe uma API mínima e renderer permanece sandboxed. Canais IPC são explícitos, validados e retornam erros sanitizados.
