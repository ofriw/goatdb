import { Dictionary } from '../../base/collections/dict.ts';
import { CoreValue, ReadonlyCoreObject } from '../../base/core-types/base.ts';
import { coreValueClone } from '../../base/core-types/clone.ts';
import { CoreObject } from '../../base/core-types/index.ts';
import { assert, notReached } from '../../base/error.ts';
import { RichText } from '../richtext/tree.ts';
import { ValueType } from './types/index.ts';

/**
 * A mapping between a scheme type and its native variable type.
 */
export type FieldValue<T extends ValueType> = T extends 'string'
  ? string
  : T extends 'number'
  ? number
  : T extends 'boolean'
  ? boolean
  : T extends 'date'
  ? Date
  : T extends 'set'
  ? Set<CoreValue>
  : T extends 'map'
  ? Dictionary<string, CoreValue>
  : T extends 'richtext'
  ? RichText
  : CoreValue;

/**
 * A definition of a single field in a Scheme.
 */
export type FieldDef<T extends ValueType> = {
  /**
   * The type this field defines.
   */
  type: T;
  /**
   * A default initializer. Used to create a default value when the field is
   * missing.
   *
   * @param data The current value of the document. You must never modify this
   *             object, but you may read it to produce a default value for
   *             this field.
   *
   *             WARNING: Default initializers are called at an arbitrary order.
   *                      Don't depend on values of other default initializer
   *                      to be present in the data object.
   *
   * @returns A default value for this field.
   */
  default?: (data: ReadonlyCoreObject) => FieldValue<T>;
  /**
   * Determines whether this field is required or not. If a required fields is
   * missing, the Document will throw when attempting to serialize it.
   *
   * @default false
   */
  required?: boolean;
};

/**
 * Mapping between field name and its definition.
 */
export type SchemeFieldsDef = Record<string, FieldDef<ValueType>>;

/**
 * A Scheme defines the structure of a Document. Schemes are also versioned,
 * allowing for live, gradual migrations of data for some users, while others
 * continue to work with the old version in parallel.
 */
export type Scheme = {
  /**
   * The namespace of this scheme. The `null` and `session` namespaces are
   * reserved for the GoatDB's use.
   */
  ns: null | string;
  /**
   * The version of this scheme. Used to detect when a new version of a scheme
   * is available.
   */
  version: number;
  /**
   * A definition of all fields declared by this scheme.
   */
  fields: SchemeFieldsDef;
  /**
   * An optional upgrade function, used to migrate documents from an older
   * scheme to this scheme.
   *
   * When upgrading a document, upgrade functions are run in order until
   * reaching the latest version available. For example, if a document is at
   * scheme v1, and needs to be upgraded to v3, then first the upgrade function
   * of v2 will be run, then the result piped through the upgrade function of
   * v3.
   *
   * @param data The current data of the document. You must not modify this
   *             object directly. Instead, return a new one with the upgraded
   *             data.
   *
   * @param scheme The scheme of the current data.
   *
   * @returns An upgraded data that matches the current scheme.
   */
  upgrade?: (data: ReadonlyCoreObject, scheme: Scheme) => CoreObject;
};

/**
 * A list of built in fields that are automatically injected into all schemes.
 */
const kBuiltinFields: Record<string, FieldDef<ValueType>> = {
  isDeleted: {
    type: 'boolean',
  },
} as const;

/**
 * Given a scheme, extracts the names of all required fields.
 * Note: For practical purposes, fields with a default function are treated
 * as required from the type system.
 */
export type SchemeRequiredFields<
  T extends Scheme,
  K extends keyof T['fields'] = keyof T['fields'],
> = T['fields'][K]['required'] extends true
  ? // deno-lint-ignore ban-types
    T['fields'][K]['default'] extends Function
    ? never
    : K
  : never;

/**
 * Given a scheme, extracts the names of all optional fields.
 */
export type SchemeOptionalFields<
  T extends Scheme,
  K extends keyof T['fields'] = keyof T['fields'],
> = T['fields'][K]['required'] extends false | undefined ? K : never;

/**
 * Given a type (FieldValue) and a required + default function, this generates
 * the correct type or union with undefined.
 */
export type SchemeValueWithOptional<
  T,
  R extends boolean | undefined,
  // deno-lint-ignore ban-types
  D extends Function | undefined,
  // deno-lint-ignore ban-types
> = R extends true ? T : D extends Function ? T : undefined | T;

/**
 * Given a scheme, extracts the type of its data.
 */
export type SchemeDataType<T extends Scheme> = {
  [k in keyof T['fields']]: SchemeValueWithOptional<
    FieldValue<T['fields'][k]['type']>,
    T['fields'][k]['required'],
    T['fields'][k]['default']
  >;
};

/**
 * The null scheme is used to reserver keys for documents that they're scheme
 * isn't known yet. It's also used to simplify the internal diff/patch logic.
 *
 * Null records can't be persisted, and aren't synchronized across the network.
 */
export const kNullScheme: Scheme = {
  ns: null,
  version: 0,
  fields: {},
  upgrade: () => notReached('Attempting to upgrade the null scheme'),
} as const;
export type SchemeNullType = typeof kNullScheme;

/**
 * All connections to the DB are represented as Session documents, and are used
 * to verify the authenticity of commits.
 */
export const kSchemeSession = {
  ns: 'sessions',
  version: 1,
  fields: {
    id: {
      type: 'string',
      required: true,
    },
    publicKey: {
      type: 'string',
      required: true,
    },
    expiration: {
      type: 'date',
      required: true,
    },
    owner: {
      type: 'string', // NOTE: Anonymous sessions don't have an owner
    },
  },
} as const;
export type SchemeSessionType = typeof kSchemeSession;

/**
 * The SchemeManager acts as a registry of known Schemes for a given GoatDB
 * instance. It's initialized when the app starts and stays fixed during its
 * execution.
 *
 * Typically, apps use the `SchemeManager.default` instance, but are free to
 * create multiple managers each with different schemes registered.
 */
export class SchemeManager {
  private readonly _schemes: Map<string, Scheme[]>;

  /**
   * The default manager. Unless explicitly specified, GoatDB will default to
   * this manager.
   */
  static readonly default = new this();

  /**
   * Initialize a new SchemeManager.
   * @param schemes An optional list of Schemes to register.
   */
  constructor(schemes?: Iterable<Scheme>) {
    this._schemes = new Map();
    this.register(kSchemeSession);
    if (schemes) {
      for (const s of schemes) {
        this.register(s);
      }
    }
  }

  /**
   * Registers a scheme with this manager. This is a NOP if the scheme had
   * already been registered.
   *
   * @param scheme The scheme to register.
   */
  register(scheme: Scheme): void {
    assert(scheme.ns !== null);
    let arr = this._schemes.get(scheme.ns);
    if (!arr) {
      arr = [];
      this._schemes.set(scheme.ns, arr);
    }
    if (arr.find((s) => s.version === scheme.version) === undefined) {
      arr.push(scheme);
      arr.sort((s1, s2) => s2.version - s1.version);
    }
  }

  /**
   * Find a scheme that's been registered with this manager.
   *
   * @param ns The namespace for the scheme.
   * @param version If provided, searches for the specific version. Otherwise
   *                this method will return the latest version for the passed
   *                namespace.
   *
   * @returns A scheme or undefined if not found.
   */
  get(ns: string, version?: number): Scheme | undefined {
    const arr = this._schemes.get(ns);
    if (!arr) {
      return undefined;
    }
    return version ? arr.find((s) => s.version === version) : arr[0];
  }

  /**
   * Given a data object and its scheme, this method performs the upgrade
   * procedure to the target scheme.
   *
   * This method will refuse to upgrade to the target scheme if a single version
   * is missing. For example, if attempting to upgrade from v1 to v3, but the
   * v2 scheme is missing, then the upgrade will be refused.
   *
   * NOTE: You shouldn't use this method directly under normal circumstances.
   * The upgrade procedure will be performed automatically for you when needed.
   *
   * @param data         The data to upgrade.
   * @param dataScheme   The scheme of the passed data.
   * @param targetScheme The target scheme. If not provided, the latest scheme
   *                     for the namespace will be used.
   *
   * @returns An array in the form of [data, scheme] with the result. Returns
   *          undefined if the upgrade failed.
   */
  upgrade(
    data: CoreObject,
    dataScheme: Scheme,
    targetScheme?: Scheme,
  ): [CoreObject, Scheme] | undefined {
    if (
      (targetScheme === undefined || targetScheme.ns === null) &&
      dataScheme.ns === null
    ) {
      return [data, kNullScheme];
    }
    assert(
      dataScheme.ns !== null ||
        (targetScheme !== undefined && targetScheme.ns !== null),
    );
    const ns = targetScheme?.ns || dataScheme.ns!;
    const latest = this.get(ns, targetScheme?.version);
    if (!latest || latest.version === dataScheme.version) {
      return [data, dataScheme];
    }

    let currentScheme = dataScheme;
    let upgradedData = coreValueClone(data);
    for (let i = dataScheme.version + 1; i <= latest.version; ++i) {
      const scheme = this.get(ns, i);
      if (!scheme) {
        return undefined;
      }
      if (scheme.upgrade) {
        upgradedData = scheme.upgrade(upgradedData, currentScheme);
      }
      currentScheme = scheme;
    }
    return [upgradedData, currentScheme];
  }

  /**
   * Encoded a scheme to a marker string for storage.
   * @param scheme The scheme to encode.
   * @returns A string marker for this scheme.
   */
  encode(scheme: Scheme): string {
    if (scheme.ns === null) {
      return 'null';
    }
    return `${scheme.ns}/${scheme.version}`;
  }

  /**
   * Decodes a scheme marker to an actual Scheme.
   * @param str The scheme marker produced by a previous call to
   *            `SchemeManager.encode`.
   *
   * @returns The registered scheme or undefined if no such scheme is found.
   */
  decode(str: string /*| Decoder*/): Scheme | undefined {
    if (str === 'null') {
      return kNullScheme;
    }
    if (typeof str === 'string') {
      const [ns, ver] = str.split('/');
      return this.get(ns, parseInt(ver));
    }
    // if (str.has('ns') && str.has('version')) {
    //   const ns = str.get<string>('ns')!;
    //   const ver = str.get<number>('version')!;
    //   return this.get(ns, ver);
    // }
    return undefined;
  }
}

const gCachedSchemeFields = new WeakMap<
  Scheme,
  [string, FieldDef<ValueType>][]
>();

/**
 * Given a scheme, this function returns its field definitions as an iterable.
 * @param s A scheme.
 * @returns An iterable of field name and its definition.
 */
export function SchemeGetFields(
  s: Scheme,
): readonly [string, FieldDef<ValueType>][] {
  let r = gCachedSchemeFields.get(s);
  if (!r) {
    r = Object.entries(s.fields).concat(Object.entries(kBuiltinFields));
    Object.freeze(r);
    gCachedSchemeFields.set(s, r);
  }
  return r;
}

const gCachedSchemeRequiredFields = new WeakMap<Scheme, string[]>();
/**
 * Given a scheme, this functions returns an iterable of its required fields.
 * @param s A scheme.
 * @returns An iterable of required field names.
 */
export function SchemeGetRequiredFields(s: Scheme): readonly string[] {
  let r = gCachedSchemeRequiredFields.get(s);
  if (!r) {
    r = [];
    for (const [fieldName, def] of SchemeGetFields(s)) {
      if (def.required === true) {
        r.push(fieldName);
      }
    }
    Object.freeze(r);
    gCachedSchemeRequiredFields.set(s, r);
  }
  return r;
}

/**
 * Given a scheme and a field, returns its
 * @param s
 * @param field
 * @returns
 */
export function SchemeGetFieldDef<
  S extends Scheme,
  F extends string & (keyof S['fields'] | keyof typeof kBuiltinFields),
>(s: S, field: F): FieldDef<S['fields'][F]['type']> | undefined {
  const def = s.fields[field] || kBuiltinFields[field];
  if (!def) {
    return undefined;
  }
  return def;
}

/**
 * Given two schemes, returns whether they're the same one or not.
 * @param s1 First scheme.
 * @param s2 Second scheme.
 * @returns true if the schemes are the same, false otherwise.
 */
export function SchemeEquals(s1: Scheme, s2: Scheme): boolean {
  return s1.ns === s2.ns && s1.version === s2.version;
}
