import { AppError } from '../../core/errors/app-error';
import type { AssertionRegistryTestHooks } from '../ipc/assertion-handlers';

export function createAssertionRegistryTestHooks({
  isPackaged,
  nodeEnv,
  environment,
}: {
  isPackaged: boolean;
  nodeEnv: string | undefined;
  environment: NodeJS.ProcessEnv;
}): AssertionRegistryTestHooks | undefined {
  if (isPackaged || nodeEnv !== 'test') return undefined;

  const failFirstList = environment.E2E_ASSERTION_REGISTRY_LIST_FAIL_ONCE === '1';
  const factListDelay = readDelay(environment.E2E_ASSERTION_REGISTRY_FACT_LIST_DELAY_MS);
  const pageListDelay = readDelay(environment.E2E_ASSERTION_REGISTRY_PAGE_LIST_DELAY_MS);
  const promotionDelay = readDelay(environment.E2E_ASSERTION_PROMOTION_DELAY_MS);
  const traceEnabled = environment.E2E_ASSERTION_REGISTRY_TRACE === '1';
  if (
    !failFirstList &&
    factListDelay === 0 &&
    pageListDelay === 0 &&
    promotionDelay === 0 &&
    !traceEnabled
  )
    return undefined;

  let shouldFailFirstList = failFirstList;
  let eventSequence = 0;
  const record = (event: string, details: Record<string, unknown> = {}): void => {
    if (!traceEnabled) return;
    process.stdout.write(
      `__CANON_REGISTRY_TEST__${JSON.stringify({
        event,
        sequence: ++eventSequence,
        ...details,
      })}\n`,
    );
  };
  return {
    beforeList: async (input) => {
      record('list-start', {
        category: input.filters.knowledgeState ?? null,
        hasCursor: input.cursor !== undefined,
      });
      if (shouldFailFirstList) {
        shouldFailFirstList = false;
        throw new AppError(
          'DATABASE_UNAVAILABLE',
          'Falha de teste ao carregar o Registro de Cânone.',
        );
      }
      const delay =
        input.cursor !== undefined
          ? pageListDelay
          : input.filters.knowledgeState === 'fact'
            ? factListDelay
            : 0;
      if (delay > 0) await new Promise<void>((resolve) => setTimeout(resolve, delay));
    },
    afterList: (input) => {
      record('list-complete', {
        category: input.filters.knowledgeState ?? null,
        hasCursor: input.cursor !== undefined,
      });
      return Promise.resolve();
    },
    beforePromotion: async () => {
      record('promotion-start');
      if (promotionDelay > 0)
        await new Promise<void>((resolve) => setTimeout(resolve, promotionDelay));
    },
    afterPromotion: () => {
      record('promotion-complete');
      return Promise.resolve();
    },
  };
}

function readDelay(value: string | undefined): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) && parsed > 0 ? Math.min(parsed, 10_000) : 0;
}
