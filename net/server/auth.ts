import {
  decodeSignature,
  EncodedSession,
  encodedSessionFromRecord,
  encodeSession,
  OwnedSession,
  Session,
  SESSION_CRYPTO_KEY_GEN_PARAMS,
  sessionIdFromSignature,
  sessionToRecord,
  signData,
  verifyData,
  verifyRequestSignature,
} from '../../db/session.ts';
import { uniqueId } from '../../base/common.ts';
import { deserializeDate, kDayMs, kSecondMs } from '../../base/date.ts';
import { assert } from '../../base/error.ts';
import { Item } from '../../cfds/base/item.ts';
import { HTTPMethod } from '../../logging/metrics.ts';
import { Endpoint, ServerServices } from './server.ts';
import { getBaseURL, getRequestPath } from './utils.ts';
// import { ResetPasswordEmail } from '../../emails/reset-password.tsx';
import { kSchemaUser, Schema, SchemaTypeUser } from '../../cfds/base/schema.ts';
import { normalizeEmail } from '../../base/string.ts';
import { ReadonlyJSONObject } from '../../base/interfaces.ts';
import { accessDenied } from '../../cfds/base/errors.ts';
import { copyToClipboard } from '../../base/development.ts';
import { MemRepoStorage, Repository } from '../../repo/repo.ts';
import { sleep } from '../../base/time.ts';
import { isDevelopmentBuild } from '../../base/development.ts';
import { GoatDB } from '../../db/db.ts';
import { coreValueCompare } from '../../base/core-types/comparable.ts';
import { bsearch, bsearch_idx } from '../../base/algorithms.ts';
import { itemPathGetPart, ItemPathPart } from '../../db/path.ts';

export const kAuthEndpointPaths = [
  '/auth/session',
  '/auth/send-login-email',
  '/auth/temp-login',
] as const;
export type AuthEndpointPath = (typeof kAuthEndpointPaths)[number];

export type GenericAuthError = 'AccessDenied';
export type CreateSessionError = 'MissingPublicKey' | 'InvalidPublicKey';
export type LoginError = 'MissingEmail' | 'MissingSignature';

export type AuthError = GenericAuthError | CreateSessionError | LoginError;

export interface TemporaryLoginToken extends ReadonlyJSONObject {
  readonly u: string; // User key
  readonly s: string; // Session ID
  readonly ts: number; // Creation timestamp
  readonly sl: string; // A random salt to ensure uniqueness
}

export class AuthEndpoint implements Endpoint {
  filter(
    services: ServerServices,
    req: Request,
    info: Deno.ServeHandlerInfo,
  ): boolean {
    const path = getRequestPath<AuthEndpointPath>(req);
    if (!kAuthEndpointPaths.includes(path)) {
      return false;
    }
    const method = req.method as HTTPMethod;
    switch (path) {
      case '/auth/session':
        return method === 'POST' || method === 'PATCH';

      case '/auth/send-login-email':
        return method === 'POST';

      case '/auth/temp-login':
        return method === 'GET';
    }
    return false;
  }

  async processRequest(
    services: ServerServices,
    req: Request,
    info: Deno.ServeHandlerInfo,
  ): Promise<Response> {
    const path = getRequestPath<AuthEndpointPath>(req);
    const method = req.method as HTTPMethod;
    switch (path) {
      case '/auth/session':
        if (method === 'POST') {
          return this.createNewSession(services, req);
        }
        break;

      case '/auth/send-login-email':
        return this.sendTemporaryLoginEmail(services, req);

      case '/auth/temp-login':
        return this.loginWithToken(services, req);
    }

    return new Response('Unknown request', {
      status: 400,
    });
  }

  private async createNewSession(
    services: ServerServices,
    req: Request,
  ): Promise<Response> {
    let publicKey: CryptoKey | undefined;
    try {
      const body = await req.json();
      const jwk = body.publicKey;
      if (typeof jwk !== 'object') {
        return responseForError('MissingPublicKey');
      }
      publicKey = await crypto.subtle.importKey(
        'jwk',
        jwk,
        SESSION_CRYPTO_KEY_GEN_PARAMS,
        true,
        ['verify'],
      );
    } catch (e: any) {
      return responseForError('InvalidPublicKey');
    }
    if (!publicKey) {
      return responseForError('MissingPublicKey');
    }
    const sessionId = uniqueId();
    const session: Session = {
      publicKey,
      id: sessionId,
      expiration: deserializeDate(Date.now() + 30 * kDayMs),
    };
    await persistSession(services, session);
    const encodedSession = await encodeSession(session);
    // Let updates time to propagate to our replicas
    if (!isDevelopmentBuild()) {
      await sleep(2 * kSecondMs);
    }
    const resp = new Response(
      JSON.stringify({
        session: encodedSession,
        roots: await fetchEncodedRootSessions(services.db),
      }),
    );
    resp.headers.set('Content-Type', 'application/json');
    return resp;
  }

  private async sendTemporaryLoginEmail(
    services: ServerServices,
    req: Request,
  ): Promise<Response> {
    // const smtp = services.email;
    const body = await req.json();
    const email = normalizeEmail(body.email);
    if (typeof email !== 'string') {
      return responseForError('MissingEmail');
    }

    const sig = body.signature;
    if (typeof sig !== 'string') {
      return responseForError('MissingSignature');
    }

    const requestingSessionId = sessionIdFromSignature(sig);
    if (!requestingSessionId) {
      return responseForError('AccessDenied');
    }

    const requestingSession = await fetchSessionById(
      services,
      requestingSessionId,
    );
    if (!requestingSession) {
      return responseForError('AccessDenied');
    }

    // Make sure a session doesn't try to change its owner
    if (requestingSession.owner !== undefined) {
      return responseForError('AccessDenied');
    }

    // Verify it's actually this session who generated the request
    if (!verifyData(requestingSession, sig, email)) {
      return responseForError('AccessDenied');
    }

    const { key: userKey, item: userItem } = await fetchUserByEmail(
      services,
      email,
    );
    // TODO (ofri): Rate limit this call

    // Unconditionally generate the signed token so this call isn't vulnerable
    // to timing attacks.
    const signedToken = await signData(services.settings.session, undefined, {
      u: userKey || '',
      s: requestingSessionId,
      ts: Date.now(),
      sl: uniqueId(),
    });
    const clickURL = `${getBaseURL(services)}/auth/temp-login?t=${signedToken}`;
    if (isDevelopmentBuild()) {
      // console.log(`****** ${clickURL} ******`);
      if (await copyToClipboard(clickURL)) {
        console.log(`Login URL copied to clipboard`);
      }
    }
    // Only send the mail if a user really exists. We send the email
    // asynchronously both for speed and to avoid timing attacks.
    if (userItem !== undefined) {
      // smtp.send({
      //   type: 'Login',
      //   to: email,
      //   subject: 'Login to Ovvio',
      //   plaintext: `Click on this link to login to Ovvio: ${clickURL}`,
      //   // html: ResetPasswordEmail({
      //   //   clickURL,
      //   //   baseUrl: getBaseURL(services),
      //   //   username: userRecord.get('name') || 'Anonymous',
      //   //   orgname: services.organizationId,
      //   // }),
      //   html: `<html><body><div>Click on this link to login to Ovvio: <a href="${clickURL}">here</a></body></html>`,
      // });
    }
    return new Response('OK', { status: 200 });
  }

  private async loginWithToken(
    services: ServerServices,
    req: Request,
  ): Promise<Response> {
    const encodedToken = new URL(req.url).searchParams.get('t');
    if (!encodedToken) {
      return this.redirectHome(services);
    }
    try {
      const signature = decodeSignature<TemporaryLoginToken>(encodedToken);
      const signerId = signature.sessionId;
      if (!signerId) {
        return this.redirectHome(services);
      }
      const signerSession = await fetchSessionById(services, signerId);
      if (
        !signerSession ||
        signerSession.owner !== 'root' || // Only root may sign login tokens
        !(await verifyData(signerSession, signature))
      ) {
        return this.redirectHome(services);
      }
      const userKey = signature.data.u;
      const usersRepo = await services.db.open('/sys/users');
      const user = usersRepo.valueForKey(userKey);
      if (!user || user[0].isNull) {
        return this.redirectHome(services);
      }
      const sessionsRepo = await services.db.open('/sys/sessions');
      const session = (await services.db.getTrustPool()).getSession(
        signature.data.s,
      );
      if (!session) {
        return this.redirectHome(services);
      }
      if (session.owner !== undefined) {
        return this.redirectHome(services);
      }
      session.owner = userKey;
      sessionsRepo.setValueForKey(
        session.id,
        await sessionToRecord(session),
        sessionsRepo.headForKey(session.id),
      );
      // Let the updated session time to replicate
      if (!isDevelopmentBuild()) {
        await sleep(3 * kSecondMs);
      }
      // userRecord.set('lastLoggedIn', new Date());
      // repo.setValueForKey(userKey, userRecord);
      return this.redirectHome(services);
    } catch (_: unknown) {
      return this.redirectHome(services);
    }
  }

  private redirectHome(services: ServerServices): Response {
    return new Response(null, {
      status: 307,
      headers: {
        Location: getBaseURL(services),
      },
    });
  }
}

export async function persistSession(
  services: ServerServices,
  session: Session | OwnedSession,
): Promise<void> {
  const repo = await services.db.open('/sys/sessions');
  const record = await sessionToRecord(session);
  await repo.setValueForKey(session.id, record, undefined);
  await services.db.flush('/sys/sessions');
}

export async function fetchEncodedRootSessions(
  db: GoatDB,
): Promise<EncodedSession[]> {
  const result: EncodedSession[] = [];
  const trustPool = await db.getTrustPool();
  const now = new Date();
  for (const session of trustPool.roots) {
    if (session.expiration < now) {
      continue;
    }
    assert(session.owner === 'root');
    result.push(await encodeSession(session));
  }
  return result;
}

async function fetchUserByEmail(
  services: ServerServices,
  email: string,
): Promise<{
  key: string | undefined;
  item: Item<SchemaTypeUser> | undefined;
}> {
  email = normalizeEmail(email);
  const query = services.db.query({
    schema: kSchemaUser,
    source: '/sys/users',
    sortDescriptor: ({ left, right }) =>
      coreValueCompare(left.get('email'), right.get('email')),
  });
  await query.loadingFinished();
  const results = query.results();
  const userIdx = bsearch_idx(results.length, (idx) =>
    coreValueCompare(results[idx].item.get('email'), email),
  );
  if (userIdx >= 0) {
    return results[userIdx];
  }
  // Lazily create operator users
  if (services.settings.operatorEmails.includes(email)) {
    const item = services.db.create('/sys/users', kSchemaUser, {
      email: email,
    });
    const key = itemPathGetPart(item.path, ItemPathPart.Item);
    return {
      key,
      item: services.db
        .repository('/sys/users')!
        .valueForKey<SchemaTypeUser>(key)![0],
    };
  }
  return { key: undefined, item: undefined };
}

export async function fetchSessionById(
  services: ServerServices,
  sessionId: string,
): Promise<Session | undefined> {
  return (await services.db.getTrustPool()).getSession(sessionId);
}

export function fetchUserById(
  services: ServerServices,
  userId: string,
): Item<SchemaTypeUser> | undefined {
  const entry = services.db
    .repository('/sys/users')!
    .valueForKey<SchemaTypeUser>(userId);
  return entry && entry[0];
}

function responseForError(err: AuthError): Response {
  let status = 400;
  if (err === 'AccessDenied') {
    status = 403;
  }
  return new Response(JSON.stringify({ error: err }), {
    status,
  });
}

export type Role = 'operator' | 'anonymous';

export async function requireSignedUser(
  services: ServerServices,
  requestOrSignature: Request | string,
  role?: Role,
): Promise<
  [
    userId: string | null,
    userItem: Item<SchemaTypeUser> | undefined,
    userSession: Session,
  ]
> {
  const signature =
    typeof requestOrSignature === 'string'
      ? requestOrSignature
      : requestOrSignature.headers.get('x-goat-sig');

  if (!signature) {
    throw accessDenied();
  }
  const signerSession = await fetchSessionById(
    services,
    sessionIdFromSignature(signature),
  );
  if (signerSession === undefined) {
    throw accessDenied();
  }
  if (!(await verifyRequestSignature(signerSession, signature))) {
    throw accessDenied();
  }
  const userId = signerSession.owner;
  if (userId === 'root') {
    return ['root', undefined, signerSession];
  }
  // Anonymous access
  if (userId === undefined) {
    if (role === 'anonymous') {
      return [null, Item.nullItem(), signerSession];
    }
    throw accessDenied();
  }
  const userItem = fetchUserById(services, userId);
  if (userItem === undefined) {
    throw accessDenied();
  }
  if (userItem.isDeleted) {
    throw accessDenied();
  }
  if (role === 'operator') {
    const email = userItem.get('email');
    if (email === undefined || email.length <= 0) {
      throw accessDenied();
    }
    if (!services.settings.operatorEmails.includes(email)) {
      throw accessDenied();
    }
  }
  return [userId, userItem, signerSession];
}
