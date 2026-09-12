import { describe, expect, it } from 'vitest';
import {
  createEventInputSchema,
  eventPageRequestSchema,
  eventSchema,
  updateEventInputSchema,
} from '../../src/core/contracts/events';

const campaignId = '00000000-0000-4000-8000-000000000001';
const sessionId = '70000000-0000-4000-8000-000000000001';
const eventId = '60000000-0000-4000-8000-000000000001';
const entityId = '30000000-0000-4000-8000-000000000001';
const timestamp = '2026-09-10T12:00:00.000Z';

describe('contratos de eventos', () => {
  it('normaliza t\u00edtulo, aplica defaults narrativos e define pagina\u00e7\u00e3o segura', () => {
    expect(
      createEventInputSchema.parse({
        campaignId,
        title: '  A ponte desaba  ',
        links: [{ entityId, role: 'location' }],
      }),
    ).toEqual({
      campaignId,
      sessionId: null,
      title: 'A ponte desaba',
      descriptionMarkdown: null,
      eventOrder: 0,
      occurredAtLabel: null,
      canonState: 'accepted',
      knowledgeState: 'fact',
      visibility: 'gm',
      originKind: 'manual',
      sourceId: null,
      links: [{ entityId, role: 'location', sortOrder: 0 }],
    });
    expect(eventPageRequestSchema.parse({ campaignId })).toEqual({
      campaignId,
      limit: 50,
      filters: { archived: false },
      sort: 'eventOrder',
      order: 'asc',
    });
  });

  it('rejeita payloads amb\u00edguos, v\u00ednculos repetidos e atualiza\u00e7\u00f5es vazias', () => {
    expect(() => createEventInputSchema.parse({ campaignId, title: '   ' })).toThrow();
    expect(() =>
      createEventInputSchema.parse({
        campaignId,
        title: 'Evento',
        links: [
          { entityId, role: 'participant' },
          { entityId, role: 'participant', sortOrder: 1 },
        ],
      }),
    ).toThrow();
    expect(() => updateEventInputSchema.parse({ campaignId, id: eventId, revision: 1 })).toThrow();
    expect(() =>
      updateEventInputSchema.parse({ campaignId, id: eventId, revision: 1, patch: {} }),
    ).toThrow();
    expect(
      createEventInputSchema.parse({
        campaignId,
        title: 'Ocorr\u00eancia de sess\u00e3o',
        originKind: 'session',
        sourceSessionId: sessionId,
      }),
    ).toMatchObject({ sourceSessionId: sessionId });
    expect(() =>
      createEventInputSchema.parse({
        campaignId,
        title: 'Sess\u00e3o inv\u00e1lida',
        sourceSessionId: 'not-a-uuid',
      }),
    ).toThrow();
  });

  it('valida a forma persistida e filtros de sess\u00e3o, entidade e narrativa', () => {
    expect(
      eventSchema.parse({
        id: eventId,
        campaignId,
        sessionId,
        title: 'A ponte desaba',
        descriptionMarkdown: null,
        eventOrder: 2,
        occurredAtLabel: 'Noite 3',
        canonState: 'accepted',
        knowledgeState: 'fact',
        visibility: 'gm',
        originKind: 'manual',
        sourceId: null,
        createdAt: timestamp,
        updatedAt: timestamp,
        archivedAt: null,
        revision: 1,
      }),
    ).toMatchObject({ sessionId, eventOrder: 2 });
    expect(
      eventPageRequestSchema.parse({
        campaignId,
        filters: { sessionId, entityId, knowledgeState: 'fact', archived: false },
        sort: 'createdAt',
        order: 'desc',
      }),
    ).toMatchObject({ filters: { sessionId, entityId }, sort: 'createdAt', order: 'desc' });
  });
});
