import { z } from 'zod';
import {
  copyStartupDiagnosticInputSchema,
  type CopyStartupDiagnosticInput,
} from '../contracts/diagnostics';

const errorCodeSchema = z.string().regex(/^[A-Z0-9_]{1,80}$/);

export const userFacingErrorSchema = z
  .object({
    code: errorCodeSchema,
    title: z.string().min(1),
    message: z.string().min(1),
    suggestedAction: z.string().min(1).optional(),
    helpArticleId: z
      .string()
      .regex(/^[a-z0-9-]{1,80}$/)
      .optional(),
    canRetry: z.boolean(),
    canCopyDiagnostics: z.boolean(),
  })
  .strict();
export type UserFacingError = z.infer<typeof userFacingErrorSchema>;

export type UserFacingErrorOperation = CopyStartupDiagnosticInput['operation'];

interface ErrorDefinition {
  title: string;
  message: string;
  suggestedAction: string;
  helpArticleId: string;
  canRetry: boolean;
}

const definitions: Readonly<Record<string, ErrorDefinition>> = {
  DATABASE_UNAVAILABLE: {
    title: 'Não foi possível acessar os dados da campanha',
    message: 'Seus dados continuam salvos neste computador, mas não puderam ser lidos agora.',
    suggestedAction:
      'Tente novamente. Se o problema continuar, copie o diagnóstico e consulte a ajuda.',
    helpArticleId: 'database-unavailable',
    canRetry: true,
  },
  REVISION_CONFLICT: {
    title: 'Este registro foi alterado em outra operação',
    message:
      'Nenhuma alteração sua foi gravada para evitar que dados mais recentes sejam substituídos.',
    suggestedAction: 'Atualize a tela, confira as informações e tente novamente.',
    helpArticleId: 'revision-conflict',
    canRetry: true,
  },
  RELATIONSHIP_TYPE_NAME_ALREADY_EXISTS: {
    title: 'Este nome de tipo de relação já está em uso',
    message: 'Já existe um tipo de relação com esse nome. Escolha um nome diferente.',
    suggestedAction: 'Informe outro nome para o tipo de relação e tente novamente.',
    helpArticleId: 'duplicate-relationship-type-name',
    canRetry: false,
  },
  INBOX_ITEM_NOT_FOUND: {
    title: 'A Captura Rápida não foi encontrada',
    message: 'Ela pode ter sido removida ou alterada desde que esta tela foi aberta.',
    suggestedAction: 'Atualize a Caixa de Entrada antes de continuar.',
    helpArticleId: 'inbox-item-not-found',
    canRetry: true,
  },
  INVALID_INBOX_CONVERSION_STATE: {
    title: 'A Captura Rápida não está pronta para conversão',
    message: 'A captura precisa estar em revisão antes de ser transformada em outro registro.',
    suggestedAction: 'Abra a captura, inicie a revisão e tente novamente.',
    helpArticleId: 'inbox-conversion',
    canRetry: true,
  },
  INBOX_CONVERSION_FAILED: {
    title: 'Não foi possível transformar a Captura Rápida',
    message: 'Nenhum dado foi perdido e a captura continua na Caixa de Entrada.',
    suggestedAction:
      'Tente novamente. Se o problema continuar, copie o diagnóstico e consulte a ajuda.',
    helpArticleId: 'inbox-conversion',
    canRetry: true,
  },
  SESSION_NOT_FOUND: {
    title: 'A sessão de origem não foi encontrada nesta campanha',
    message: 'A sessão pode ter sido removida ou não pertencer à campanha atual.',
    suggestedAction: 'Escolha outra sessão de origem e tente novamente.',
    helpArticleId: 'session-source-not-found',
    canRetry: true,
  },
  PREVIOUS_SESSIONS_INCOMPLETE: {
    title: 'Há sessões anteriores que ainda não foram concluídas',
    message: 'Só é possível iniciar esta sessão depois de concluir todas as sessões anteriores.',
    suggestedAction: 'Conclua as sessões anteriores e tente iniciar esta sessão novamente.',
    helpArticleId: 'session-sequence',
    canRetry: true,
  },
  SESSION_SOURCE_NOT_FOUND: {
    title: 'A sessão de origem não está disponível',
    message: 'Não foi possível confirmar a sessão escolhida nesta campanha.',
    suggestedAction: 'Atualize as sessões, escolha uma origem válida e tente novamente.',
    helpArticleId: 'session-source-not-found',
    canRetry: true,
  },
  VALIDATION_ERROR: {
    title: 'Algumas informações precisam ser corrigidas',
    message: 'A operação não foi realizada porque os dados enviados não são válidos.',
    suggestedAction: 'Revise os campos destacados e tente novamente.',
    helpArticleId: 'review-input',
    canRetry: false,
  },
};

const operationFallbacks: Readonly<Partial<Record<UserFacingErrorOperation, ErrorDefinition>>> = {
  'campaigns.list': {
    title: 'Não foi possível carregar suas campanhas',
    message: 'Seus dados continuam salvos. A leitura local das campanhas não foi concluída.',
    suggestedAction:
      'Tente novamente. Se o problema continuar, abra a ajuda ou copie o diagnóstico.',
    helpArticleId: 'campaigns-not-loading',
    canRetry: true,
  },
  'inbox.list': {
    title: 'Não foi possível carregar a Caixa de Entrada',
    message: 'Suas capturas continuam salvas e não foram alteradas.',
    suggestedAction:
      'Tente novamente. Se o problema continuar, copie o diagnóstico e consulte a ajuda.',
    helpArticleId: 'inbox-not-loading',
    canRetry: true,
  },
  'inbox.capture': {
    title: 'Não foi possível salvar a Captura Rápida',
    message: 'O texto continua aberto nesta tela e não foi perdido.',
    suggestedAction:
      'Tente novamente. Se o problema continuar, copie o diagnóstico e consulte a ajuda.',
    helpArticleId: 'quick-capture-not-saving',
    canRetry: true,
  },
  'inbox.convert': {
    title: 'Não foi possível transformar a Captura Rápida',
    message: 'Nenhum dado foi perdido e a captura continua na Caixa de Entrada.',
    suggestedAction:
      'Tente novamente. Se o problema continuar, copie o diagnóstico e consulte a ajuda.',
    helpArticleId: 'inbox-conversion',
    canRetry: true,
  },
  'sessions.list': {
    title: 'Não foi possível carregar as sessões da campanha',
    message: 'Nenhuma sessão ou registro da campanha foi alterado.',
    suggestedAction:
      'Tente novamente. Se o problema continuar, copie o diagnóstico e consulte a ajuda.',
    helpArticleId: 'session-source-not-loading',
    canRetry: true,
  },
};

export function presentUserFacingError(
  error: unknown,
  operation: UserFacingErrorOperation,
): UserFacingError {
  const code = extractSafeCode(error);
  const definition =
    operation === 'campaigns.list' && code === 'DATABASE_UNAVAILABLE'
      ? fallbackForOperation(operation)
      : ((code === undefined ? undefined : definitions[code]) ?? fallbackForOperation(operation));
  const resolvedCode = code ?? fallbackCode(operation);

  return userFacingErrorSchema.parse({
    code: resolvedCode,
    ...definition,
    canCopyDiagnostics: true,
  });
}

export function userFacingErrorMessage(
  error: unknown,
  operation: UserFacingErrorOperation,
): string {
  return presentUserFacingError(error, operation).message;
}

export function createUserFacingDiagnostic(
  error: Pick<UserFacingError, 'code'>,
  operation: UserFacingErrorOperation,
): CopyStartupDiagnosticInput {
  return copyStartupDiagnosticInputSchema.parse({
    version: 1,
    screen: screenForOperation(operation),
    operation,
    code: error.code,
  });
}

function extractSafeCode(error: unknown): string | undefined {
  if (typeof error !== 'object' || error === null || !('code' in error)) return undefined;
  const code = error.code;
  return typeof code === 'string' && errorCodeSchema.safeParse(code).success ? code : undefined;
}

function fallbackCode(operation: UserFacingErrorOperation): string {
  return operation === 'campaigns.list' ? 'CAMPAIGN_LIST_UNAVAILABLE' : 'OPERATION_UNAVAILABLE';
}

function screenForOperation(
  operation: UserFacingErrorOperation,
): CopyStartupDiagnosticInput['screen'] {
  return operation.split('.')[0] as CopyStartupDiagnosticInput['screen'];
}

function fallbackForOperation(operation: UserFacingErrorOperation): ErrorDefinition {
  const defined = operationFallbacks[operation];
  if (defined !== undefined) return defined;

  const noun = operation.split('.')[0] ?? operation;
  const loading = operation.endsWith('.list');
  return {
    title: loading
      ? 'Não foi possível carregar estas informações'
      : 'Não foi possível concluir esta operação',
    message: loading
      ? 'Seus dados continuam salvos e não foram alterados.'
      : 'Nenhuma alteração parcial foi confirmada.',
    suggestedAction: loading
      ? 'Tente novamente. Se o problema continuar, copie o diagnóstico e consulte a ajuda.'
      : 'Revise os dados e tente novamente. Se o problema continuar, copie o diagnóstico e consulte a ajuda.',
    helpArticleId: `${noun}-${loading ? 'not-loading' : 'operation-failed'}`,
    canRetry: true,
  };
}
