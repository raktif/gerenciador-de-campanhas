import { useEffect, useState } from 'react';
import type { ClockSourceOption, ClockSourceOptionKind } from '../../../core/contracts/clocks';
import {
  presentUserFacingError,
  type UserFacingError,
} from '../../../core/errors/user-facing-error';
import type { OriginKind } from '../../../core/contracts/narrative';

export function useClockSourceOptions(
  campaignId: string,
  originKind: OriginKind,
): {
  options: readonly ClockSourceOption[];
  error: UserFacingError | undefined;
  loading: boolean;
  available: boolean;
  retry: () => void;
} {
  const [options, setOptions] = useState<ClockSourceOption[]>([]);
  const [error, setError] = useState<UserFacingError>();
  const [loading, setLoading] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let active = true;
    const sourceKind = sourceOptionKind(originKind);
    setOptions([]);
    setError(undefined);
    if (sourceKind === null) {
      setLoading(false);
      return () => {
        active = false;
      };
    }

    setLoading(true);
    void window.campaignManager.clocks
      .sourceOptions({ campaignId, originKind: sourceKind })
      .then((result) => {
        if (!active) return;
        if (!result.ok) {
          setError(presentUserFacingError(result.error, 'clocks.list'));
          return;
        }
        setOptions(result.data);
      })
      .catch((reason: unknown) => {
        if (active) setError(presentUserFacingError(reason, 'clocks.list'));
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [attempt, campaignId, originKind]);

  return {
    options,
    error,
    loading,
    available: !loading && error === undefined && options.length > 0,
    retry: () => setAttempt((current) => current + 1),
  };
}

function sourceOptionKind(originKind: OriginKind): ClockSourceOptionKind | null {
  switch (originKind) {
    case 'import':
    case 'document':
    case 'ruleset':
    case 'ai':
    case 'generator':
      return originKind;
    case 'manual':
    case 'session':
      return null;
  }
}
