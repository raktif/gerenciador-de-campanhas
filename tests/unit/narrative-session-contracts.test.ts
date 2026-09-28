import { describe, expect, it } from 'vitest';
import { createAssertionInputSchema } from '../../src/core/contracts/assertions';
import { createNoteInputSchema } from '../../src/core/contracts/notes';

const campaignId = '00000000-0000-4000-8000-000000000001';
const entityId = '30000000-0000-4000-8000-000000000001';
const sessionId = '70000000-0000-4000-8000-000000000001';
const sourceId = '60000000-0000-4000-8000-000000000001';

describe('contratos narrativos com origem de sessao', () => {
  it('recebe sessionId e rejeita sourceId para notas e afirmacoes', () => {
    expect(
      createNoteInputSchema.parse({
        campaignId,
        title: 'Registro',
        bodyMarkdown: 'Conteudo',
        originKind: 'session',
        sessionId,
      }),
    ).toMatchObject({ originKind: 'session', sessionId });
    expect(
      createAssertionInputSchema.parse({
        campaignId,
        subjectEntityId: entityId,
        statement: 'Registro.',
        originKind: 'session',
        sessionId,
      }),
    ).toMatchObject({ originKind: 'session', sessionId });
    expect(() =>
      createNoteInputSchema.parse({
        campaignId,
        title: 'Registro',
        bodyMarkdown: 'Conteudo',
        sourceId,
      }),
    ).toThrow();
    expect(() =>
      createAssertionInputSchema.parse({
        campaignId,
        subjectEntityId: entityId,
        statement: 'Registro.',
        sourceId,
      }),
    ).toThrow();
  });
});
