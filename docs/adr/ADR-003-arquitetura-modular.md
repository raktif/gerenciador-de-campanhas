# ADR-003 — Arquitetura modular

Estado: Aceito.

Contratos, configuração, persistência, serviços, integração Electron e interface são módulos separados. Dependências fluem do renderer para contratos IPC e do processo principal para serviços e repositórios, sem acesso reverso ao renderer.
