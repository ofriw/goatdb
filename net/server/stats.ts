import { CoroutineScheduler } from '../../base/coroutine.ts';
import { kDayMs, kSecondMs, kWeekMs } from '../../base/date.ts';
import { ReadonlyJSONObject } from '../../base/interfaces.ts';
import { SchemeNamespace } from '../../cfds/base/scheme-types.ts';
import { ClientEventEntry } from '../../logging/client-events.ts';
import { NormalizedLogEntry } from '../../logging/entry.ts';
import { LogEntry } from '../../logging/log.ts';
import { requireSignedUser } from './auth.ts';
import { Endpoint, ServerServices } from './server.ts';
import { getRequestPath } from './utils.ts';

interface OrganizationStats {
  dau: number;
  wau: number;
  mau: number;
  scanSize: number;
}

interface StatsReducer {
  dauIds: Set<string>;
  wauIds: Set<string>;
  mauIds: Set<string>;
}

export class StatsEndpoint implements Endpoint {
  filter(
    services: ServerServices,
    req: Request,
    info: Deno.ServeHandlerInfo,
  ): boolean {
    if (req.method !== 'GET') {
      return false;
    }
    const path = getRequestPath(req);
    return path === '/org-stats.json';
  }

  async processRequest(
    services: ServerServices,
    req: Request,
    info: Deno.ServeHandlerInfo,
  ): Promise<Response> {
    // requireSignedUser(services, req, 'operator');
    const stats: OrganizationStats = {
      dau: 0,
      wau: 0,
      mau: 0,
      scanSize: 0,
    };
    await CoroutineScheduler.sharedScheduler().schedule(
      this.scanEvents(stats, services),
    );
    return new Response(JSON.stringify(stats), {
      headers: {
        'Content-Type': 'application/json',
      },
    });
  }

  private *scanEvents(
    outStats: OrganizationStats,
    services: ServerServices,
  ): Generator<void> {
    const sysDir = services.sync.getSysDir();
    const reducer: StatsReducer = {
      dauIds: new Set<string>(),
      wauIds: new Set<string>(),
      mauIds: new Set<string>(),
    };
    const operatorEmails = services.settings.operatorEmails;
    let eventCount = 0;
    for (const [userId, userRecord] of sysDir.indexes!.users.values()) {
      if (
        !userId ||
        !userRecord ||
        userRecord.isNull ||
        operatorEmails.includes(userRecord.get('email'))
      ) {
        continue;
      }
      const repo = services.sync.getRepository('events', userId);
      for (const key of repo.keys()) {
        const head = repo.headForKey(key);
        if (!head) {
          continue;
        }
        const record = repo.recordForCommit(head);
        if (record.scheme.namespace !== SchemeNamespace.EVENTS) {
          continue;
        }
        const entry = JSON.parse(
          record.get<string>('json')!,
        ) as NormalizedLogEntry<ClientEventEntry>;
        this.processEvent(entry, reducer, userId);
        ++eventCount;
        yield;
      }
    }
    outStats.dau = reducer.dauIds.size;
    outStats.wau = reducer.wauIds.size;
    outStats.mau = reducer.mauIds.size;
    outStats.scanSize = eventCount;
  }

  private processEvent(
    event: NormalizedLogEntry<ClientEventEntry>,
    reducer: StatsReducer,
    userId: string,
  ) {
    const dayTs = Date.now() - kDayMs;
    const weekTs = Date.now() - kWeekMs;
    const monthTs = Date.now() - 30 * kDayMs;
    if (event.timestamp >= monthTs) {
      reducer.mauIds.add(userId);
      if (event.timestamp >= weekTs) {
        reducer.wauIds.add(userId);
        if (event.timestamp >= dayTs) {
          reducer.dauIds.add(userId);
        }
      }
    }
  }
}
