import { describe, expect, it } from 'vitest';
import {
  advanceSessionRetryFocus,
  sessionSourceDescription,
} from '../../src/renderer/features/narrative/narrative-metadata-fields';

describe('descricao acessivel do seletor de sessao', () => {
  it('associa o estado anunciavel de carregamento a um id existente', () => {
    expect(sessionSourceDescription({ loading: true, available: false })).toBe(
      'narrative-source-session-help narrative-source-session-loading',
    );
  });

  it.each([
    [{ error: 'Nao foi possivel carregar as sessoes.' }, 'narrative-source-session-error'],
    [{ available: false }, 'narrative-source-session-unavailable'],
    [{ available: true }, undefined],
  ])('mantem descricao coerente para %o', (state, statusId) => {
    const description = sessionSourceDescription(state);
    expect(description).toContain('narrative-source-session-help');
    if (statusId === undefined) {
      expect(description).toBe('narrative-source-session-help');
      return;
    }
    expect(description).toContain(statusId);
  });
});

describe('continuidade de foco do retry de sessoes', () => {
  it('aguarda observar loading antes de mover o foco terminal', () => {
    expect(
      advanceSessionRetryFocus({
        phase: 'awaiting-loading',
        loading: false,
        error: 'Falha anterior ainda renderizada.',
      }),
    ).toEqual({ phase: 'awaiting-loading', target: undefined });
    expect(
      advanceSessionRetryFocus({ phase: 'awaiting-loading', loading: true }),
    ).toEqual({ phase: 'awaiting-result', target: undefined });
  });

  it.each([
    [{ available: true }, 'session'],
    [{ error: 'Falha temporaria.' }, 'retry'],
    [{ available: false }, 'origin'],
  ])('define o destino %s ao fim do carregamento observado', (state, target) => {
    expect(
      advanceSessionRetryFocus({ phase: 'awaiting-result', loading: false, ...state }),
    ).toEqual({ phase: 'idle', target });
  });

  it('nao move foco em carregamentos sem retry explicito', () => {
    expect(advanceSessionRetryFocus({ phase: 'idle', loading: false, available: true })).toEqual({
      phase: 'idle',
      target: undefined,
    });
  });
});
