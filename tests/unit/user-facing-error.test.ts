import { describe, expect, it } from 'vitest';
import {
  createUserFacingDiagnostic,
  presentUserFacingError,
  userFacingErrorSchema,
} from '../../src/core/errors/user-facing-error';
import { copyStartupDiagnosticInputSchema } from '../../src/core/contracts/diagnostics';

describe('catálogo de erros orientados ao usuário', () => {
  it('apresenta um erro conhecido sem reutilizar detalhes técnicos', () => {
    const error = presentUserFacingError(
      { code: 'REVISION_CONFLICT', message: 'C:\\Users\\person\\secret-token' },
      'inbox.convert',
    );

    expect(error).toMatchObject({
      code: 'REVISION_CONFLICT',
      title: 'Este registro foi alterado em outra operação',
      canRetry: true,
      canCopyDiagnostics: true,
    });
    expect(JSON.stringify(error)).not.toContain('secret-token');
  });

  it('oferece fallback contextual e seguro para erros desconhecidos', () => {
    const error = presentUserFacingError(
      { code: 'Error: C:\\Users\\person\\AppData\\token' },
      'inbox.capture',
    );

    expect(error).toMatchObject({
      code: 'OPERATION_UNAVAILABLE',
      title: 'Não foi possível salvar a Captura Rápida',
      canRetry: true,
    });
    expect(JSON.stringify(error)).not.toContain('AppData');
  });

  it('produz diagnósticos estritos sem stack trace, segredos ou caminhos', () => {
    const error = presentUserFacingError({ code: 'SESSION_NOT_FOUND' }, 'sessions.list');
    const diagnostic = createUserFacingDiagnostic(error, 'sessions.list');

    expect(diagnostic).toEqual({
      version: 1,
      screen: 'sessions',
      operation: 'sessions.list',
      code: 'SESSION_NOT_FOUND',
    });
    expect(() => userFacingErrorSchema.parse({ ...error, stack: 'blocked' })).toThrow();
    expect(() =>
      copyStartupDiagnosticInputSchema.parse({
        version: 1,
        screen: 'sessions',
        operation: 'entities.list',
        code: 'ENTITY_NOT_FOUND',
      }),
    ).toThrow();
  });
});
