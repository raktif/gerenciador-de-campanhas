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
  DEMAND_OPERATION_CONFLICT: {
    title: 'Operação já confirmada com outro conteúdo',
    message: 'Nenhuma nova Demanda foi criada para substituir a operação anterior.',
    suggestedAction: 'Atualize a lista e abra a Demanda existente antes de continuar.',
    helpArticleId: 'demands',
    canRetry: false,
  },
  DEMAND_NOT_FOUND: {
    title: 'Demanda indisponível',
    message: 'A Demanda não foi encontrada nesta campanha.',
    suggestedAction: 'Atualize a lista de Demandas.',
    helpArticleId: 'demands',
    canRetry: true,
  },
  DEMAND_SOURCE_INVALID: {
    title: 'Proveniência inválida',
    message: 'A origem não corresponde a uma necessidade estruturada da mesma campanha.',
    suggestedAction: 'Revise e recalcule os sinais antes de aceitar.',
    helpArticleId: 'demands',
    canRetry: false,
  },
  DEMAND_TRANSITION_INVALID: {
    title: 'Transição não permitida',
    message: 'O estado atual da Demanda não permite esta ação.',
    suggestedAction: 'Recarregue o detalhe e escolha uma ação disponível.',
    helpArticleId: 'demands',
    canRetry: false,
  },
  DEMAND_CONFIRMATION_REQUIRED: {
    title: 'Confirme antes de resolver',
    message: 'A Demanda não foi resolvida e nenhum Evento foi criado.',
    suggestedAction: 'Revise e confirme o diálogo de resolução.',
    helpArticleId: 'demands',
    canRetry: false,
  },
  DEMAND_NEED_LOCKED: {
    title: 'Campo usado por Demanda',
    message:
      'A necessidade original e sua definição estão protegidas, inclusive após arquivar a Demanda.',
    suggestedAction:
      'Crie outro campo de Need para uma nova necessidade. Os demais atributos continuam editáveis.',
    helpArticleId: 'demands',
    canRetry: false,
  },
  DEMAND_PENDING_ENTITY: {
    title: 'Entidade vinculada a Demanda pendente',
    message: 'Uma Demanda disponível ou ativa ainda utiliza esta entidade.',
    suggestedAction: 'Arquive ou encerre a Demanda antes de arquivar a entidade.',
    helpArticleId: 'demands',
    canRetry: false,
  },
  DEMAND_ENTITY_ARCHIVED: {
    title: 'Entidade arquivada',
    message: 'Não é possível reabrir ou restaurar uma Demanda pendente com entidade arquivada.',
    suggestedAction: 'Restaure primeiro as entidades vinculadas.',
    helpArticleId: 'demands',
    canRetry: false,
  },
  DEMAND_EVENT_IMMUTABLE: {
    title: 'Evento gerado por Demanda',
    message: 'Conteúdo, origem e vínculos são imutáveis.',
    suggestedAction:
      'Somente a promoção explícita para Aceito/Fato e o arquivamento/restauração são permitidos.',
    helpArticleId: 'demands',
    canRetry: false,
  },
  DEMAND_CHILDREN_PENDING: {
    title: 'Há subdemandas pendentes',
    message:
      'Todas as filhas precisam estar resolvidas, falhadas ou ignoradas antes de resolver o pai.',
    suggestedAction: 'Encerre as filhas e depois resolva o pai manualmente.',
    helpArticleId: 'demands',
    canRetry: false,
  },
  DEMAND_SOURCE_CHANGED: {
    title: 'A necessidade mudou',
    message: 'A aceitação não foi gravada porque a fonte ou o sinal mudou.',
    suggestedAction: 'Recalcule os sinais e revise novamente a necessidade.',
    helpArticleId: 'demands',
    canRetry: false,
  },
  DEMAND_SIGNAL_NOT_READY: {
    title: 'Sinal indisponível para aceitação',
    message: 'Somente necessidades explícitas atuais, novas ou vistas, podem ser aceitas.',
    suggestedAction: 'Revise ou reative o sinal e recalcule antes de aceitar.',
    helpArticleId: 'demands',
    canRetry: false,
  },
  DEMAND_LINK_INVALID: {
    title: 'Vínculo indisponível',
    message: 'Os alvos precisam pertencer à campanha e as entidades precisam estar ativas.',
    suggestedAction: 'Confira o solicitante e os vínculos antes de salvar.',
    helpArticleId: 'demands',
    canRetry: false,
  },
  DEMAND_IMMUTABLE: {
    title: 'Demanda protegida',
    message:
      'Somente Demandas disponíveis ou ativas podem ser editadas. Demandas não podem ser excluídas.',
    suggestedAction: 'Reabra ou restaure quando permitido. Resolvidas permanecem somente leitura.',
    helpArticleId: 'demands',
    canRetry: false,
  },
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
  ASSERTION_PROMOTION_CONFIRMATION_REQUIRED: {
    title: 'Confirme a promoção antes de alterar a possibilidade',
    message: 'A afirmação continua como possibilidade; nenhuma alteração foi gravada.',
    suggestedAction: 'Use a ação “Promover possibilidade a fato” e confirme a mudança.',
    helpArticleId: 'assertion-canon-promotion',
    canRetry: false,
  },
  ASSERTION_PROMOTION_BLOCKED_ARCHIVED_ENTITY: {
    title: 'A possibilidade não pode ser promovida',
    message: 'O assunto ou objeto desta afirmação está arquivado. Nenhuma alteração foi gravada.',
    suggestedAction: 'Restaure a entidade vinculada antes de tentar promover a possibilidade.',
    helpArticleId: 'assertion-canon-promotion',
    canRetry: false,
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
  CAMPAIGN_SIGNAL_NOT_FOUND: {
    title: 'O sinal não está disponível nesta campanha',
    message: 'Nenhuma alteração foi gravada; atualize a lista de sinais.',
    suggestedAction: 'Atualize os sinais e escolha um registro ainda disponível.',
    helpArticleId: 'signals-operation-failed',
    canRetry: true,
  },
  POTENTIAL_CONTRADICTION_NO_LONGER_DETECTED: {
    title: 'As afirmações mudaram',
    message: 'A exceção não foi registrada porque o aviso não corresponde mais aos dados atuais.',
    suggestedAction: 'Atualize ou recalcule os sinais antes de decidir novamente.',
    helpArticleId: 'signals-operation-failed',
    canRetry: true,
  },
  ASSERTION_SOURCE_SCOPE_UNVERIFIABLE: {
    title: 'Não foi possível comprovar o escopo da fonte',
    message:
      'O par não foi aberto porque uma fonte vinculada não tem escopo verificável. Nenhum dado foi alterado.',
    suggestedAction: 'Confira os vínculos da fonte antes de tentar novamente.',
    helpArticleId: 'signals-operation-failed',
    canRetry: true,
  },
  ASSERTION_SOURCE_CAMPAIGN_MISMATCH: {
    title: 'Fonte com vínculo incompatível entre campanhas',
    message:
      'O par não foi aberto porque a fonte não está vinculada exclusivamente a esta campanha.',
    suggestedAction: 'Confira os vínculos da fonte. Nenhum dado foi alterado.',
    helpArticleId: 'signals-operation-failed',
    canRetry: true,
  },
  ASSERTION_SOURCE_CAPTURE_MISMATCH: {
    title: 'A fonte e a captura não correspondem',
    message:
      'O par não foi aberto porque a origem ou a sessão da fonte diverge da captura vinculada.',
    suggestedAction: 'Confira a proveniência antes de tentar novamente. Nenhum dado foi alterado.',
    helpArticleId: 'signals-operation-failed',
    canRetry: true,
  },
  INVALID_POTENTIAL_CONTRADICTION_ACTION: {
    title: 'Ação indisponível',
    message: 'Apenas avisos de possível contradição permitem marcar uma exceção.',
    suggestedAction: 'Atualize a lista e escolha um aviso compatível.',
    helpArticleId: 'signals-operation-failed',
    canRetry: true,
  },
  INVALID_CAMPAIGN_SIGNAL_TRANSITION: {
    title: 'Esta ação não está disponível para o estado atual',
    message: 'O estado do sinal não foi alterado.',
    suggestedAction: 'Atualize os sinais e use uma ação compatível com o estado apresentado.',
    helpArticleId: 'signals-operation-failed',
    canRetry: true,
  },
  INVALID_SIGNAL_SNOOZE_DEADLINE: {
    title: 'Escolha um prazo futuro para adiar o sinal',
    message: 'O sinal continua no estado atual e nenhum prazo foi gravado.',
    suggestedAction: 'Informe uma data e hora futuras e tente novamente.',
    helpArticleId: 'signals-operation-failed',
    canRetry: false,
  },
  STORY_THREAD_NOT_FOUND: {
    title: 'O fio não está disponível nesta campanha',
    message: 'Nenhuma alteração foi gravada; o fio pode ter sido removido ou alterado.',
    suggestedAction: 'Atualize a lista e confira o estado atual do fio.',
    helpArticleId: 'story-threads',
    canRetry: true,
  },
  CLOCK_NOT_FOUND: {
    title: 'O relógio não está disponível nesta campanha',
    message: 'Nenhuma alteração foi gravada; atualize a lista e confira o registro.',
    suggestedAction: 'Atualize os relógios antes de continuar.',
    helpArticleId: 'clocks',
    canRetry: true,
  },
  INVALID_CLOCK_STATE: {
    title: 'Este relógio não pode mais ser alterado',
    message: 'Relógios concluídos permanecem disponíveis para consulta, sem edição ou reabertura.',
    suggestedAction: 'Atualize a tela para consultar o estado atual do relógio.',
    helpArticleId: 'clocks',
    canRetry: false,
  },
  CLOCK_PROGRESS_EXCEEDS_TOTAL: {
    title: 'O progresso excede o total de divisões',
    message: 'Nenhuma alteração foi salva e o preenchimento anterior foi preservado.',
    suggestedAction: 'Escolha um total compatível ou ajuste o número preenchido.',
    helpArticleId: 'clocks',
    canRetry: false,
  },
  INVALID_CLOCK_CURSOR: {
    title: 'A lista de relógios precisa ser atualizada',
    message: 'A página solicitada não corresponde à consulta atual.',
    suggestedAction: 'Atualize a lista para começar novamente.',
    helpArticleId: 'clocks',
    canRetry: true,
  },
  CLOCK_CAMPAIGN_NOT_ACTIVE: {
    title: 'A campanha não está ativa',
    message: 'Os relógios não foram alterados porque esta campanha está arquivada ou na lixeira.',
    suggestedAction: 'Restaure a campanha antes de continuar.',
    helpArticleId: 'clocks',
    canRetry: false,
  },
  CLOCK_PERSISTENCE_CONFLICT: {
    title: 'Não foi possível salvar este relógio',
    message: 'A campanha mudou durante a operação. Nenhum progresso parcial foi salvo.',
    suggestedAction: 'Atualize a lista e confira o estado antes de tentar novamente.',
    helpArticleId: 'clocks',
    canRetry: true,
  },
  CLOCK_ENTITY_NOT_FOUND: {
    title: 'Escolha uma entidade desta campanha',
    message: 'O relógio não foi salvo porque a entidade não está disponível nesta campanha.',
    suggestedAction: 'Atualize as entidades e escolha uma entidade ativa da campanha.',
    helpArticleId: 'clocks',
    canRetry: true,
  },
  CLOCK_ENTITY_ARCHIVED: {
    title: 'A entidade vinculada está arquivada',
    message: 'Nenhum relógio ou Evento foi alterado.',
    suggestedAction:
      'Escolha outra entidade ativa ou conclua este relógio sem gerar Evento, preservando o progresso.',
    helpArticleId: 'clocks',
    canRetry: true,
  },
  CLOCK_CREATE_IDEMPOTENCY_CONFLICT: {
    title: 'Esta tentativa de criação já foi usada',
    message: 'A chave já corresponde a outra criação; nenhum novo relógio ou Evento foi criado.',
    suggestedAction: 'Inicie uma nova criação para gerar uma chave própria para esta tentativa.',
    helpArticleId: 'clocks',
    canRetry: false,
  },
  CLOCK_SOURCE_REQUIRED: {
    title: 'A origem precisa de uma fonte',
    message: 'O relógio não foi salvo porque a origem selecionada requer uma fonte correspondente.',
    suggestedAction: 'Informe uma fonte válida desta campanha ou escolha origem manual.',
    helpArticleId: 'clocks',
    canRetry: false,
  },
  CLOCK_SOURCE_INVALID: {
    title: 'A fonte não corresponde à origem ou campanha',
    message: 'Nenhuma alteração foi salva.',
    suggestedAction: 'Confira o identificador da fonte ou escolha origem manual.',
    helpArticleId: 'clocks',
    canRetry: false,
  },
  CLOCK_EVENT_CHOICE_REQUIRED: {
    title: 'Confirme a conclusão do relógio',
    message: 'O relógio não foi alterado.',
    suggestedAction: 'Escolha gerar um Evento ou concluir sem Evento.',
    helpArticleId: 'clocks',
    canRetry: false,
  },
  THREAD_TARGET_NOT_FOUND: {
    title: 'O registro não está disponível nesta campanha',
    message:
      'O vínculo não foi criado porque o registro escolhido não foi encontrado nesta campanha.',
    suggestedAction: 'Atualize a lista de registros e escolha um registro existente.',
    helpArticleId: 'story-threads',
    canRetry: true,
  },
  THREAD_TARGET_ARCHIVED: {
    title: 'Não é possível adicionar um registro arquivado',
    message:
      'O novo vínculo não foi criado. Vínculos históricos já existentes permanecem preservados.',
    suggestedAction: 'Restaure o registro antes de adicioná-lo a este fio.',
    helpArticleId: 'story-threads',
    canRetry: false,
  },
  INVALID_THREAD_STATE: {
    title: 'Esta ação não está disponível para o estado atual',
    message: 'O estado do fio não foi alterado.',
    suggestedAction: 'Atualize o fio e escolha uma ação compatível.',
    helpArticleId: 'story-threads',
    canRetry: true,
  },
  INVALID_THREAD_TRANSITION: {
    title: 'Estado de destino inválido',
    message: 'Nenhuma transição foi gravada.',
    suggestedAction: 'Escolha Aberto, Ativo ou Adormecido.',
    helpArticleId: 'story-threads',
    canRetry: false,
  },
  CAMPAIGN_NOT_ACTIVE: {
    title: 'A campanha não está ativa',
    message: 'O fio não foi alterado porque esta campanha está arquivada ou na lixeira.',
    suggestedAction: 'Restaure a campanha antes de continuar.',
    helpArticleId: 'story-threads',
    canRetry: false,
  },
  STORY_THREAD_PERSISTENCE_CONFLICT: {
    title: 'Não foi possível concluir a alteração',
    message: 'Nenhuma alteração parcial foi salva.',
    suggestedAction: 'Tente novamente. Se o problema persistir, atualize os dados.',
    helpArticleId: 'story-threads',
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
  'signals.list': {
    title: 'Não foi possível carregar os sinais',
    message: 'Nenhum sinal foi alterado. A leitura local da campanha não foi concluída.',
    suggestedAction: 'Tente carregar os sinais novamente.',
    helpArticleId: 'signals-not-loading',
    canRetry: true,
  },
  'signals.mutate': {
    title: 'Não foi possível atualizar o sinal',
    message: 'A alteração não foi confirmada; o estado atual do sinal foi preservado.',
    suggestedAction: 'Atualize os sinais e confira o estado antes de tentar novamente.',
    helpArticleId: 'signals-operation-failed',
    canRetry: true,
  },
  'clocks.list': {
    title: 'Não foi possível carregar os relógios',
    message: 'Os relógios permanecem salvos e não foram alterados.',
    suggestedAction: 'Atualize a lista. Se o problema continuar, consulte a ajuda.',
    helpArticleId: 'clocks',
    canRetry: true,
  },
  'clocks.get': {
    title: 'Não foi possível abrir este relógio',
    message: 'Nenhum dado foi alterado.',
    suggestedAction: 'Tente abrir o relógio novamente ou atualize a lista.',
    helpArticleId: 'clocks',
    canRetry: true,
  },
  'clocks.mutate': {
    title: 'Não foi possível salvar o relógio',
    message: 'A alteração não foi confirmada e o estado atual foi preservado.',
    suggestedAction: 'Atualize os dados e tente novamente.',
    helpArticleId: 'clocks',
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
