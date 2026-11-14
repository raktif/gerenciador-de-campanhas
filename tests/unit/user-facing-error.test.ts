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

  it('orienta a escolha de outro nome para tipos de relação duplicados', () => {
    expect(
      presentUserFacingError(
        { code: 'RELATIONSHIP_TYPE_NAME_ALREADY_EXISTS' },
        'relationship-types.mutate',
      ),
    ).toMatchObject({
      code: 'RELATIONSHIP_TYPE_NAME_ALREADY_EXISTS',
      message: 'Já existe um tipo de relação com esse nome. Escolha um nome diferente.',
      suggestedAction: 'Informe outro nome para o tipo de relação e tente novamente.',
    });
  });

  it('explica que promoção de possibilidade exige confirmação explícita', () => {
    expect(
      presentUserFacingError(
        { code: 'ASSERTION_PROMOTION_CONFIRMATION_REQUIRED' },
        'assertions.mutate',
      ),
    ).toMatchObject({
      code: 'ASSERTION_PROMOTION_CONFIRMATION_REQUIRED',
      message: 'A afirmação continua como possibilidade; nenhuma alteração foi gravada.',
      canRetry: false,
    });
  });

  it('explica que entidade arquivada impede a promoção sem alterar a afirmação', () => {
    expect(
      presentUserFacingError(
        { code: 'ASSERTION_PROMOTION_BLOCKED_ARCHIVED_ENTITY' },
        'assertions.mutate',
      ),
    ).toMatchObject({
      code: 'ASSERTION_PROMOTION_BLOCKED_ARCHIVED_ENTITY',
      title: 'A possibilidade não pode ser promovida',
      message: 'O assunto ou objeto desta afirmação está arquivado. Nenhuma alteração foi gravada.',
      canRetry: false,
    });
  });

  it('explica por que uma sessão anterior precisa ser concluída', () => {
    expect(
      presentUserFacingError({ code: 'PREVIOUS_SESSIONS_INCOMPLETE' }, 'sessions.mutate'),
    ).toMatchObject({
      code: 'PREVIOUS_SESSIONS_INCOMPLETE',
      message: 'Só é possível iniciar esta sessão depois de concluir todas as sessões anteriores.',
      suggestedAction: 'Conclua as sessões anteriores e tente iniciar esta sessão novamente.',
    });
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
