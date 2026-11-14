import { describe, expect, it } from 'vitest';
import {
  createUserFacingDiagnostic,
  presentUserFacingError,
} from '../../src/core/errors/user-facing-error';

describe('erros do fluxo de sinais', () => {
  it.each([
    ['ASSERTION_SOURCE_SCOPE_UNVERIFIABLE', 'Não foi possível comprovar o escopo da fonte'],
    ['ASSERTION_SOURCE_CAMPAIGN_MISMATCH', 'Fonte com vínculo incompatível entre campanhas'],
    ['ASSERTION_SOURCE_CAPTURE_MISMATCH', 'A fonte e a captura não correspondem'],
  ])('proveniência %s recebe feedback explícito sem conteúdo técnico ou alheio', (code, title) => {
    const error = presentUserFacingError(
      {
        code,
        message: 'PRIVATE B ONLY 00000000-0000-4000-8000-000000000001',
      },
      'signals.list',
    );
    expect(error).toMatchObject({ code, title });
    expect(error.message).toContain('O par não foi aberto');
    expect(JSON.stringify(error)).not.toContain('PRIVATE B ONLY');
    expect(JSON.stringify(error)).not.toContain('00000000-0000-4000-8000-000000000001');
  });
  it('explica transições inválidas e gera diagnóstico da tela de sinais sem expor detalhes técnicos', () => {
    const error = presentUserFacingError(
      {
        code: 'INVALID_CAMPAIGN_SIGNAL_TRANSITION',
        message: '00000000-0000-4000-8000-000000000001',
      },
      'signals.mutate',
    );
    expect(error).toMatchObject({
      code: 'INVALID_CAMPAIGN_SIGNAL_TRANSITION',
      title: 'Esta ação não está disponível para o estado atual',
    });
    expect(JSON.stringify(error)).not.toContain('00000000-0000-4000-8000-000000000001');
    expect(createUserFacingDiagnostic(error, 'signals.mutate')).toEqual({
      version: 1,
      screen: 'signals',
      operation: 'signals.mutate',
      code: 'INVALID_CAMPAIGN_SIGNAL_TRANSITION',
    });
  });
});
