# ADR-022 — Módulos nativos e prebuilds

Estado: Aceito.

Dependências nativas devem ter prebuild compatível com a versão Electron suportada e ser reconstruíveis pelo Forge. O ASAR desempacota binários nativos e o smoke test da distribuição detecta incompatibilidades ABI.
