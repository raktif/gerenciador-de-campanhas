# Fase 2 — Atividade 2.8: Captura rápida

Estado: concluída após validação independente e composição final de fechamento. Este registro cobre
somente o incremento 2.8.

## Fechamento verificado

- `pnpm verify`: lint, formatação e typecheck aprovados; 57 arquivos/182 testes unitários e 16
  arquivos/61 testes de integração aprovados.
- `pnpm test:e2e`: 9 testes E2E aprovados, incluindo a captura rápida com associação opcional e
  persistência após reinício.

## Escopo entregue

- Captura de texto obrigatório sem exigir classificação, disponível em todas as telas internas de uma
  campanha por um componente compartilhado do shell da campanha.
- Associação opcional somente a sessões `in_progress` da mesma campanha; a captura sem sessão mantém
  origem manual e a associada mantém origem de sessão.
- Persistência transacional de `inbox_items` com UUID, timestamps UTC, status inicial `new`, revisão 1
  e preservação do texto original para uso futuro como fonte.
- Canal `inbox:capture`, handler IPC com validação de remetente, entrada e saída, envelope `Result` e
  gateway/preload tipado sem expor `ipcRenderer`.
- Botão de captura e atalho `Ctrl+K` no Windows/Linux ou `Cmd+K` no macOS, sem registrar o atalho fora
  do contexto de campanha.

## Rastreabilidade

| Requisito | Implementação                                                                                                              | Evidência automatizada                                                                         |
| --------- | -------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| INB-01    | Contratos estritos, `InboxService.capture`, repositório transacional, IPC e diálogo compartilhado                          | contratos, serviço, integração, IPC/preload, modelo e `tests/e2e/quick-capture.spec.ts`        |
| INB-02    | Sessão opcional validada na campanha; trigger SQLite impede combinação cruzada; a interface consulta somente `in_progress` | serviço e integração de repositório, modelo e E2E com uma captura associada e outra sem sessão |

O E2E cria uma sessão em andamento pela interface, salva uma captura pelo botão com essa sessão e uma
segunda pelo atalho sem associação. Depois de reiniciar o Electron, ele fecha a fixture e consulta
somente a tabela `inbox_items` no banco temporário para comprovar persistência, texto, status e origem.
Essa inspeção é deliberadamente restrita ao teste: não existe gateway ou interface de listagem nesta
atividade.

## Acessibilidade verificada

- O botão anuncia o atalho por plataforma e expõe o estado/controle do diálogo.
- O diálogo possui nome e descrição, `aria-modal`, foco inicial no texto, ciclo de Tab, Escape, botão de
  fechar e restauração de foco no acionador.
- Texto, sessão opcional, carregamento, sucesso e erro recuperável possuem rótulos e regiões vivas ou
  alertas adequados; em erro, o texto digitado e a sessão escolhida permanecem disponíveis.

## Limites mantidos

Triagem, listagem, revisão, descarte, arquivamento e conversão de capturas pertencem exclusivamente à
atividade 2.9. Não foram criados controles, canais ou gateways para esses fluxos. A execução completa
`verify` e E2E foram executados e aprovados no fechamento da 2.8 e não serão repetidos sem novo risco
técnico justificado. Somente empacotamento e smoke test pertencem à 2.10.
