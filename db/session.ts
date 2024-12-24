import { JSONCyclicalEncoder } from '../base/core-types/encoding/json.ts';
import {
  deserializeDate,
  kDayMs,
  kMinuteMs,
  kSecondMs,
  serializeDate,
} from '../base/date.ts';
import {
  JSONObject,
  JSONValue,
  ReadonlyJSONObject,
} from '../base/interfaces.ts';
import { stableStringify } from '../base/json.ts';
import { Commit, CommitSerializeOptions } from '../repo/commit.ts';
import { uniqueId } from '../base/common.ts';
import { Item } from '../cfds/base/item.ts';
import { kSchemaSession, SchemaTypeSession } from '../cfds/base/schema.ts';
import {
  decodeBase32URL,
  decodeBase32URLString,
  encodeBase32URL,
} from '../base/string.ts';

export const SESSION_CRYPTO_KEY_GEN_PARAMS: EcKeyGenParams = {
  name: 'ECDSA',
  namedCurve: 'P-384',
};

export interface Session {
  id: string;
  publicKey: CryptoKey;
  owner?: string;
  expiration: Date;
}

export interface OwnedSession extends Session {
  privateKey: CryptoKey;
}

export interface EncodedSession extends JSONObject {
  id: string;
  publicKey: ReadonlyJSONObject;
  owner?: string;
  expiration: number;
}

export interface EncodedOwnedSession extends EncodedSession {
  privateKey: ReadonlyJSONObject;
}

export function isOwnedSession(session: Session): session is OwnedSession {
  return (session as OwnedSession).privateKey !== undefined;
}

export async function generateKeyPair(): Promise<CryptoKeyPair> {
  return await crypto.subtle.generateKey(SESSION_CRYPTO_KEY_GEN_PARAMS, true, [
    'sign',
    'verify',
  ]);
}

export async function generateSession(
  owner?: string,
  ttlMs = 30 * kDayMs,
): Promise<OwnedSession> {
  const keyPair = await generateKeyPair();
  const expiration = deserializeDate(Date.now() + ttlMs);
  return {
    id: uniqueId(),
    publicKey: keyPair.publicKey,
    privateKey: keyPair.privateKey,
    owner,
    expiration,
  };
}

export interface Signature<T extends JSONValue | undefined = undefined>
  extends ReadonlyJSONObject {
  /**
   * The id of the signer session.
   */
  sessionId: string;
  /**
   * URL safe Base-64 encoded signature of the data
   */
  signature: string;
  /**
   * When was this signature generated
   */
  timestamp: number;
  /**
   * Any additional data to sign that's embedded into the signature string.
   */
  data: T;
}

interface DataToSignContainer extends JSONObject {
  sessionId: string;
  extData?: JSONValue;
  sigData?: JSONValue;
}

/**
 * This is our lowest-level signing primitive. It takes two kinds of optional
 * data:
 * 1. External data, that's provided alongside the signature. This is useful
 *    when the data is potentially big such as commit data.
 *
 * 2. Embedded data, that's embedded into the signature string itself. Useful
 *    for short values that need to be easy to handle as a single string. Used
 *    for example for temporary login tokens.
 *
 * Both forms of data are signed together to form a single signature.]
 *
 * @param session The signing session.
 * @param externalData Optional external data.
 * @param embeddedData Optional embedded data.
 *
 * @returns A signature string that can be passed to `verifyData()`.
 */
export async function signData(
  session: OwnedSession,
  externalData?: JSONValue,
  embeddedData?: ReadonlyJSONObject,
): Promise<string> {
  const container: DataToSignContainer = {
    sessionId: session.id,
  };
  if (externalData) {
    container.extData = externalData;
  }
  if (embeddedData) {
    container.sigData = embeddedData;
  }
  const encoder = new TextEncoder();
  const stableJSONString = stableStringify(container);
  const buffer = encoder.encode(stableJSONString);
  const sig = await crypto.subtle.sign(
    {
      name: 'ECDSA',
      hash: { name: 'SHA-384' },
    },
    session.privateKey,
    buffer,
  );
  const res: Signature<typeof embeddedData> = {
    sessionId: session.id,
    timestamp: Date.now(),
    signature: encodeBase32URL(sig),
  } as Signature<typeof embeddedData>;
  if (embeddedData) {
    res.data = embeddedData;
  }
  return encodeSignature(res);
}

let gCachedDataVerifications: Map<string, boolean> = new Map();
setInterval(() => (gCachedDataVerifications = new Map()), 10 * kSecondMs);

/**
 * This is the lowest-level verification primitive. Given an expected signer,
 * an encoded signature string, and an optional external data, this function
 * verifies they all match.
 *
 * @param expectedSigner The expected signing session.
 * @param signature An encoded signature string.
 * @param externalData An external data that was provided to `signData()`.
 *
 * @returns Whether the signature matches or not.
 */
export async function verifyData<T extends JSONValue>(
  expectedSigner: Session,
  signature: string | undefined | Signature<T>,
  externalData?: JSONValue,
): Promise<boolean> {
  if (!signature) {
    return false;
  }
  const sig =
    typeof signature === 'string' ? decodeSignature(signature) : signature;
  if (!sig || !sig.sessionId || sig.sessionId !== expectedSigner.id) {
    return false;
  }
  // if (expectedSigner.expiration.getTime() - Date.now() <= 0) {
  //   return false;
  // }
  // Reject everything signed after the expiration of the signer.
  if (sig.timestamp > expectedSigner.expiration.getTime()) {
    return false;
  }
  const container: DataToSignContainer = {
    sessionId: expectedSigner.id,
  };
  if (externalData) {
    container.extData = externalData;
  }
  if (sig.data) {
    container.sigData = sig.data;
  }
  const encoder = new TextEncoder();
  const stableJSONString = stableStringify(container);
  const cacheKey = `${expectedSigner.id}:${sig.signature}:${stableJSONString}`;
  if (gCachedDataVerifications.has(cacheKey)) {
    return gCachedDataVerifications.get(cacheKey)!;
  }
  const buffer = encoder.encode(stableJSONString);
  const result = await crypto.subtle.verify(
    {
      name: 'ECDSA',
      hash: { name: 'SHA-384' },
    },
    expectedSigner.publicKey,
    decodeBase32URL(sig.signature),
    buffer,
  );
  gCachedDataVerifications.set(cacheKey, result);
  return result;
}

/**
 * Encodes a given signature to a URL-safe string.
 */
export function encodeSignature<T extends JSONValue | undefined>(
  sig: Signature<T>,
): string {
  const obj: JSONObject = {
    i: sig.sessionId,
    s: sig.signature,
    ts: sig.timestamp,
  };
  if (sig.data) {
    obj.d = sig.data;
  }
  return encodeBase32URL(JSON.stringify(obj));
}

export function decodeSignature<T extends JSONValue | undefined = undefined>(
  str: string,
): Signature<T>;
export function decodeSignature(str: undefined): undefined;

export function decodeSignature<T extends JSONValue | undefined = undefined>(
  str: string | undefined,
): Signature<T> | undefined;

/**
 * Decodes a given signature string to a Signature structure.
 * @param str The encoded signature string.
 * @returns A signature structure.
 */
export function decodeSignature<T extends JSONValue | undefined = undefined>(
  str: string | undefined,
): Signature<T> | undefined {
  if (!str) {
    return undefined;
  }
  const obj = JSON.parse(decodeBase32URLString(str));
  const result: Signature<T> = {
    sessionId: obj.i,
    signature: obj.s,
    timestamp: obj.ts,
  } as Signature<T>;
  if (obj.d) {
    result.data = obj.d;
  }
  return result;
}

export async function signCommit(
  session: OwnedSession,
  commit: Commit,
): Promise<Commit> {
  const signature = await signData(
    session,
    JSONCyclicalEncoder.serialize<CommitSerializeOptions>(commit, {
      signed: false,
    }),
  );
  return new Commit({
    id: commit.id,
    session: commit.session,
    key: commit.key,
    contents: commit.contents,
    timestamp: commit.timestamp,
    parents: commit.parents,
    ancestorsFilter: commit.ancestorsFilter,
    ancestorsCount: commit.ancestorsCount,
    signature,
    mergeBase: commit.mergeBase,
    mergeLeader: commit.mergeLeader,
    revert: commit.revert,
    orgId: commit.orgId,
    schemaManager: commit.schemaManager,
  });
}

export async function verifyCommit(
  expectedSigner: Session,
  commit: Commit,
): Promise<boolean> {
  return await verifyData(
    expectedSigner,
    commit.signature,
    JSONCyclicalEncoder.serialize<CommitSerializeOptions>(commit, {
      signed: false,
    }),
  );
}

export function signerIdFromCommit(commit: Commit): string | undefined {
  const sig = commit.signature;
  return sig && sessionIdFromSignature(sig);
}

export async function encodeSession(
  session: OwnedSession,
): Promise<EncodedOwnedSession>;

export async function encodeSession(session: Session): Promise<EncodedSession>;

export async function encodeSession(
  session: Session | OwnedSession,
): Promise<EncodedSession | EncodedOwnedSession> {
  const publicKey = (await crypto.subtle.exportKey(
    'jwk',
    session.publicKey,
  )) as ReadonlyJSONObject;

  if (isOwnedSession(session)) {
    return {
      ...session,
      publicKey,
      privateKey: (await crypto.subtle.exportKey(
        'jwk',
        session.privateKey,
      )) as ReadonlyJSONObject,
      expiration: serializeDate(session.expiration),
    };
  }
  return {
    ...session,
    publicKey,
    expiration: serializeDate(session.expiration),
  };
}

export async function decodeSession(
  session: EncodedOwnedSession,
): Promise<OwnedSession>;

export async function decodeSession(session: EncodedSession): Promise<Session>;

export async function decodeSession(
  session: EncodedSession | EncodedOwnedSession,
): Promise<Session | OwnedSession>;

export async function decodeSession(
  session: EncodedSession | EncodedOwnedSession,
): Promise<Session | OwnedSession> {
  const publicKey = await crypto.subtle.importKey(
    'jwk',
    session.publicKey as JsonWebKey,
    SESSION_CRYPTO_KEY_GEN_PARAMS,
    true,
    ['verify'],
  );
  if (session.privateKey) {
    const privateKey = await crypto.subtle.importKey(
      'jwk',
      session.privateKey as JsonWebKey,
      SESSION_CRYPTO_KEY_GEN_PARAMS,
      true,
      ['sign'],
    );
    return {
      ...session,
      publicKey,
      privateKey,
      expiration: deserializeDate(session.expiration),
    };
  }
  return {
    ...session,
    publicKey,
    expiration: deserializeDate(session.expiration),
  };
}

export async function sessionToRecord(
  session: Session,
): Promise<Item<SchemaTypeSession>> {
  const encodedSession = await encodeSession(session);
  return encodedSessionToRecord(encodedSession);
}

export async function sessionFromRecord(record: Item): Promise<Session> {
  return await decodeSession(encodedSessionFromRecord(record));
}

export function encodedSessionToRecord(
  encodedSession: EncodedSession,
): Item<SchemaTypeSession> {
  const data = {
    ...encodedSession,
    publicKey: JSON.stringify(encodedSession.publicKey),
    expiration: deserializeDate(encodedSession.expiration),
  };
  // Private keys don't exist in the Session scheme, but just to be extra
  // cautious, we delete the field here as well.
  delete (data as any).privateKey;
  return new Item<SchemaTypeSession>({
    schema: kSchemaSession,
    data,
  });
}

export function encodedSessionFromRecord(record: Item): EncodedSession {
  const data = record.cloneData(['id', 'owner', 'publicKey', 'expiration']);
  data.publicKey = JSON.parse(data.publicKey as string);
  data.expiration = serializeDate(data.expiration as Date);
  return data as EncodedSession;
}

interface RequestSignatureMetadata extends ReadonlyJSONObject {
  readonly id: string;
  readonly ts: number;
}

const REQUEST_SIG_EXPIRATION_MS = 3 * kMinuteMs;

export function generateRequestSignature(
  session: OwnedSession,
): Promise<string> {
  return signData(session, null, {
    id: uniqueId(),
    ts: Date.now(),
  });
}
let sessionIdsCache: Map<string, string> = new Map();
let requestSigCache: Map<string, boolean> = new Map();
setInterval(() => {
  sessionIdsCache = new Map();
  requestSigCache = new Map();
}, 10 * kSecondMs);

export async function verifyRequestSignature(
  session: Session,
  signature: string,
): Promise<boolean> {
  const cacheId = `${session.id}+${signature}`;
  let result = requestSigCache.get(cacheId);
  if (result !== undefined) {
    return result;
  }
  result = false;
  const sig = decodeSignature<RequestSignatureMetadata>(signature);
  if (Math.abs(Date.now() - sig.data.ts) <= REQUEST_SIG_EXPIRATION_MS) {
    result = await verifyData(session, sig);
  }
  requestSigCache.set(cacheId, result);
  return result;
}

export function sessionIdFromSignature(sig: string): string {
  let id = sessionIdsCache.get(sig);
  if (!id) {
    id = decodeSignature(sig).sessionId;
    sessionIdsCache.set(sig, id);
  }
  return id;
}

/**
 * Each commit in the graph is signed with the private key of the session that
 * generated it. The trust pool manages all known sessions and their public keys
 * which are later used to verify that the commits in the graph make only
 * modifications that are valid. Each commit's signature is checked against its
 * session's public key, and then the modifications themselves are checked to
 * ensure the creator only made changes within their scope of permissions.
 */
export class TrustPool {
  readonly roots: Session[];
  private readonly _sessions: Map<string, Session>;
  private readonly _changeCallback?: () => void;
  private _currentSession: OwnedSession;

  constructor(
    readonly orgId: string,
    currentSession: OwnedSession,
    roots?: Session[],
    trustedSessions?: Session[],
    changeCallback?: () => void,
  ) {
    this._currentSession = currentSession;
    this.roots = roots || [];
    const sessions = new Map<string, Session>();
    this._sessions = sessions;
    this._changeCallback = changeCallback;

    if (trustedSessions) {
      trustedSessions.forEach((s) => sessions.set(s.id, s));
    }

    for (const s of this.roots) {
      sessions.set(s.id, s);
    }
    sessions.set(currentSession.id, currentSession);
  }

  get currentSession(): OwnedSession {
    return this._currentSession;
  }

  get trustedSessions(): Session[] {
    return Array.from(this._sessions.values());
  }

  *sessions(): Generator<Session> {
    yield this.currentSession;
    for (const s of this.roots) {
      yield s;
    }
    for (const s of this.trustedSessions) {
      yield s;
    }
  }

  /**
   * Commits containing sessions follow stricter verification rules than all
   * other commits. Session commits MUST be signed by a root (server) session
   * or else we can't trust them.
   *
   * @param commit The commit to verify.
   */
  private async verifySession(commit: Commit): Promise<boolean> {
    if (!commit.orgId || commit.orgId !== this.orgId) {
      return false;
    }
    if (!commit.signature) {
      return false;
    }
    const signerId = signerIdFromCommit(commit);
    if (
      this.currentSession.owner === 'root' &&
      signerId === this.currentSession.id
    ) {
      return await verifyCommit(this.currentSession, commit);
    }
    for (const rootSession of this.roots) {
      if (signerId === rootSession.id) {
        return await verifyCommit(rootSession, commit);
      }
    }
    return false;
  }

  /**
   * When a commit containing a session is discovered, use this method to add
   * it to the trust pool. This method does the necessary checks to ensure the
   * integrity of this commit, then if all checks pass it adds the session to
   * the trust pool.
   *
   * @param s
   * @param commit
   * @returns
   */
  async addSession(s: Session, commit: Commit): Promise<boolean> {
    let updated = false;
    if (await this.verifySession(commit)) {
      updated = this.addSessionUnsafe(s);
    }
    return updated;
  }

  /**
   * Adds the given session to the trust pool, without verifying its origin
   * commit. Be very careful to only use this method for verified sessions.
   *
   * @param s The session to add to this trust pool.
   * @returns Whether the session has been added or not.
   */
  addSessionUnsafe(s: Session): boolean {
    let updated = false;
    const newExpiration = s.expiration.getTime();
    const existingSession = this._sessions.get(s.id);
    if (
      !existingSession ||
      existingSession.expiration.getTime() < newExpiration ||
      (!existingSession.owner && s.owner)
    ) {
      this._sessions.set(s.id, s);
      updated = true;
    }
    if (s.owner === 'root') {
      const roots = this.roots;
      let found = false;
      for (let i = 0; i < roots.length; ++i) {
        if (roots[i].id === s.id) {
          found = true;
          if (roots[i].expiration.getTime() < newExpiration) {
            roots[i] = s;
          }
          break;
        }
      }
      if (!found) {
        roots.push(s);
      }
    }
    if (
      s.id === this.currentSession.id &&
      ((s.owner && !this.currentSession.owner) ||
        s.expiration.getTime() > this.currentSession.expiration.getTime())
    ) {
      this._currentSession = {
        ...s,
        privateKey: this.currentSession.privateKey,
      };
    }
    if (updated && this._changeCallback) {
      this._changeCallback();
    }
    return updated;
  }

  getSession(id: string): Session | undefined {
    return this._sessions.get(id);
  }

  async verify(commit: Commit): Promise<boolean> {
    if (!commit.orgId || commit.orgId !== this.orgId) {
      return false;
    }
    const signerId = signerIdFromCommit(commit);
    if (!signerId) {
      return false;
    }
    const session = this.getSession(signerId);
    if (!session) {
      return false;
    }
    return await verifyCommit(session, commit);
  }
}
