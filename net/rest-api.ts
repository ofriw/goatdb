import {
  decodeSession,
  EncodedSession,
  generateRequestSignature,
  OwnedSession,
  Session,
  signData,
} from '../db/session.ts';
import { kSecondMs } from '../base/date.ts';
import { JSONValue, ReadonlyJSONObject } from '../base/interfaces.ts';
import { randomInt } from '../base/math.ts';
import { sleep } from '../base/time.ts';
import { timeout } from '../cfds/base/errors.ts';
import { getGoatConfig } from '../server/config.ts';

export async function createNewSession(
  publicKey: CryptoKey,
): Promise<[Session | undefined, Session[] | undefined]> {
  try {
    const resp = await sendJSONToEndpoint('/auth/session', undefined, {
      publicKey: (await crypto.subtle.exportKey(
        'jwk',
        publicKey,
      )) as ReadonlyJSONObject,
    });
    if (resp.status !== 200) {
      return [undefined, undefined];
    }
    const body = await resp.json();
    const encodedRoots = body.roots as EncodedSession[];
    const roots: Session[] = [];
    for (const e of encodedRoots) {
      roots.push(await decodeSession(e));
    }
    return [await decodeSession(body.session), roots];
  } catch (_err: unknown) {
    debugger;
    return [undefined, undefined];
  }
}

export async function sendLoginEmail(
  session: OwnedSession,
  email: string,
): Promise<boolean> {
  try {
    const resp = await sendJSONToEndpoint('/auth/send-login-email', undefined, {
      email,
      signature: await signData(session, email),
    });
    return resp.status === 200;
  } catch (_err: unknown) {
    return false;
  }
}

export function getBaseURL(): string {
  const serverURL = getGoatConfig().serverURL;
  return serverURL || `${location.protocol}//${location.host}`;
}

export function getOrganizationId(): string {
  const config = getGoatConfig();
  if (!self.Deno && config.orgId) {
    return config.orgId;
  }
  const serverURL = config.serverURL;
  return organizationIdFromURL(serverURL || location.toString()) || 'localhost';
}

function urlForEndpoint(endpoint: string): string {
  if (endpoint[0] === '/') {
    endpoint = endpoint.substring(1);
  }
  return `${getBaseURL()}/${endpoint}`;
}

export function sendJSONToEndpoint(
  endpoint: string,
  session: OwnedSession | undefined,
  json: ReadonlyJSONObject,
): Promise<Response> {
  return sendJSONToURL(urlForEndpoint(endpoint), session, json);
}

let gAccessDeniedCount = 0;

export async function sendJSONToURL(
  url: string,
  sessionOrSignature: OwnedSession | undefined | string,
  json: JSONValue,
  orgId?: string,
  timeoutMs = 5 * kSecondMs,
): Promise<Response> {
  const headers: HeadersInit = {
    'Content-Type': 'application/json',
  };
  if (sessionOrSignature !== undefined) {
    if (typeof sessionOrSignature !== 'string') {
      sessionOrSignature = await generateRequestSignature(sessionOrSignature);
    }
    headers['x-goat-sig'] = sessionOrSignature;
  }
  if (orgId) {
    headers['x-org-id'] = orgId;
  }
  const abortController = new AbortController();
  const fetchPromise = fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify(json),
    signal: abortController.signal,
  });
  let aborted = false;
  const timeoutPromise = (async () => {
    await sleep(timeoutMs);
    aborted = true;
    abortController.abort();
  })();
  await Promise.any([fetchPromise, timeoutPromise]);
  if (aborted) {
    throw timeout();
  }
  const resp = await fetchPromise;
  if (resp.status === 403) {
    // if (self.Deno === undefined && ++gAccessDeniedCount === 10) {
    //   await IDBRepositoryBackup.logout();
    // } else {
    //   await sleep(kSecondMs);
    // }
  } else {
    gAccessDeniedCount = 0;
  }
  return resp;
}

/**
 * WARNING: This function is used by the server to direct requests to the
 * appropriate organization, and thus must be secure. This seemingly trivial
 * function deals with data that arrives from anywhere in the internet. We must
 * treat it as potentially hostile and not assume we're running in a safe
 * browser environment.
 */
export function organizationIdFromURL(url: string | URL): string | undefined {
  if (typeof url === 'string') {
    url = new URL(url);
  }
  const hostname = url.hostname.toLowerCase();
  if (hostname === 'localhost' || hostname === '127.0.0.1') {
    return 'localhost';
  }
  const comps = url.hostname.split('.');
  if (comps.length !== 3) {
    return undefined;
  }
  const maybeId = comps[0];
  if (isValidOrgId(maybeId)) {
    return maybeId;
  }
  return undefined;
}

const RESERVED_ORG_IDS = [
  'me',
  'team',
  'us',
  'user',
  'profile',
  'ovvio',
  'debug',
  'localhost',
];

function isValidOrgId(id: string): boolean {
  const len = id.length;
  if (len < 3 || len > 32) {
    return false;
  }
  if (RESERVED_ORG_IDS.includes(id)) {
    return false;
  }
  for (let i = 0; i < len; ++i) {
    const code = id.charCodeAt(i);
    // Hyphens are allowed
    if (code === 45) {
      continue;
    }
    // [0 -
    if (code < 48) {
      return false;
    }
    // 9], [A -
    if (code > 57 && code < 65) {
      return false;
    }
    // Z], [a -
    if (code > 90 && code < 97) {
      return false;
    }
    // z]
    if (code > 122) {
      return false;
    }
  }
  return true;
}
