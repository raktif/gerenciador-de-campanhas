import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { captureInboxItemInputSchema, inboxItemSchema } from '../../src/core/contracts/inbox';
import { ensureDataDirectories, getDataDirectories } from '../../src/core/storage/data-directories';
import { openApplicationDatabase, type DatabaseContext } from '../../src/db/connection';
import { CampaignRepository } from '../../src/db/repositories/campaign-repository';
import { InboxRepository } from '../../src/db/repositories/inbox-repository';
import { SessionRepository } from '../../src/db/repositories/session-repository';
import { InboxService } from '../../src/main/services/inbox-service';
import { TestLogger } from '../helpers/test-logger';

const campaignId = '00000000-0000-4000-8000-000000000001';
const otherCampaignId = '00000000-0000-4000-8000-000000000002';
const sessionId = '70000000-0000-4000-8000-000000000001';
const foreignSessionId = '70000000-0000-4000-8000-000000000002';
const timestamp = '2026-09-14T12:00:00.000Z';
const roots: string[] = [];
const contexts: DatabaseContext[] = [];

afterEach(async () => {
  for (const context of contexts.splice(0)) if (context.native.open) context.close();
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe('InboxRepository', () => {
  it('persiste uma captura nova, associa a sessão local e protege o isolamento no banco', async () => {
    const { context, repository, service } = await setup();
    const captured = service.capture(
      captureInboxItemInputSchema.parse({ campaignId, sessionId, rawText: '  O sino tocou.  ' }),
    );
    expect(captured).toMatchObject({
      campaignId,
      sessionId,
      rawText: '  O sino tocou.  ',
      status: 'new',
      originKind: 'session',
      revision: 1,
    });
    expect(
      context.native
        .prepare(
          'SELECT campaign_id, session_id, raw_text, status, origin_kind, revision FROM inbox_items WHERE id = ?',
        )
        .get(captured.id),
    ).toEqual({
      campaign_id: campaignId,
      session_id: sessionId,
      raw_text: '  O sino tocou.  ',
      status: 'new',
      origin_kind: 'session',
      revision: 1,
    });

    expect(() =>
      repository.insert(
        inboxItemSchema.parse({
          id: '80000000-0000-4000-8000-000000000099',
          campaignId,
          sessionId: foreignSessionId,
          rawText: 'Sessão de outra campanha.',
          status: 'new',
          originKind: 'session',
          capturedAt: timestamp,
          convertedObjectType: null,
          convertedObjectId: null,
          createdAt: timestamp,
          updatedAt: timestamp,
          revision: 1,
        }),
      ),
    ).toThrow(/INBOX_SESSION_CAMPAIGN_MISMATCH/);
    expect(context.native.prepare('SELECT COUNT(*) AS total FROM inbox_items').get()).toEqual({
      total: 1,
    });
    expect(context.native.pragma('foreign_key_check')).toEqual([]);
    context.close();
  });
});

async function setup(): Promise<{
  context: DatabaseContext;
  repository: InboxRepository;
  service: InboxService;
}> {
  const root = await mkdtemp(path.join(os.tmpdir(), 'rpg-inbox-repository-test-'));
  roots.push(root);
  const directories = getDataDirectories(root);
  await ensureDataDirectories(directories);
  const context = await openApplicationDatabase(directories, new TestLogger());
  contexts.push(context);
  const insertCampaign = context.native.prepare(
    "INSERT INTO campaigns (id, name, status, created_at, updated_at, revision) VALUES (?, ?, 'active', ?, ?, 1)",
  );
  insertCampaign.run(campaignId, 'Ethéria', timestamp, timestamp);
  insertCampaign.run(otherCampaignId, 'Outra', timestamp, timestamp);
  const insertSession = context.native.prepare(
    `INSERT INTO sessions
      (id, campaign_id, sequence_number, title, created_at, updated_at)
     VALUES (?, ?, 1, ?, ?, ?)`,
  );
  insertSession.run(sessionId, campaignId, 'Sessão local', timestamp, timestamp);
  insertSession.run(foreignSessionId, otherCampaignId, 'Sessão externa', timestamp, timestamp);
  const repository = new InboxRepository(context.orm);
  return {
    context,
    repository,
    service: new InboxService({
      repository,
      campaigns: new CampaignRepository(context.orm),
      sessions: new SessionRepository(context.orm),
      createId: () => '80000000-0000-4000-8000-000000000001',
      now: () => timestamp,
    }),
  };
}
