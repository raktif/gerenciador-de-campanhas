import { describe, expect, it } from 'vitest';
import type { Entity } from '../../src/core/contracts/entities';
import type { EventDetails } from '../../src/core/contracts/events';
import {
  activeEntities,
  eventPatch,
  linksChanged,
  validateEventInput,
} from '../../src/renderer/features/sessions/event-manager-model';

const campaignId = '00000000-0000-4000-8000-000000000001';
const entityId = '30000000-0000-4000-8000-000000000001';
const otherEntityId = '30000000-0000-4000-8000-000000000002';
const timestamp = '2026-09-11T12:00:00.000Z';

describe('fluxo de edi\u00e7\u00e3o de eventos', () => {
  it('n\u00e3o oferece entidades arquivadas e bloqueia v\u00ednculos fora da campanha ativa', () => {
    const entities = [entity(entityId), entity(otherEntityId, timestamp)];
    expect(activeEntities(entities).map((item) => item.id)).toEqual([entityId]);
    expect(
      validateEventInput(
        {
          ...details().event,
          links: [{ entityId: otherEntityId, role: 'participant' }],
        },
        new Set([entityId]),
      ),
    ).toBe('Selecione somente entidades ativas desta campanha.');
  });

  it('detecta campos e v\u00ednculos alterados, mas n\u00e3o atualiza sem modifica\u00e7\u00e3o', () => {
    const current = details();
    const input = {
      ...current.event,
      links: current.links.map(({ entityId, role }) => ({ entityId, role })),
    };
    expect(eventPatch(input, current.event)).toEqual({});
    expect(linksChanged(input.links, current.links)).toBe(false);
    const changed = {
      ...input,
      eventOrder: 2,
      links: [{ entityId, role: 'witness' as const }],
    };
    expect(eventPatch(changed, current.event)).toEqual({ eventOrder: 2 });
    expect(linksChanged(changed.links, current.links)).toBe(true);
  });

  it('rejeita ordem e v\u00ednculos duplicados antes da chamada ao gateway', () => {
    expect(
      validateEventInput(
        {
          ...details().event,
          eventOrder: -1,
          links: [],
        },
        new Set([entityId]),
      ),
    ).toBe('A ordem do evento deve ser um n\u00famero inteiro n\u00e3o negativo.');
    expect(
      validateEventInput(
        {
          ...details().event,
          links: [
            { entityId, role: 'participant' },
            { entityId, role: 'participant' },
          ],
        },
        new Set([entityId]),
      ),
    ).toBe('Remova v\u00ednculos com a mesma entidade e papel.');
    expect(
      validateEventInput(
        {
          ...details().event,
          originKind: 'session',
          sourceSessionId: undefined,
          links: [],
        },
        new Set([entityId]),
      ),
    ).toBe('Selecione a sess\u00e3o que originou este evento.');
  });
});

function details(): EventDetails {
  return {
    event: {
      id: '60000000-0000-4000-8000-000000000001',
      campaignId,
      sessionId: null,
      title: 'Ponte desaba',
      descriptionMarkdown: null,
      eventOrder: 0,
      occurredAtLabel: null,
      canonState: 'accepted',
      knowledgeState: 'fact',
      visibility: 'gm',
      originKind: 'manual',
      sourceId: null,
      createdAt: timestamp,
      updatedAt: timestamp,
      archivedAt: null,
      revision: 1,
    },
    links: [
      {
        eventId: '60000000-0000-4000-8000-000000000001',
        entityId,
        role: 'participant',
        sortOrder: 0,
      },
    ],
  };
}

function entity(id: string, archivedAt: string | null = null): Entity {
  return {
    id,
    campaignId,
    entityTypeId: '10000000-0000-4000-8000-000000000001',
    referenceImageAttachmentId: null,
    name: id,
    summary: null,
    canonState: 'accepted',
    knowledgeState: 'fact',
    visibility: 'gm',
    originKind: 'manual',
    sourceId: null,
    createdAt: timestamp,
    updatedAt: timestamp,
    archivedAt,
    revision: 1,
  };
}
