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
import { Scheme } from '../../cfds/base/scheme.ts';
import { normalizeEmail } from '../../base/string.ts';
import { ReadonlyJSONObject } from '../../base/interfaces.ts';
import { accessDenied } from '../../cfds/base/errors.ts';
import { copyToClipboard } from '../../base/development.ts';
import { MemRepoStorage, Repository } from '../../repo/repo.ts';
import { SysDirIndexes } from './sync.ts';
import { sleep } from '../../base/time.ts';
import { isDevelopmentBuild } from '../../base/development.ts';

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
    if (!services.sync.ready) {
      return Promise.resolve(new Response(null, { status: 503 }));
    }
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
        roots: fetchEncodedRootSessions(services.sync.getSysDir()),
      }),
    );
    resp.headers.set('Content-Type', 'application/json');
    return resp;
  }

  private async sendTemporaryLoginEmail(
    services: ServerServices,
    req: Request,
  ): Promise<Response> {
    const smtp = services.email;
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

    const requestingSession = fetchSessionById(services, requestingSessionId);
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

    const [userKey, userRecord] = fetchUserByEmail(services, email);
    // TODO (ofri): Rate limit this call

    // We unconditionally generate the signed token so this call isn't
    // vulnerable to timing attacks.
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
    if (userRecord !== undefined) {
      smtp.send({
        type: 'Login',
        to: email,
        subject: 'Login to Ovvio',
        plaintext: `Click on this link to login to Ovvio: ${clickURL}`,
        // html: ResetPasswordEmail({
        //   clickURL,
        //   baseUrl: getBaseURL(services),
        //   username: userRecord.get('name') || 'Anonymous',
        //   orgname: services.organizationId,
        // }),
        html: `<html><body><div>Click on this link to login to Ovvio: <a href="${clickURL}">here</a></body></html>`,
      });
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
      const signerSession = fetchSessionById(services, signerId);
      if (
        !signerSession ||
        signerSession.owner !== 'root' || // Only root may sign login tokens
        !(await verifyData(signerSession, signature))
      ) {
        return this.redirectHome(services);
      }
      const userKey = signature.data.u;
      const repo = services.sync.getSysDir();
      const userRecord = repo.valueForKey(userKey);
      if (!userRecord || userRecord.isNull) {
        return this.redirectHome(services);
      }
      const session = fetchSessionById(services, signature.data.s);
      if (!session) {
        return this.redirectHome(services);
      }
      if (session.owner !== undefined) {
        return this.redirectHome(services);
      }
      session.owner = userKey;
      repo.setValueForKey(
        session.id,
        await sessionToRecord(session),
        repo.headForKey(session.id),
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
  const repo = services.sync.getSysDir();
  const record = await sessionToRecord(session);
  await repo.setValueForKey(session.id, record, undefined);
}

export function fetchEncodedRootSessions(
  sysDir: Repository<MemRepoStorage, SysDirIndexes>,
): EncodedSession[] {
  const result: EncodedSession[] = [];
  const rootSessions = sysDir.indexes!.rootSessions;
  for (const [_key, record] of rootSessions.values()) {
    if (record.get<Date>('expiration').getTime() - Date.now() <= 0) {
      continue;
    }
    assert(record.get('owner') === 'root');
    result.push(encodedSessionFromRecord(record));
  }
  return result;
}

function fetchUserByEmail(
  services: ServerServices,
  email: string,
): [key: string | undefined, record: Item | undefined] {
  email = normalizeEmail(email);
  const repo = services.sync.getSysDir();
  let row = repo.indexes!.users.find((_k, r) => r.get('email') === email, 1)[0];
  // Lazily create operator records
  if (services.settings.operatorEmails.includes(email)) {
    if (!row) {
      const record = new Item({
        scheme: Scheme.user(),
        data: {
          email,
          permissions: new Set(kAllUserPermissions),
        },
      });
      const key = uniqueId();
      repo.setValueForKey(key, record, undefined);
      row = [key, record];
    } else {
      const permissions =
        row[1].get<Set<string>>('permissions') || new Set<string>();
      let updated = false;
      for (const p of kAllUserPermissions) {
        if (!permissions.has(p)) {
          permissions.add(p);
          updated = true;
        }
      }
      if (updated) {
        row[1].set('permissions', permissions);
        const key = row[0];
        repo.setValueForKey(key, row[1], repo.headForKey(key));
      }
    }
  }
  return row ? [row[0]!, row[1]] : [undefined, undefined];
}

export function fetchSessionById(
  services: ServerServices,
  sessionId: string,
): Session | undefined {
  return services.trustPool.getSession(sessionId);
}

export function fetchUserById(
  services: ServerServices,
  userId: string,
): Item | undefined {
  const record = services.sync.getSysDir().valueForKey(userId);
  assert(record.isNull || record.scheme.namespace === SchemeNamespace.USERS);
  return record.isNull ? undefined : record;
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
  [userId: string | null, userRecord: Item | undefined, userSession: Session]
> {
  const signature =
    typeof requestOrSignature === 'string'
      ? requestOrSignature
      : requestOrSignature.headers.get('x-ovvio-sig');

  if (!signature) {
    throw accessDenied();
  }
  const signerSession = fetchSessionById(
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
  const userRecord = fetchUserById(services, userId);
  if (userRecord === undefined) {
    throw accessDenied();
  }
  if (userRecord.get('isDeleted', 0) !== 0) {
    throw accessDenied();
  }
  if (role === 'operator') {
    const email = userRecord.get<string>('email');
    if (email === undefined || email.length <= 0) {
      throw accessDenied();
    }
    if (!services.settings.operatorEmails.includes(email)) {
      throw accessDenied();
    }
  }
  return [userId, userRecord, signerSession];
}
