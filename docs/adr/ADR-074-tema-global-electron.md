# ADR-074 — Tema global na fronteira Electron

Estado: Aceito.

A preferência `appearance.theme` é global, persistida em `app_settings` e alterada com revisão
otimista. O processo main a lê antes de criar a janela, aplica `nativeTheme` antes da criação da
janela, usa o fundo inicial coerente e mantém
sincronizados `nativeTheme`, `BrowserWindow.backgroundColor` e o item nativo
`Exibir > Modo Noturno`.

O renderer acessa apenas os canais nomeados `appearance:get-theme` e `appearance:set-theme` pela
API tipada do preload. Entradas e saídas atravessam contratos Zod estritos e remetentes IPC são
autorizados pelo `webContents`. Nenhum objeto Electron ou canal IPC bruto é exposto ao renderer.

A aparência do shell só muda depois que a gravação CAS é confirmada. Se uma ação do menu falhar,
o estado visual do menu e da janela retorna ao último tema sincronizado, sem depender de uma nova
leitura potencialmente indisponível. Um diálogo nativo informa, de forma segura, que não foi
possível alterar a aparência e que a configuração anterior foi mantida. A sincronização do tema no
DOM pertence à camada do renderer e não faz parte desta decisão de fronteira.
