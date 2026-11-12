# ADR-067 — Canvas persistente de Relações

Estado: Aceito.

## Contexto

A visualização SVG existente apresenta a vizinhança de uma entidade, mas não oferece movimentação
dos nós, zoom, pan nem persistência. Implementar essas interações manualmente duplicaria mecanismos
complexos de gestos, viewport, arestas e acessibilidade.

## Decisão

O canvas utilizará `@xyflow/react` 12.12.1 para nós, arestas Bézier, marcadores direcionais, drag,
zoom, pan, ajuste à tela e suporte de teclado. O auto-layout utilizará `@dagrejs/dagre` 3.1.3. As
duas dependências são MIT, empacotadas localmente pelo Vite e não dependem de rede ou telemetria em
execução.

Uma única visualização padrão de campanha preservará o mapa mental entre filtros e mudanças da
entidade central. O modelo também admite visualizações de vizinhança vinculadas a uma entidade para
evolução futura.

As posições e o viewport serão persistidos em `relationship_views` e
`relationship_view_nodes`. A revisão otimista pertence à visualização agregadora: toda mutação de
posição, viewport, auto-layout ou reset deverá comparar e incrementar `relationship_views.revision`
atomicamente. O banco também impede que uma visualização referencie entidades de outra campanha.

O renderer calculará o auto-layout, por ser uma decisão de apresentação. O processo main continuará
responsável por validar contratos estritos, campanha, entidades, revisão e transação antes de
persistir qualquer coordenada. O renderer não receberá SQLite, `ipcRenderer` ou APIs de Node.js.

A lista textual acessível continuará disponível como alternativa integral ao canvas visual.

## Consequências

- as bibliotecas serão fixadas por versão e auditadas nas atualizações;
- nenhum salvamento ocorrerá a cada pixel: posições serão gravadas ao concluir o movimento e o
  viewport ao encerrar a interação;
- múltiplas views, edição de relações pelo canvas, undo/redo e layouts colaborativos permanecem fora
  do escopo desta atividade;
- a atribuição visual padrão do React Flow será preservada enquanto não houver decisão específica em
  contrário.
