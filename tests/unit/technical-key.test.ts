import { describe, expect, it } from 'vitest';
import {
  createTechnicalKeyBase,
  createTechnicalKeyCandidate,
  maximumTechnicalKeyLength,
  normalizeTechnicalKeyPart,
} from '../../src/core/identifiers/technical-key';

describe('chaves técnicas', () => {
  it('normaliza grupo e campo no formato estável esperado', () => {
    expect(createTechnicalKeyBase('Vilão', 'Poderes & Habilidades Únicas')).toBe(
      'vilao-poderes-habilidades-unicas',
    );
    expect(createTechnicalKeyBase('  Agentes--47  ', 'Área 51')).toBe('agentes-47-area-51');
  });

  it('usa fallbacks quando uma parte não contém caracteres alfanuméricos', () => {
    expect(normalizeTechnicalKeyPart('🧙‍♂️', 'grupo')).toBe('grupo');
    expect(createTechnicalKeyBase('🧙‍♂️', '!!!')).toBe('grupo-campo');
  });

  it('reserva espaço para sufixos de colisão dentro do limite', () => {
    const base = createTechnicalKeyBase('g'.repeat(120), 'f'.repeat(120));
    const collision = createTechnicalKeyCandidate(base, 123);

    expect(base).toHaveLength(maximumTechnicalKeyLength);
    expect(base).toMatch(/^g+-f+$/);
    expect(collision).toHaveLength(maximumTechnicalKeyLength);
    expect(collision).toMatch(/^g+-f+-123$/);
    expect(() => createTechnicalKeyCandidate(base, 0)).toThrow(RangeError);
  });
});
