import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { assertionSchema } from '../../src/core/contracts/assertions';
import type { ContradictionReview } from '../../src/core/contracts/campaign-signal-engine';
import { ContradictionProvenance } from '../../src/renderer/features/signals/contradiction-review-manager';

const assertion = assertionSchema.parse({
  id: '20000000-0000-4000-8000-000000000001',
  campaignId: '10000000-0000-4000-8000-000000000001',
  subjectEntityId: '30000000-0000-4000-8000-000000000001',
  predicate: null,
  objectEntityId: null,
  statement: 'A torre está aberta.',
  value: null,
  canonState: 'accepted',
  knowledgeState: 'fact',
  visibility: 'gm',
  originKind: 'manual',
  sourceId: null,
  archivedAt: null,
  revision: 1,
  createdAt: '2026-11-14T12:00:00.000Z',
  updatedAt: '2026-11-14T12:00:00.000Z',
});
const entry: ContradictionReview['assertions'][number] = {
  assertion,
  subjectName: 'Gorel',
  objectName: null,
  sourceState: 'unlinked',
  sourceDescription: null,
  sessionTitle: null,
};
const sourceId = '40000000-0000-4000-8000-000000000001';

describe('proveniência legível do par contextual', () => {
  it('mostra origem manual sem inventar fonte ou sessão', () => {
    const markup = renderToStaticMarkup(<ContradictionProvenance entry={entry} />);
    expect(markup).toContain('Origem');
    expect(markup).toContain('Manual');
    expect(markup).toContain('Sem fonte vinculada');
    expect(markup).toContain('Não se aplica');
    expect(markup).not.toMatch(/[0-9a-f]{8}-[0-9a-f-]{27}/i);
  });
  it('mostra descrição real e título de sessão, não seus identificadores', () => {
    const markup = renderToStaticMarkup(
      <ContradictionProvenance
        entry={{
          ...entry,
          assertion: { ...assertion, sourceId, originKind: 'session', sessionId: sourceId },
          sourceState: 'available',
          sourceDescription: 'Relato original',
          sessionTitle: 'Sessão da torre',
        }}
      />,
    );
    expect(markup).toContain('Relato original');
    expect(markup).toContain('Sessão da torre');
    expect(markup).not.toMatch(/[0-9a-f]{8}-[0-9a-f-]{27}/i);
  });
  it('distingue captura manual, descrição ausente e fonte indisponível', () => {
    const captured = {
      ...entry,
      assertion: { ...assertion, sourceId },
      sourceState: 'available' as const,
    };
    expect(
      renderToStaticMarkup(
        <ContradictionProvenance
          entry={{
            ...captured,
            sourceDescription: 'Texto original da captura',
          }}
        />,
      ),
    ).toContain('Texto original da captura');
    expect(renderToStaticMarkup(<ContradictionProvenance entry={captured} />)).toContain(
      'Manual — descrição da fonte indisponível',
    );
    const markup = renderToStaticMarkup(
      <ContradictionProvenance
        entry={{
          ...captured,
          assertion: { ...captured.assertion, originKind: 'session' },
          sourceState: 'unavailable',
        }}
      />,
    );
    expect(markup).toContain('Fonte vinculada indisponível');
    expect(markup).toContain('Título da sessão indisponível');
    expect(markup).not.toContain('Sem fonte vinculada');
    expect(markup).not.toMatch(/[0-9a-f]{8}-[0-9a-f-]{27}/i);
  });
});
