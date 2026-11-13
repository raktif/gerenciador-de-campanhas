import { describe, expect, it } from 'vitest';
import { signalEvidenceSchema } from '../../src/core/contracts/campaign-signals';

const evidence = {
  id: '00000000-0000-4000-8000-000000000001',
  signalId: '00000000-0000-4000-8000-000000000002',
  objectType: 'entity',
  objectId: '00000000-0000-4000-8000-000000000003',
  role: 'related',
  description: null,
  graphPath: null,
  sortOrder: 0,
  createdAt: '2026-11-13T12:00:00.000Z',
};

describe('limites Unicode do contrato de evidência', () => {
  for (const [field, limit] of [
    ['role', 100],
    ['description', 2000],
  ] as const) {
    it(`${field}: rejeita NUL embutido, inclusive o overflow reproduzido pelo QA`, () => {
      for (const value of [`${'a'.repeat(limit - 1)}\0b`, 'a\0b', '\0a', 'a\0']) {
        const result = signalEvidenceSchema.safeParse({ ...evidence, [field]: value });
        expect(result.success).toBe(false);
        if (!result.success)
          expect(result.error.issues).toContainEqual(
            expect.objectContaining({ path: [field], message: 'O texto não deve conter NUL.' }),
          );
      }
    });
    it(`${field}: conta pontos de código para BMP, suplementares e texto misto`, () => {
      for (const character of ['a', 'é', String.fromCodePoint(0x1f600)]) {
        for (const count of [1, limit - 1, limit]) {
          const value = character.repeat(count);
          expect(signalEvidenceSchema.parse({ ...evidence, [field]: value })[field]).toBe(value);
          expect(
            signalEvidenceSchema.parse({ ...evidence, [field]: `\t\u00a0${value}\n\ufeff` })[field],
          ).toBe(value);
        }
        expect(
          signalEvidenceSchema.safeParse({ ...evidence, [field]: character.repeat(limit + 1) })
            .success,
        ).toBe(false);
      }
      const mixed = `${'a'.repeat(limit - 1)}${String.fromCodePoint(0x1f600)}`;
      expect(signalEvidenceSchema.parse({ ...evidence, [field]: mixed })[field]).toBe(mixed);
      expect(signalEvidenceSchema.safeParse({ ...evidence, [field]: `${mixed}é` }).success).toBe(
        false,
      );
      for (const value of ['', '\t\n\u00a0\ufeff'])
        expect(signalEvidenceSchema.safeParse({ ...evidence, [field]: value }).success).toBe(false);
    });
  }
  it('preserva description nullable e role obrigatório', () => {
    expect(signalEvidenceSchema.parse(evidence).description).toBeNull();
    expect(signalEvidenceSchema.safeParse({ ...evidence, role: null }).success).toBe(false);
  });
});
