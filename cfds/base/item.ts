import { assert } from '../../base/error.ts';
import {
  Schema,
  SchemaDataType,
  SchemaEquals,
  SchemaManager,
  SchemaRequiredFields,
  kNullSchema,
} from './schema.ts';
import {
  clone,
  DataChanges,
  deserialize,
  diff as objectDiff,
  diffKeys,
  equals as dataEqual,
  isValidData,
  normalize as normalizeObject,
  patch as objectPatch,
  serialize,
} from './object.ts';
import {
  ConstructorDecoderConfig,
  Decoder,
  isDecoderConfig,
  ReadonlyDecodedObject,
} from '../../base/core-types/encoding/index.ts';
import {
  JSONCyclicalDecoder,
  JSONCyclicalEncoder,
} from '../../base/core-types/encoding/json.ts';
import {
  ChecksumEncoderOpts,
  MD5Checksum,
  Murmur3Checksum,
} from '../../base/core-types/encoding/checksum.ts';
import { ReadonlyJSONObject } from '../../base/interfaces.ts';
import {
  CoreValue,
  Encodable,
  Encoder,
  coreValueEquals,
} from '../../base/core-types/index.ts';
import { SchemaGetFieldDef } from './schema.ts';

export interface ReadonlyItem<S extends Schema> {
  readonly isNull: boolean;
  readonly scheme: S;
  readonly isValid: boolean;
  readonly checksum: string;
  get<K extends keyof SchemaDataType<S>>(key: K): SchemaDataType<S>[K];
  has(key: keyof SchemaDataType<S>): boolean;
  cloneData(): SchemaDataType<S>;
}

export interface ItemConfig<S extends Schema> {
  scheme: S;
  data: Pick<SchemaDataType<S>, SchemaRequiredFields<S>> | SchemaDataType<S>;
  normalized?: boolean;
}

export interface EncodedItem {
  s: Decoder;
  data: ReadonlyDecodedObject;
}

const checksumSerOptions: ChecksumEncoderOpts = {
  // For checksum purposes we need to use the flat rep or we won't account
  // for depth changes. Computing the checksum on a DFS run of the tree
  // completely strips out the depth info.
  flatRep: true,
  local: false,
  typeSafe: true,
};

/**
 * An Item instance represents a snapshot of a data item including all of its
 * fields. An item is a map like object that tracks both the data and its
 * scheme. Items are the contents of specific versions (commits) in the version
 * graph (history).
 *
 * Typically you never need to create instances of this class directly. Instead,
 * use `GoatDB.item()` in order to get a LiveItem instance that's much easier
 * to work with.
 */
export class Item<S extends Schema = Schema>
  implements ReadonlyItem<S>, Encodable
{
  readonly schemeManager: SchemaManager;
  private _scheme!: S;
  private _data!: SchemaDataType<S>;
  private _checksum: string | undefined;
  private _normalized = false;
  private _locked = false;

  constructor(
    config: ItemConfig<S> | ConstructorDecoderConfig<EncodedItem>,
    schemeManager?: SchemaManager,
  ) {
    this.schemeManager = schemeManager || SchemaManager.default;
    if (isDecoderConfig(config)) {
      this.deserialize(config.decoder);
    } else {
      this._scheme = config.scheme;
      this._data = config.data as SchemaDataType<S>;
      this._normalized = config.normalized === true;
    }
    // this.normalize();
    // this.assertValidData();
  }

  private static _kNullDocument: Item<typeof kNullSchema> | undefined;
  /**
   * @returns An item with the null scheme.
   */
  static nullItem<S extends Schema = typeof kNullSchema>(): Item<S> {
    if (!this._kNullDocument) {
      this._kNullDocument = new this({ scheme: kNullSchema, data: {} });
      this._kNullDocument.lock();
    }
    return this._kNullDocument as unknown as Item<S>;
  }

  /**
   * Returns whether this item has a null scheme or not. The null scheme is
   * empty and has no fields and no values.
   */
  get isNull(): boolean {
    return this.scheme.ns === 'null';
  }

  /**
   * The scheme of this item.
   */
  get scheme(): S {
    return this._scheme;
  }

  /**
   * Returns the validation status of this item. Before persisting the item must
   * first be valid or it won't be able to be persisted locally nor sync'ed
   * across the network.
   */
  get isValid(): boolean {
    return isValidData(this.scheme, this._data)[0] as boolean;
  }

  /**
   * Indicates whether this item had been deleted or not. Deleted items will
   * eventually be garbage collected, and receive special treatment by the
   * system.
   *
   * NOTE: It's perfectly OK to mark a deleted item as not deleted. Yay for
   * distributed version control. The delete marker goes through conflict
   * resolution the same as any other scheme field.
   */
  get isDeleted(): boolean {
    return this.get('isDeleted') === true;
  }

  /**
   * Sets or clears the delete marker from this item. Marking an item as deleted
   * sets it for future garbage collection rather than delete it immediately.
   *
   * A deleted item will not appear in query results, but will still get sync'ed
   * and go through conflict resolution.
   *
   * NOTE: It's perfectly fine to set this flag then clear it at a later time.
   * Clearing the delete marker recovers the item and reverts it back to a
   * regular, not deleted, item.
   */
  set isDeleted(flag: boolean) {
    (this.set as (k: string, v: boolean) => void)('isDeleted', flag);
  }

  /**
   * WARNING: You probably shouldn't use this. Used internally as an
   * optimization to avoid unnecessary copying.
   *
   * @returns The underlying object primitive.
   */
  dataUnsafe(): SchemaDataType<S> {
    return this._data;
  }

  /**
   * Returns a checksum that can be used to efficiently test for equality
   * between two records. It's also used to guard against diff/patch bugs.
   *
   * Any legacy cryptographic hash would probably do here. The current
   * implementation uses MD5 simply because its so common.
   */
  get checksum(): string {
    this.normalize();
    if (this._checksum === undefined) {
      const csEncoder = new Murmur3Checksum();
      serialize(csEncoder, this._scheme, this._data, checksumSerOptions);
      this._checksum = csEncoder.getOutput();
    }
    return this._checksum;
  }

  /**
   * Returns the keys currently present in this item.
   */
  get keys(): (string & keyof SchemaDataType<S>)[] {
    return Object.keys(this._data);
  }

  /**
   * Returns the value for the given field or undefined.
   *
   * @param key The field's name.
   * @returns   The field's value or undefined.
   * @throws    Throws if attempting to access a field not defined by this
   *            item's scheme.
   */
  get<T extends keyof SchemaDataType<S>>(
    key: string & T,
  ): SchemaDataType<S>[T] {
    assert(
      SchemaGetFieldDef(this.scheme, key) !== undefined,
      `Unknown field name '${key}' for scheme '${this.scheme.ns}'`,
    );
    return this._data[key];
  }

  /**
   * Returns whether the given field is present on the current item or not.
   *
   * @param key The field's name.
   * @returns   Whether the field is currently present on this item or not.
   * @throws    Throws if attempting to access a field not defined by this
   *            item's scheme.
   */
  has<T extends keyof SchemaDataType<S>>(key: string & T): boolean {
    assert(
      SchemaGetFieldDef(this.scheme, key) !== undefined,
      `Unknown field name '${key}' for scheme '${this.scheme.ns}'`,
    );
    return Object.hasOwn(this._data, key);
  }

  /**
   * Sets the value for the given field.
   *
   * @param key   The field's name.
   * @param value The value to set. Must match the value defined in this item's
   *              scheme. If undefined is passed, this is the equivalent of
   *              calling `Item.delete(key)`.
   * @throws      Throws if attempting to set a field not defined by this item's
   *              scheme.
   */
  set<T extends keyof SchemaDataType<S>>(
    key: string & T,
    value: SchemaDataType<S>[T] | undefined,
  ): void {
    assert(!this._locked);
    assert(
      SchemaGetFieldDef(this.scheme, key) !== undefined,
      `Unknown field name '${key}' for scheme '${this.scheme.ns}'`,
    );
    if (value === undefined) {
      this.delete(key);
      return;
    }
    this._data[key] = value;
    this.invalidateCaches();
    this.normalize();
  }

  /**
   * A convenience method for setting several fields and values at once.
   * @param data The values to set.
   */
  setMulti(data: Partial<SchemaDataType<S>>): void {
    assert(!this._locked);
    for (const [key, value] of Object.entries(data)) {
      this.set(key, value);
    }
  }

  /**
   * Deletes a given field from this item.
   *
   * @param key The field to delete.
   * @returns   True if the field had been deleted, false if the field didn't
   *            exist and the item wasn't modified.
   * @throws    Throws if attempting to set a field not defined by this item's
   *            scheme.
   */
  delete<T extends keyof SchemaDataType<S>>(key: string & T): boolean {
    assert(!this._locked);
    assert(
      SchemaGetFieldDef(this.scheme, key) !== undefined,
      `Unknown field name '${key}' for scheme '${this.scheme.ns}'`,
    );
    if (Object.hasOwn(this._data, key)) {
      delete this._data[key];
      this.invalidateCaches();
      this.normalize();
      return true;
    }
    return false;
  }

  isEqual(other: Item<S>): boolean {
    if (this === other) {
      return true;
    }
    if (!SchemaEquals(this.scheme, other.scheme)) {
      return false;
    }
    this.normalize();
    other.normalize();
    if (
      this._checksum &&
      other._checksum &&
      this._checksum !== other._checksum
    ) {
      return false;
    }
    return dataEqual(this.scheme, this._data, other._data, {
      local: false,
    });
  }

  clone(): Item<S> {
    const scheme = this._scheme;
    const result = new Item({
      scheme,
      data: clone(scheme, this._data),
      normalized: this._normalized,
    });
    result._checksum = this._checksum;
    return result;
  }

  cloneData(onlyFields?: (keyof SchemaDataType<S>)[]): SchemaDataType<S> {
    return clone(this._scheme, this._data, onlyFields);
  }

  copyFrom(doc: ReadonlyItem<S> | Item<S>): void {
    assert(!this._locked);
    this._scheme = doc.scheme;
    this._data = doc.cloneData();
    this.invalidateCaches();
  }

  diff(other: Item<S>, byCharacter?: boolean) {
    assert(other instanceof Item);
    this.normalize();
    other.normalize();
    other.assertValidData();
    return objectDiff(other.scheme, this._data, other._data, {
      local: false,
      byCharacter,
    });
  }

  patch(changes: DataChanges): void {
    assert(!this._locked);
    const scheme = this.scheme;
    this._data = objectPatch(scheme, this._data, changes);
    this.invalidateCaches();
    this.normalize();
  }

  diffKeys(other: Item<S>, local: boolean): string[] {
    this.normalize();
    other.normalize();
    return diffKeys(other.scheme, this._data, other._data, {
      local,
    });
  }

  upgradeScheme(newScheme?: Schema): void {
    assert(!this._locked);
    const res = this.schemeManager.upgrade(this._data, this._scheme, newScheme);
    assert(res !== undefined, 'Upgrade failed');
    // Refresh caches if actually changed the data
    if (res[0] !== this._data) {
      [this._data, this._scheme] = res as [SchemaDataType<S>, S];
      this.invalidateCaches();
      this.normalize();
    }
  }

  upgradeSchemeToLatest(): boolean {
    assert(!this._locked);
    if (this.scheme.ns === null) {
      return false;
    }
    const latestScheme = this.schemeManager.get(this.scheme.ns);
    if (
      latestScheme !== undefined &&
      latestScheme.version > this.scheme.version
    ) {
      this.upgradeScheme();
      return true;
    }
    return false;
  }

  needsSchemeUpgrade(): boolean {
    if (this.scheme.ns === null) {
      return false;
    }
    const latestScheme = this.schemeManager.get(this.scheme.ns);
    if (
      latestScheme !== undefined &&
      latestScheme.version > this.scheme.version
    ) {
      return true;
    }
    return false;
  }

  normalize(): void {
    if (this._normalized || this.isNull) {
      return;
    }
    this.invalidateCaches();
    normalizeObject(this.scheme, this._data);
    this._normalized = true;
  }

  serialize(
    encoder: Encoder<string, CoreValue>,
    options = { local: false },
  ): void {
    this.normalize();
    encoder.set('s', this.schemeManager.encode(this.scheme));
    const dataEncoder = encoder.newEncoder();
    serialize(dataEncoder, this.scheme, this._data, {
      local: options.local,
    });
    encoder.set('d', dataEncoder.getOutput());
    encoder.set('n', this._normalized);
    // if (this._checksum) {
    encoder.set('cs', this.checksum);
    // }
  }

  deserialize(decoder: Decoder): void {
    assert(!this._locked);
    const scheme = this.schemeManager.decode(decoder.get<string>('s')!);
    assert(scheme !== undefined, 'Unknown scheme');
    this._scheme = scheme as S;
    const dataDecoder = decoder.getDecoder('d');
    this._data = deserialize(dataDecoder, this.scheme);
    if (dataDecoder instanceof JSONCyclicalDecoder) {
      dataDecoder.finalize();
    }
    // this.invalidateCaches();
    this._normalized = decoder.get<boolean>('n') || false;
    this.normalize();
    // this.assertValidData();
    // if (decoder.has('cs')) {
    //   assert(decoder.get('cs') === this.checksum, 'Checksum mismatch');
    // }
    this._checksum = decoder.get('cs');
  }

  toJS(local = false): ReadonlyJSONObject {
    const encoder = new JSONCyclicalEncoder();
    this.serialize(encoder, { local });
    return encoder.getOutput() as ReadonlyJSONObject;
  }

  static fromJS<S extends Schema>(obj: ReadonlyJSONObject): Item<S> {
    const decoder = JSONCyclicalDecoder.get(obj);
    const record = new this({ decoder });
    decoder.finalize();
    return record as unknown as Item<S>;
  }

  assertValidData(): void {
    const [valid, msg] = isValidData(this.scheme, this._data);
    assert(valid as boolean, msg as string);
  }

  invalidateCaches(): void {
    this._checksum = undefined;
    this._normalized = false;
  }

  get isLocked(): boolean {
    return this._locked;
  }

  lock(): void {
    this.checksum; // Force calculate our checksum
    this._locked = true;
  }

  unlock(): void {
    this._locked = false;
  }
}
