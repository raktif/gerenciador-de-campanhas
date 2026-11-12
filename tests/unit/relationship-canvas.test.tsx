import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import {
  RelationshipCanvas,
  RelationshipLayoutUnavailableNotice,
  relationshipLoopLabelStyle,
  toPersistedNodePosition,
} from '../../src/renderer/features/relationships/relationship-canvas';
import type { RelationshipCanvasModel } from '../../src/renderer/features/relationships/relationship-canvas-model';

describe('RelationshipCanvas', () => {
  it('renders a bounded, localized and keyboard-focusable graph region', () => {
    const model: RelationshipCanvasModel = {
      nodes: [
        {
          id: 'entity-1',
          type: 'default',
          position: { x: 0, y: 0 },
          data: { label: 'Aventureira', fullLabel: 'Aventureira', central: true, pinned: false },
          focusable: true,
          draggable: false,
          connectable: false,
          selected: true,
          ariaLabel: 'Entidade central: Aventureira',
        },
      ],
      edges: [],
    };

    const markup = renderToStaticMarkup(
      <RelationshipCanvas
        automaticModel={model}
        model={model}
        onAutoLayout={() => Promise.resolve(true)}
        onResetLayout={() => Promise.resolve(true)}
        onRetry={() => Promise.resolve(true)}
        onSaveNodePosition={() => Promise.resolve(true)}
        onSaveViewport={() => Promise.resolve(true)}
        persistenceAvailable
        persistenceStatus={{ phase: 'idle', message: '' }}
        viewport={{ x: 10, y: 20, zoom: 1 }}
      />,
    );

    expect(markup).toContain('data-testid="relationship-canvas"');
    expect(markup).toContain('aria-label="Mapa visual da vizinhança"');
    expect(markup).toContain('aria-label="Entidades e relações da vizinhança"');
    expect(markup).toContain('Use Tab para navegar pelo mapa');
    expect(markup).toContain('Ferramentas do mapa de relações');
    expect(markup).toContain('Organizar automaticamente');
    expect(markup).toContain('Restaurar layout');
    expect(markup).toContain('react-flow__node-default selected');
    expect(markup).not.toContain('React Flow attribution');
    expect(markup).not.toContain('>React Flow</a>');
  });

  it('informa indisponibilidade, oferece retry e bloqueia ações mutáveis', () => {
    const model: RelationshipCanvasModel = {
      nodes: [
        {
          id: 'entity-1',
          type: 'default',
          position: { x: 0, y: 0 },
          data: {
            label: 'Aventureira',
            fullLabel: 'Aventureira',
            central: true,
            pinned: false,
          },
        },
      ],
      edges: [],
    };
    const canvasMarkup = renderToStaticMarkup(
      <RelationshipCanvas
        automaticModel={model}
        model={model}
        onAutoLayout={() => Promise.resolve(false)}
        onResetLayout={() => Promise.resolve(false)}
        onRetry={() => Promise.resolve(false)}
        onSaveNodePosition={() => Promise.resolve(false)}
        onSaveViewport={() => Promise.resolve(false)}
        persistenceAvailable={false}
        persistenceStatus={{ phase: 'idle', message: '' }}
        viewport={{ x: 0, y: 0, zoom: 1 }}
      />,
    );
    const noticeMarkup = renderToStaticMarkup(
      <RelationshipLayoutUnavailableNotice onRetry={() => undefined} />,
    );

    expect(canvasMarkup.match(/disabled=""/g)?.length).toBe(6);
    expect(noticeMarkup).toContain('A persistência está indisponível');
    expect(noticeMarkup).toContain('Tentar novamente');
  });

  it('propaga o pin do modelo ao payload de persistência', () => {
    expect(
      toPersistedNodePosition({
        id: 'entity-1',
        type: 'default',
        position: { x: 125, y: -40 },
        data: { label: 'Aventureira', fullLabel: 'Aventureira', central: true, pinned: true },
      }),
    ).toEqual({
      entityId: 'entity-1',
      x: 125,
      y: -40,
      width: 184,
      height: 64,
      pinned: true,
    });
  });

  it('gera payload de auto-layout com pin limpo', () => {
    expect(
      toPersistedNodePosition({
        id: 'entity-1',
        type: 'default',
        position: { x: 48, y: 48 },
        data: { label: 'Aventureira', fullLabel: 'Aventureira', central: true, pinned: false },
      }),
    ).toMatchObject({ x: 48, y: 48, pinned: false });
  });

  it('aplica a cor da relação também ao rótulo de autorrelação', () => {
    expect(
      relationshipLoopLabelStyle({ color: '#DC143C', fill: '#DC143C', fontWeight: 600 }, 40, 20),
    ).toEqual({
      color: '#DC143C',
      fill: '#DC143C',
      fontWeight: 600,
      transform: 'translate(-50%, -50%) translate(40px,20px)',
    });
  });
});
