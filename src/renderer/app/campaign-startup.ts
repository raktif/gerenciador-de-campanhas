import type { AppErrorPayload } from '../../core/contracts/result';
import type { CopyStartupDiagnosticInput } from '../../core/contracts/diagnostics';

export type CampaignLoadPhase = 'initializing' | 'loading-campaigns' | 'ready' | 'error';

export interface CampaignLoadState {
  phase: CampaignLoadPhase;
  request: number;
  failure: CampaignStartupFailure | null;
}

export interface CampaignStartupFailure {
  code: string;
  title: string;
  message: string;
  suggestedAction: string;
  diagnostic: CopyStartupDiagnosticInput;
}

const fallbackCode = 'CAMPAIGN_LIST_UNAVAILABLE';
const safeCodePattern = /^[A-Z0-9_]{1,80}$/;

export const initialCampaignLoadState: CampaignLoadState = {
  phase: 'initializing',
  request: 0,
  failure: null,
};

export function beginCampaignLoad(state: CampaignLoadState): CampaignLoadState {
  return { phase: 'loading-campaigns', request: state.request + 1, failure: null };
}

export function resolveCampaignLoad(
  state: CampaignLoadState,
  request: number,
  outcome: { ok: true } | { ok: false; error?: Pick<AppErrorPayload, 'code'> },
): CampaignLoadState {
  if (request !== state.request) return state;
  if (outcome.ok) return { ...state, phase: 'ready', failure: null };
  return {
    ...state,
    phase: 'error',
    failure: createCampaignStartupFailure(outcome.error),
  };
}

export function invalidateCampaignLoad(state: CampaignLoadState): CampaignLoadState {
  return { phase: 'loading-campaigns', request: state.request + 1, failure: null };
}

export function createCampaignStartupFailure(
  error?: Pick<AppErrorPayload, 'code'>,
): CampaignStartupFailure {
  const code = normalizeCode(error?.code);

  return {
    code,
    title: 'Não foi possível carregar suas campanhas',
    message: 'Seus dados continuam salvos. A leitura local das campanhas não foi concluída.',
    suggestedAction:
      'Tente novamente. Se o problema continuar, abra a ajuda ou copie o diagnóstico.',
    diagnostic: {
      version: 1,
      screen: 'campaigns',
      operation: 'campaigns.list',
      code,
    },
  };
}

function normalizeCode(value: string | undefined): string {
  return value !== undefined && safeCodePattern.test(value) ? value : fallbackCode;
}
