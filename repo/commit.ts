import {
  Encodable,
  Encoder,
  Equatable,
  ReadonlyCoreObject,
} from '../base/core-types/base.ts';
import { Item } from '../cfds/base/item.ts';
import { Edit } from '../cfds/base/edit.ts';
import {
  ConstructorDecoderConfig,
  Decodable,
  Decoder,
} from '../base/core-types/encoding/types.ts';
import { isDecoderConfig } from '../base/core-types/encoding/utils.ts';
import { uniqueId } from '../base/common.ts';
import { coreValueEquals } from '../base/core-types/equals.ts';
import { assert } from '../base/error.ts';
import { Schema, SchemaManager } from '../cfds/base/schema.ts';
import { VersionNumber } from '../base/version-number.ts';
import { getGoatConfig } from '../server/config.ts';
import { Comparable, coreValueCompare } from '../base/core-types/index.ts';
import { ReadonlyJSONArray, ReadonlyJSONObject } from '../base/interfaces.ts';
import {
  JSONCyclicalDecoder,
  JSONCyclicalEncoder,
} from '../base/core-types/encoding/json.ts';
// import { BloomFilter } from '../base/bloom.ts';
import { BloomFilter } from '../cpp/bloom_filter.ts';
import { encodeBase64 } from 'std/encoding/base64.ts';
import { decodeBase64 } from '../base/buffer.ts';

export type CommitResolver = (commitId: string) => Commit;

export interface DocContents extends ReadonlyCoreObject {
  readonly record: Item;
}

export interface DeltaContents extends ReadonlyCoreObject {
  readonly base: string;
  readonly edit: Edit;
}

export type CommitContents = DocContents | DeltaContents;

// NOTE: When adding fields to a commit, support must also be explicitly added
// in:
// 1. /auth/session.ts > signCommit()
// 2. /repo/repo.ts -> Repository.deltaCompressIfNeeded()
export interface CommitConfig {
  id?: string;
  session: string;
  orgId: string;
  key: string;
  contents: Item | CommitContents;
  parents?: string | Iterable<string>;
  ancestorsFilter: BloomFilter;
  ancestorsCount: number;
  timestamp?: Date | number;
  buildVersion?: VersionNumber;
  signature?: string;
  mergeBase?: string;
  mergeLeader?: string;
  revert?: string;
  frozen?: true;
  schemaManager?: SchemaManager;
}

export interface CommitSerializeOptions {
  signed?: boolean;
  local?: boolean;
}

const FROZEN_COMMITS = new Map<string, Commit>();
const SERIALIZED_COMMITS = new Map<string, ReadonlyJSONObject>();

export const CONNECTION_ID = uniqueId();

export interface CommitDecoderConfig<T = object>
  extends ConstructorDecoderConfig<T> {
  orgId: string;
}

export class Commit implements Encodable, Decodable, Equatable, Comparable {
  readonly orgId: string;
  readonly schemaManager: SchemaManager;
  private _buildVersion!: VersionNumber;
  private _id!: string;
  private _session!: string;
  private _key!: string;
  private _parents: string[] | undefined;
  private _ancestorsFilter?: BloomFilter;
  private _ancestorsCount?: number;
  private _timestamp!: number;
  private _contents!: CommitContents;
  private _signature?: string;
  private _mergeBase?: string;
  private _mergeLeader?: string;
  private _revert?: string;
  private _cachedChecksum?: string;
  private _frozen: boolean = false;
  private _connectionId = CONNECTION_ID;
  private _age?: number;

  static get connectionId(): string {
    return CONNECTION_ID;
  }

  constructor(
    config: CommitConfig | CommitDecoderConfig,
    schemaManager?: SchemaManager,
  ) {
    this.schemaManager = schemaManager || SchemaManager.default;
    if (isDecoderConfig(config)) {
      this.orgId = config.orgId;
      this.deserialize(config.decoder);
    } else {
      let { parents, contents } = config;
      if (typeof parents === 'string') {
        parents = [parents];
      } else if (!parents) {
        parents = [];
      } else {
        parents = Array.from(parents);
      }
      if (contents instanceof Item) {
        contents = {
          record: contents,
        };
      }

      this._id = config.id || uniqueId();
      this._session = config.session;
      this.orgId = config.orgId;
      this._key = config.key;
      this._parents = Array.from(parents);
      this._ancestorsFilter = config.ancestorsFilter;
      this._ancestorsCount = config.ancestorsCount;
      let ts = config.timestamp;
      if (ts instanceof Date) {
        ts = ts.getTime();
      }
      this._timestamp = ts || Date.now();
      this._contents = commitContentsClone(contents);
      // Actively ensure nobody tries to mutate our record. Commits must be
      // immutable.
      if (commitContentsIsDocument(this._contents)) {
        this._contents.record.lock();
      }
      this._buildVersion = config.buildVersion || getGoatConfig().version;
      this._signature = config.signature;
      this._mergeBase = config.mergeBase;
      this._mergeLeader = config.mergeLeader;
      this._revert = config.revert;
      this._frozen = config.frozen === true;
    }
  }

  get id(): string {
    return this._id;
  }

  get key(): string {
    return this._key;
  }

  get session(): string {
    return this._session;
  }

  get parents(): string[] {
    return this._parents || [];
  }

  get ancestorsFilter(): BloomFilter {
    return this._ancestorsFilter || new BloomFilter({ size: 1, fpr: 0.5 });
  }

  get ancestorsCount(): number {
    return this._ancestorsCount || 0;
  }

  get timestamp(): number {
    return this._timestamp;
  }

  get contents(): CommitContents {
    return this._contents;
  }

  get record(): Item | undefined {
    const c = this.contents;
    return commitContentsIsDocument(c) ? c.record : undefined;
  }

  get contentsChecksum(): string {
    if (!this._cachedChecksum) {
      const contents = this.contents;
      this._cachedChecksum = commitContentsIsDocument(contents)
        ? contents.record.checksum
        : contents.edit.dstChecksum;
    }
    return this._cachedChecksum;
  }

  get buildVersion(): VersionNumber {
    return this._buildVersion;
  }

  get scheme(): Schema | undefined {
    const contents = this.contents;
    if (commitContentsIsDelta(contents)) {
      return contents.edit.scheme;
    }
    return contents.record.schema;
  }

  get signature(): string | undefined {
    return this._signature;
  }
  get mergeBase(): string | undefined {
    return this._mergeBase;
  }
  get mergeLeader(): string | undefined {
    return this._mergeLeader;
  }

  get revert(): string | undefined {
    return this._revert;
  }

  get frozen(): boolean {
    return this._frozen;
  }

  get connectionId(): string {
    return this._connectionId;
  }

  get createdLocally(): boolean {
    return this._connectionId === CONNECTION_ID;
  }

  get age(): number | undefined {
    return this._age;
  }

  set age(v: number) {
    assert(this._age === undefined);
    this._age = v;
  }

  serialize(encoder: Encoder, opts?: CommitSerializeOptions): void {
    encoder.set('ver', this.buildVersion);
    encoder.set('id', this.id);
    encoder.set('k', this.key);
    encoder.set('s', this.session);
    encoder.set('ts', this.timestamp);
    encoder.set('org', this.orgId);
    const parents = this.parents;
    if (parents.length > 0) {
      encoder.set('p', parents);
    }
    if (this._ancestorsFilter) {
      encoder.set('af', this.ancestorsFilter.serialize());
    }
    if (this._ancestorsCount) {
      encoder.set('ac', this.ancestorsCount);
    }
    const contentsEncoder = encoder.newEncoder();
    commitContentsSerialize(this.contents, contentsEncoder);
    encoder.set('c', contentsEncoder.getOutput());
    if (this._signature && opts?.signed !== false) {
      encoder.set('sig', this._signature);
    }
    if (this.mergeBase) {
      encoder.set('mb', this.mergeBase);
    }
    if (this.mergeLeader) {
      encoder.set('ml', this.mergeLeader);
    }
    if (this.revert) {
      encoder.set('revert', this.mergeLeader);
    }
    if (this.connectionId) {
      encoder.set('cid', this.connectionId);
    }
    if (opts?.local === true && this.age !== undefined) {
      encoder.set('age', this.age);
    }
  }

  toJS(opts?: CommitSerializeOptions): ReadonlyJSONObject {
    const id = this.id;
    let result = SERIALIZED_COMMITS.get(id);
    if (!result) {
      result = JSONCyclicalEncoder.serialize(this, opts);
      SERIALIZED_COMMITS.set(id, result);
    }
    return result;
  }

  static fromJS(
    orgId: string,
    obj: ReadonlyJSONObject,
    schemaManager: SchemaManager,
  ): Commit {
    const id = obj.id as string;
    let result = FROZEN_COMMITS.get(id);
    if (!result) {
      const decoder = JSONCyclicalDecoder.get(obj);
      result = new Commit({ decoder, orgId }, schemaManager);
      result._frozen = true;
      FROZEN_COMMITS.set(id, result);
      if (
        ((obj.c as ReadonlyJSONObject).r as ReadonlyJSONObject | undefined)
          ?.cs !== undefined
      ) {
        SERIALIZED_COMMITS.set(id, obj);
      }
      decoder.finalize();
    }
    // assert(
    //   !result.orgId || result.orgId === orgId,
    //   `Incompatible organization id. Expected "${orgId}" got "${result.orgId}"`,
    // );
    return result;
  }

  static fromJSArr(
    orgId: string,
    arr: readonly ReadonlyJSONObject[],
    schemaManager: SchemaManager,
  ): Commit[] {
    const result: Commit[] = [];
    for (const obj of arr) {
      const id = obj.id as string;
      let c = FROZEN_COMMITS.get(id);
      if (!c) {
        const decoder = JSONCyclicalDecoder.get(obj);
        c = new Commit({ decoder, orgId }, schemaManager);
        c._frozen = true;
        FROZEN_COMMITS.set(id, c);
        if (
          ((obj.c as ReadonlyJSONObject).r as ReadonlyJSONObject | undefined)
            ?.cs !== undefined
        ) {
          SERIALIZED_COMMITS.set(id, obj);
        }
        decoder.finalize();
      }
      result.push(c);
    }
    return result;
  }

  deserialize(decoder: Decoder): void {
    assert(!this.frozen);
    // const encodedOrgId = decoder.get<string>('org');
    // assert(
    //   !encodedOrgId || encodedOrgId === this.orgId,
    //   `Organization id mismatch. Expected "${this.orgId}" but got "${encodedOrgId}"`,
    // );
    this._buildVersion = decoder.get<number>('ver')!;
    this._id = decoder.get<string>('id')!;
    this._key = decoder.get<string>('k')!;
    this._session = decoder.get<string>('s')!;
    this._timestamp = decoder.get<number>('ts') || Date.now();
    this._parents = decoder.get<string[]>('p');
    // const filterDecoder = decoder.getDecoder('af');
    this._ancestorsFilter = decoder.has('af')
      ? BloomFilter.deserialize(decoder.get<string>('af')!)
      : undefined;
    // if (filterDecoder instanceof JSONCyclicalDecoder) {
    //   filterDecoder.finalize();
    // }
    this._ancestorsCount = decoder.get<number>('ac');
    const contentsDecoder = decoder.getDecoder('c');
    this._contents = commitContentsDeserialize(
      contentsDecoder,
      this.schemaManager,
    );
    if (contentsDecoder instanceof JSONCyclicalDecoder) {
      contentsDecoder.finalize();
    }
    this._signature = decoder.get<string | undefined>('sig');
    this._mergeBase = decoder.get<string | undefined>('mb');
    this._mergeLeader = decoder.get<string | undefined>('ml');
    this._revert = decoder.get<string | undefined>('revert');
    this._cachedChecksum = undefined;
    this._connectionId = decoder.get<string>('cid') || CONNECTION_ID;
    this._age = decoder.get<number>('age');
  }

  isEqual(other: Commit): boolean {
    if (this.id !== other.id) {
      return false;
    }
    assert(compareCommitsByValue(this, other));
    return true;
  }

  compare(other: Commit): number {
    const dt = this.timestamp - other.timestamp;
    if (dt !== 0) {
      return dt;
    }
    return coreValueCompare(this.key, other.key);
  }
}

export function commitContentsIsDelta(c: CommitContents): c is DeltaContents {
  return typeof c.base === 'string';
}

export function commitContentsIsDocument<S extends Schema>(
  c: CommitContents,
): c is DocContents {
  return c.record instanceof Item;
}

export function commitContentsSerialize(
  c: CommitContents,
  encoder: Encoder,
): void {
  if (commitContentsIsDocument(c)) {
    encoder.set('r', c.record.toJS());
  } else {
    encoder.set('b', c.base);
    encoder.set('e', c.edit.toJS());
  }
}

export function commitContentsDeserialize(
  decoder: Decoder,
  schemaManager: SchemaManager,
): CommitContents {
  if (decoder.has('r')) {
    const recordDecoder = decoder.getDecoder('r');
    const record = new Item({ decoder: recordDecoder }, schemaManager);
    if (recordDecoder instanceof JSONCyclicalDecoder) {
      recordDecoder.finalize();
    }
    record.lock();
    return {
      record: record,
    };
  } else {
    const editDecoder = decoder.getDecoder('e');
    const r = {
      base: decoder.get<string>('b')!,
      edit: new Edit({ decoder: editDecoder }),
    };
    if (editDecoder instanceof JSONCyclicalDecoder) {
      editDecoder.finalize();
    }
    return r;
  }
}

function compareCommitsByValue(c1: Commit, c2: Commit): boolean {
  return (
    c1.id === c2.id &&
    c1.buildVersion === c2.buildVersion &&
    c1.key === c2.key &&
    c1.session === c2.session &&
    coreValueEquals(c1.timestamp, c2.timestamp) &&
    coreValueEquals(c1.parents, c2.parents) &&
    coreValueEquals(c1.contents, c2.contents)
  );
}

function commitContentsClone(contents: CommitContents): CommitContents {
  if (commitContentsIsDelta(contents)) {
    return {
      base: contents.base,
      edit: contents.edit.clone(),
    };
  }
  const record = contents.record.clone();
  record.normalize();
  return {
    record,
  };
}
