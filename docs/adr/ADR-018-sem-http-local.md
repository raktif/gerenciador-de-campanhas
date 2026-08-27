# ADR-018 — Ausência de servidor HTTP local

Estado: Aceito.

O renderer é carregado pelo mecanismo do Forge/Vite e conversa com capacidades privilegiadas somente por IPC. A distribuição não abre porta TCP nem incorpora API HTTP.
