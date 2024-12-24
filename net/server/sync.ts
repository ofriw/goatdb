import * as ArrayUtils from '../../base/array.ts';
import { mapIterable } from '../../base/common.ts';
import {
  JSONCyclicalDecoder,
  JSONCyclicalEncoder,
} from '../../base/core-types/encoding/json.ts';
import {
  JSONArray,
  JSONObject,
  ReadonlyJSONObject,
} from '../../base/interfaces.ts';
import { Session } from '../../db/session.ts';
import { log } from '../../logging/log.ts';
import { Commit } from '../../repo/commit.ts';
import { Repository } from '../../repo/repo.ts';
import { getGoatConfig } from '../../server/config.ts';
import { RepoClient } from '../client.ts';
import { SyncMessage } from '../message.ts';
import { sendJSONToURL } from '../rest-api.ts';
import { syncConfigGetCycles, kSyncConfigServer } from '../sync-scheduler.ts';
import { requireSignedUser } from './auth.ts';
import { Endpoint, ServerServices } from './server.ts';
import { getRequestPath } from './utils.ts';

export class SyncEndpoint implements Endpoint {
  filter(
    _services: ServerServices,
    req: Request,
    _info: Deno.ServeHandlerInfo,
  ): boolean {
    if (req.method !== 'POST') {
      return false;
    }
    return getRequestPath(req) === '/batch-sync';
  }

  processRequest(
    services: ServerServices,
    req: Request,
    info: Deno.ServeHandlerInfo,
  ): Promise<Response> {
    if (!req.body) {
      return Promise.resolve(
        new Response(null, {
          status: 400,
        }),
      );
    }
    if (getRequestPath(req) === '/batch-sync') {
      return this.processBatchSyncRequest(services, req, info);
    }
    return Promise.resolve(new Response(null, { status: 400 }));
  }

  async processBatchSyncRequest(
    services: ServerServices,
    req: Request,
    _info: Deno.ServeHandlerInfo,
  ): Promise<Response> {
    const encodedRequests = await req.json();
    if (!(encodedRequests instanceof Array)) {
      return Promise.resolve(new Response(null, { status: 400 }));
    }
    const sig = req.headers.get('X-Goat-Sig');
    if (!sig) {
      return Promise.resolve(new Response(null, { status: 400 }));
    }
    const [_userId, _userRecord, userSession] = await requireSignedUser(
      services,
      sig,
      'anonymous',
    );
    const results: JSONArray = [];
    for (const r of encodedRequests) {
      const { path, msg } = r;
      results.push({
        path,
        res: await this.doSync(services, path, userSession, msg),
      });
    }
    const respJsonStr = JSON.stringify(results);
    return new Response(respJsonStr);
  }

  private async doSync(
    services: ServerServices,
    path: string,
    userSession: Session,
    json: JSONObject,
  ): Promise<JSONObject> {
    return await this._handleSyncRequestAfterAuth(
      services,
      json,
      async (values) =>
        (
          await services.db.repository(path)!.persistCommits(values)
        ).length,
      async () =>
        mapIterable(
          (await services.db.open(path)).commits(userSession),
          (c) => [c.id, c],
        ),
      () => services.db.repository(path)!.numberOfCommits(userSession),
      services.db.clientsForRepo(path),
      true,
      path.startsWith('/sys/'),
    );
  }

  private async _handleSyncRequestAfterAuth(
    services: ServerServices,
    msgJSON: JSONObject,
    persistCommits: (commits: Commit[]) => Promise<number>,
    fetchAll: () => Promise<Iterable<[string, Commit]>>,
    getLocalCount: () => number,
    replicas: Iterable<RepoClient> | undefined,
    includeMissing: boolean,
    lowAccuracy: boolean,
  ): Promise<ReadonlyJSONObject> {
    const decoder = JSONCyclicalDecoder.get(msgJSON);
    const msg = new SyncMessage(
      {
        decoder,
        orgId: services.organizationId,
      },
      services.db.schemaManager,
    );
    decoder.finalize();
    let syncCycles = syncConfigGetCycles(kSyncConfigServer);
    if (msg.values.length > 0) {
      if ((await persistCommits(msg.values)) > 0) {
        // If we got a new commit from our client, we increase our filter's
        // accuracy to the maximum to avoid false-leaves at the tip of the
        // commit graph.
        syncCycles = 1;
        if (replicas) {
          // Sync changes with replicas
          for (const c of replicas) {
            c.touch();
          }
        }
      }
    }

    const syncResp = SyncMessage.build(
      msg.filter,
      await fetchAll(),
      getLocalCount(),
      msg.size,
      syncCycles,
      services.organizationId,
      services.db.schemaManager,
      // Don't return new commits to old clients
      includeMissing && msg.buildVersion >= getGoatConfig().version,
      lowAccuracy,
    );

    const encodedResp = JSONCyclicalEncoder.serialize(syncResp);
    msg.filter.reuse();
    syncResp.filter.reuse();
    return encodedResp;
  }
}

function repoIdExcludingShardSuffix(id: string): string {
  const [repoId, _shardId] = id.split('--');
  return repoId;
}
