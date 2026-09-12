import { describe, expect, it } from 'vitest';
import type { TimelineEntry } from '../../src/core/contracts/timeline';
import {
  linkSummary,
  originLabel,
  rolesForEntity,
  timelineGroupLabel,
} from '../../src/renderer/features/timeline/timeline-model';

const entityId = '30000000-0000-4000-8000-000000000001';

describe('modelo de apresentação da cronologia', () => {
  it('mostra o grupo já ordenado sem interpretar a referência temporal livre', () => {
    expect(timelineGroupLabel(entry(3))).toBe('Sessão 3');
    expect(timelineGroupLabel(entry(null))).toBe('Evento sem sessão associada');
  });

  it('preserva papéis e ordem dos vínculos e destaca os papéis da entidade consultada', () => {
    const item = entry(1);
    expect(rolesForEntity(item, entityId)).toEqual(['Participante', 'Testemunha']);
    expect(linkSummary(item)).toBe('Participante (ordem 1) · Testemunha (ordem 2)');
    expect(originLabel(item.event.originKind)).toBe('Manual');
  });
});

function entry(sessionSequenceNumber: number | null): TimelineEntry {
  return {
    event: {
      id: '60000000-0000-4000-8000-000000000001',
      campaignId: '00000000-0000-4000-8000-000000000001',
      sessionId: sessionSequenceNumber === null ? null : '70000000-0000-4000-8000-000000000001',
      title: 'A ponte desaba',
      descriptionMarkdown: null,
      eventOrder: 0,
      occurredAtLabel: 'Quarta noite',
      canonState: 'accepted',
      knowledgeState: 'fact',
      visibility: 'gm',
      originKind: 'manual',
      sourceId: null,
      createdAt: '2026-09-11T12:00:00.000Z',
      updatedAt: '2026-09-11T12:00:00.000Z',
      archivedAt: null,
      revision: 1,
    },
    sessionSequenceNumber,
    links: [
      {
        eventId: '60000000-0000-4000-8000-000000000001',
        entityId,
        role: 'participant',
        sortOrder: 0,
      },
      { eventId: '60000000-0000-4000-8000-000000000001', entityId, role: 'witness', sortOrder: 1 },
    ],
  };
}
