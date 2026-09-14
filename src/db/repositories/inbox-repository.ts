import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { inboxItemSchema, type InboxItem } from '../../core/contracts/inbox';
import { inboxItems } from '../schema';
import type * as schema from '../schema';

export class InboxRepository {
  public constructor(private readonly database: BetterSQLite3Database<typeof schema>) {}

  public insert(item: InboxItem): InboxItem {
    this.database.transaction((transaction) => {
      transaction.insert(inboxItems).values(item).run();
    });
    return inboxItemSchema.parse(item);
  }
}
