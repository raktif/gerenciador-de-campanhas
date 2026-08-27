# Empacotamento e release

O Electron Forge gera pacotes com ASAR, desempacota módulos nativos e aplica fuses de produção. O maker Squirrel atende Windows, DMG atende macOS, DEB atende Linux e ZIP complementa macOS/Linux. A compilação deve ocorrer no sistema operacional de destino.

```powershell
pnpm verify
pnpm test:e2e
pnpm package
pnpm test:package
pnpm make
```

O smoke test abre o binário empacotado com uma pasta temporária, aguarda a inicialização persistente, encerra o processo controlado pelo harness e inspeciona externamente o banco criado, schema e FTS5. Artefatos ficam em `out/` e não entram no Git.

Antes de uma release pública: atualizar a versão, executar a matriz de CI, testar instalação/atualização/desinstalação em máquina limpa, configurar assinatura e notarização e registrar checksums. Publicação permanece desabilitada até existirem repositório de distribuição e credenciais definidos.
