import { describe, expect, it } from 'vitest';
import {
  createNoteInputSchema,
  notePageRequestSchema,
  noteSchema,
  updateNoteInputSchema,
} from '../../src/core/contracts/notes';

const campaignId = '00000000-0000-4000-8000-000000000001';
const noteId = '50000000-0000-4000-8000-000000000001';
const entityId = '30000000-0000-4000-8000-000000000001';
const timestamp = '2026-09-03T12:00:00.000Z';

describe('contratos de notas', () => {
  it('aplica padrões narrativos e preserva o Markdown', () => {
    expect(
      createNoteInputSchema.parse({
        campaignId,
        title: '  Preparação  ',
        bodyMarkdown: '# Cena\n\n- pista\n',
        links: [{ entityId, role: '  alvo  ' }],
      }),
    ).toEqual({
      campaignId,
      title: 'Preparação',
      bodyMarkdown: '# Cena\n\n- pista\n',
      noteType: 'general',
      canonState: 'accepted',
      knowledgeState: 'fact',
      visibility: 'gm',
      originKind: 'manual',
      sourceId: null,
      links: [{ entityId, role: 'alvo' }],
    });
  });

  it('impõe limites, tipo estrito e corpo não vazio', () => {
    const base = { campaignId, title: 'Nota', bodyMarkdown: 'Conteúdo' };
    expect(() => createNoteInputSchema.parse({ ...base, title: 'x'.repeat(201) })).toThrow();
    expect(() => createNoteInputSchema.parse({ ...base, bodyMarkdown: ' \n\t ' })).toThrow();
    expect(() =>
      createNoteInputSchema.parse({ ...base, bodyMarkdown: 'x'.repeat(100001) }),
    ).toThrow();
    expect(() => createNoteInputSchema.parse({ ...base, noteType: 'diary' })).toThrow();
    expect(() => createNoteInputSchema.parse({ ...base, unexpected: true })).toThrow();
  });

  it('rejeita vínculos duplicados depois de aparar o papel, mas aceita papéis diferentes', () => {
    const base = { campaignId, title: 'Nota', bodyMarkdown: 'Conteúdo' };
    expect(() =>
      createNoteInputSchema.parse({
        ...base,
        links: [
          { entityId, role: 'alvo' },
          { entityId, role: ' alvo ' },
        ],
      }),
    ).toThrow();
    expect(
      createNoteInputSchema.parse({
        ...base,
        links: [
          { entityId, role: 'alvo' },
          { entityId, role: 'testemunha' },
        ],
      }).links,
    ).toHaveLength(2);
  });

  it('exige alteração e valida estado persistido e filtros completos', () => {
    expect(() => updateNoteInputSchema.parse({ campaignId, id: noteId, revision: 1 })).toThrow();
    expect(() =>
      updateNoteInputSchema.parse({ campaignId, id: noteId, revision: 1, patch: {} }),
    ).toThrow();
    expect(
      notePageRequestSchema.parse({
        campaignId,
        filters: {
          entityId,
          noteType: 'clue',
          canonState: 'draft',
          knowledgeState: 'possibility',
          visibility: 'players',
          originKind: 'manual',
          archived: false,
        },
        sort: 'title',
        order: 'asc',
      }),
    ).toMatchObject({ filters: { entityId, noteType: 'clue' }, sort: 'title' });
    expect(
      noteSchema.parse({
        id: noteId,
        campaignId,
        title: 'Nota',
        bodyMarkdown: '**Markdown**',
        noteType: 'reference',
        canonState: 'accepted',
        knowledgeState: 'possibility',
        visibility: 'gm',
        originKind: 'manual',
        sourceId: null,
        createdAt: timestamp,
        updatedAt: timestamp,
        archivedAt: null,
        revision: 1,
      }).knowledgeState,
    ).toBe('possibility');
  });
});
