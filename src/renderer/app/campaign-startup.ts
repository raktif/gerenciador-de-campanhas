import type { AppErrorPayload } from '../../core/contracts/result';
import type { CopyStartupDiagnosticInput } from '../../core/contracts/diagnostics';
import {
  createUserFacingDiagnostic,
  presentUserFacingError,
  type UserFacingError,
} from '../../core/errors/user-facing-error';

export type CampaignLoadPhase = 'initializing' | 'loading-campaigns' | 'ready' | 'error';

export interface CampaignLoadState {
  phase: CampaignLoadPhase;
  request: number;
  failure: CampaignStartupFailure | null;
}

export interface CampaignStartupFailure extends UserFacingError {
  diagnostic: CopyStartupDiagnosticInput;
}

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
  const presentation = presentUserFacingError(error, 'campaigns.list');

  return {
    ...presentation,
    diagnostic: createUserFacingDiagnostic(presentation, 'campaigns.list'),
  };
}
