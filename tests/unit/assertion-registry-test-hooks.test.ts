import { describe, expect, it } from 'vitest';
import { assertionPageRequestSchema } from '../../src/core/contracts/assertions';
import { createAssertionRegistryTestHooks } from '../../src/main/bootstrap/assertion-registry-test-hooks';

describe('isolamento dos ganchos E2E do Registro de Cânone', () => {
  it('não instala falhas ou atrasos em aplicativos empacotados, mesmo com flags presentes', () => {
    expect(
      createAssertionRegistryTestHooks({
        isPackaged: true,
        nodeEnv: 'test',
        environment: {
          E2E_ASSERTION_REGISTRY_LIST_FAIL_ONCE: '1',
          E2E_ASSERTION_PROMOTION_DELAY_MS: '100',
        },
      }),
    ).toBeUndefined();
  });

  it('não instala ganchos fora de NODE_ENV=test, mesmo em desenvolvimento', () => {
    expect(
      createAssertionRegistryTestHooks({
        isPackaged: false,
        nodeEnv: 'production',
        environment: { E2E_ASSERTION_REGISTRY_LIST_FAIL_ONCE: '1' },
      }),
    ).toBeUndefined();
  });

  it('limita falha e atrasos a configuração não empacotada de teste', async () => {
    const hooks = createAssertionRegistryTestHooks({
      isPackaged: false,
      nodeEnv: 'test',
      environment: { E2E_ASSERTION_REGISTRY_LIST_FAIL_ONCE: '1' },
    });
    expect(hooks).toBeDefined();
    const request = assertionPageRequestSchema.parse({
      campaignId: '00000000-0000-4000-8000-000000000001',
    });
    await expect(hooks?.beforeList(request)).rejects.toMatchObject({
      code: 'DATABASE_UNAVAILABLE',
    });
    await expect(hooks?.beforeList(request)).resolves.toBeUndefined();
  });
});
