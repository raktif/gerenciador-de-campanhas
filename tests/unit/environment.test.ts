import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { readEnvironment, resolveDataRoot } from '../../src/core/config/environment';

describe('configuração centralizada', () => {
  it('usa valores seguros por padrão', () => {
    expect(readEnvironment({})).toEqual({ LOG_LEVEL: 'info' });
  });

  it('resolve o diretório padrão dentro de userData', () => {
    expect(resolveDataRoot(path.join('C:', 'user-data'), readEnvironment({}))).toBe(
      path.join('C:', 'user-data', 'campaign-manager-data'),
    );
  });

  it('rejeita nível de log desconhecido', () => {
    expect(() => readEnvironment({ LOG_LEVEL: 'verbose' })).toThrow(
      'Configuração de ambiente inválida',
    );
  });
});
