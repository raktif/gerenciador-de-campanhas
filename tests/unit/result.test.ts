import { describe, expect, it } from 'vitest';
import { AppError, toSafeError } from '../../src/core/errors/app-error';
import { failure, success } from '../../src/core/contracts/result';

describe('Result', () => {
  it('cria um envelope de sucesso com requestId', () => {
    expect(success({ ready: true }, 'request-1')).toEqual({
      ok: true,
      data: { ready: true },
      requestId: 'request-1',
    });
  });

  it('preserva erros conhecidos sem expor stack trace', () => {
    const safeError = toSafeError(
      new AppError('KNOWN_ERROR', 'Mensagem segura.', { field: 'name' }),
    );
    expect(failure(safeError, 'request-2')).toEqual({
      ok: false,
      error: {
        code: 'KNOWN_ERROR',
        message: 'Mensagem segura.',
        details: { field: 'name' },
      },
      requestId: 'request-2',
    });
  });

  it('transforma erros desconhecidos em mensagem genérica', () => {
    expect(toSafeError(new Error('segredo interno'))).toEqual({
      code: 'INTERNAL_ERROR',
      message: 'Ocorreu um erro interno. Consulte os logs locais para obter ajuda.',
    });
  });
});
