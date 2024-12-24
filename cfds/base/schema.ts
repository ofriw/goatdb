import { Dictionary } from '../../base/collections/dict.ts';
import { CoreValue, ReadonlyCoreObject } from '../../base/core-types/base.ts';
import { coreValueClone } from '../../base/core-types/clone.ts';
import { CoreObject } from '../../base/core-types/index.ts';
import { assert, notReached } from '../../base/error.ts';
import { RichText } from '../richtext/tree.ts';
import { ValueType } from './types/index.ts';

/**
 * A mapping between a schema type and its native variable type.
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
 * A definition of a single field in a schema.
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
export type SchemaFieldsDef = Record<string, FieldDef<ValueType>>;

/**
 * A Schema defines the structure of a Document. Schemas are also versioned,
 * allowing for live, gradual migrations of data for some users, while others
 * continue to work with the old version in parallel.
 */
export type Schema = {
  /**
   * The namespace of this schema. The `null` and `session` namespaces are
   * reserved for the GoatDB's use.
   */
  ns: null | string;
  /**
   * The version of this schema. Used to detect when a new version of a schema
   * is available.
   */
  version: number;
  /**
   * A definition of all fields declared by this schema.
   */
  fields: SchemaFieldsDef;
  /**
   * An optional upgrade function, used to migrate documents from an older
   * schema to this schema.
   *
   * When upgrading a document, upgrade functions are run in order until
   * reaching the latest version available. For example, if a document is at
   * schema v1, and needs to be upgraded to v3, then first the upgrade function
   * of v2 will be run, then the result piped through the upgrade function of
   * v3.
   *
   * @param data The current data of the document. You must not modify this
   *             object directly. Instead, return a new one with the upgraded
   *             data.
   *
   * @param schema The schema of the current data.
   *
   * @returns An upgraded data that matches the current schema.
   */
  upgrade?: (data: ReadonlyCoreObject, schema: Schema) => CoreObject;
};

/**
 * A list of built in fields that are automatically injected into all schemas.
 */
const kBuiltinFields: Record<string, FieldDef<ValueType>> = {
  isDeleted: {
    type: 'boolean',
  },
} as const;

/**
 * Given a schema, extracts the names of all required fields.
 * Note: For practical purposes, fields with a default function are treated
 * as required from the type system.
 */
export type SchemaRequiredFields<
  T extends Schema,
  K extends keyof T['fields'] = keyof T['fields'],
> = T['fields'][K]['required'] extends true
  ? // deno-lint-ignore ban-types
    T['fields'][K]['default'] extends Function
    ? never
    : K
  : never;

/**
 * Given a schema, extracts the names of all optional fields.
 */
export type SchemaOptionalFields<
  T extends Schema,
  K extends keyof T['fields'] = keyof T['fields'],
> = T['fields'][K]['required'] extends false | undefined ? K : never;

/**
 * Given a type (FieldValue) and a required + default function, this generates
 * the correct type or union with undefined.
 */
export type SchemaValueWithOptional<
  T,
  R extends boolean | undefined,
  // deno-lint-ignore ban-types
  D extends Function | undefined,
  // deno-lint-ignore ban-types
> = R extends true ? T : D extends Function ? T : undefined | T;

/**
 * Given a schema, extracts the type of its data.
 */
export type SchemaDataType<T extends Schema> = {
  [k in keyof T['fields']]: SchemaValueWithOptional<
    FieldValue<T['fields'][k]['type']>,
    T['fields'][k]['required'],
    T['fields'][k]['default']
  >;
};

/**
 * The null schema is used to reserve keys for items that they're schema
 * isn't known yet. It's also used to simplify the internal diff/patch logic.
 *
 * Null items can't be persisted, and aren't synchronized across the network.
 */
export const kNullSchema: Schema = {
  ns: null,
  version: 0,
  fields: {},
  upgrade: () => notReached('Attempting to upgrade the null schema'),
} as const;
export type SchemaNullType = typeof kNullSchema;

/**
 * All connections to the DB are represented as Session items, and are used
 * to verify the authenticity of commits.
 */
export const kSchemaSession = {
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
    // The key of the matching user from /sys/users
    // NOTE: Anonymous sessions don't have an owner
    owner: {
      type: 'string',
    },
  },
} as const;
export type SchemaTypeSession = typeof kSchemaSession;

/**
 * Each scheme is potentially linked to a specific user (unless it's an
 * anonymous session). The user item stores personal login information for this
 * user.
 */
export const kSchemaUser = {
  ns: 'users',
  version: 1,
  fields: {
    email: {
      type: 'string',
    },
    firstName: {
      type: 'string',
    },
    lastName: {
      type: 'string',
    },
  },
} as const;
export type SchemaTypeUser = typeof kSchemaUser;

/**
 * The schemaManager acts as a registry of known schemas for a given GoatDB
 * instance. It's initialized when the app starts and stays fixed during its
 * execution.
 *
 * Typically, apps use the `schemaManager.default` instance, but are free to
 * create multiple managers each with different schemas registered.
 */
export class SchemaManager {
  private readonly _schemas: Map<string, Schema[]>;

  /**
   * The default manager. Unless explicitly specified, GoatDB will default to
   * this manager.
   */
  static readonly default = new this();

  /**
   * Initialize a new schemaManager.
   * @param schemas An optional list of schemas to register.
   */
  constructor(schemas?: Iterable<Schema>) {
    this._schemas = new Map();
    this.register(kSchemaSession);
    this.register(kSchemaUser);
    if (schemas) {
      for (const s of schemas) {
        this.register(s);
      }
    }
  }

  /**
   * Registers a schema with this manager. This is a NOP if the schema had
   * already been registered.
   *
   * @param schema The schema to register.
   */
  register(schema: Schema): void {
    assert(schema.ns !== null);
    let arr = this._schemas.get(schema.ns);
    if (!arr) {
      arr = [];
      this._schemas.set(schema.ns, arr);
    }
    if (arr.find((s) => s.version === schema.version) === undefined) {
      arr.push(schema);
      arr.sort((s1, s2) => s2.version - s1.version);
    }
  }

  /**
   * Find a schema that's been registered with this manager.
   *
   * @param ns      The namespace for the schema.
   * @param version If provided, searches for the specific version. Otherwise
   *                this method will return the latest version for the passed
   *                namespace.
   *
   * @returns A schema or undefined if not found.
   */
  get(ns: string, version?: number): Schema | undefined {
    const arr = this._schemas.get(ns);
    if (!arr) {
      return undefined;
    }
    return version ? arr.find((s) => s.version === version) : arr[0];
  }

  /**
   * Given a data object and its schema, this method performs the upgrade
   * procedure to the target schema.
   *
   * This method will refuse to upgrade to the target schema if a single version
   * is missing. For example, if attempting to upgrade from v1 to v3, but the
   * v2 schema is missing, then the upgrade will be refused.
   *
   * NOTE: You shouldn't use this method directly under normal circumstances.
   * The upgrade procedure will be performed automatically for you when needed.
   *
   * @param data         The data to upgrade.
   * @param dataSchema   The schema of the passed data.
   * @param targetSchema The target schema. If not provided, the latest schema
   *                     for the namespace will be used.
   *
   * @returns An array in the form of [data, schema] with the result. Returns
   *          undefined if the upgrade failed.
   */
  upgrade(
    data: CoreObject,
    dataSchema: Schema,
    targetSchema?: Schema,
  ): [CoreObject, Schema] | undefined {
    if (
      (targetSchema === undefined || targetSchema.ns === null) &&
      dataSchema.ns === null
    ) {
      return [data, kNullSchema];
    }
    assert(
      dataSchema.ns !== null ||
        (targetSchema !== undefined && targetSchema.ns !== null),
    );
    const ns = targetSchema?.ns || dataSchema.ns!;
    const latest = this.get(ns, targetSchema?.version);
    if (!latest || latest.version === dataSchema.version) {
      return [data, dataSchema];
    }

    let currentSchema = dataSchema;
    let upgradedData = coreValueClone(data);
    for (let i = dataSchema.version + 1; i <= latest.version; ++i) {
      const schema = this.get(ns, i);
      if (!schema) {
        return undefined;
      }
      if (schema.upgrade) {
        upgradedData = schema.upgrade(upgradedData, currentSchema);
      }
      currentSchema = schema;
    }
    return [upgradedData, currentSchema];
  }

  /**
   * Encoded a schema to a marker string for storage.
   * @param schema The schema to encode.
   * @returns A string marker for this schema.
   */
  encode(schema: Schema): string {
    if (schema.ns === null) {
      return 'null';
    }
    return `${schema.ns}/${schema.version}`;
  }

  /**
   * Decodes a schema marker to an actual schema.
   * @param str The schema marker produced by a previous call to
   *            `schemaManager.encode`.
   *
   * @returns The registered schema or undefined if no such schema is found.
   */
  decode(str: string /*| Decoder*/): Schema | undefined {
    if (str === 'null') {
      return kNullSchema;
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

const gCachedSchemaFields = new WeakMap<
  Schema,
  [string, FieldDef<ValueType>][]
>();

/**
 * Given a schema, this function returns its field definitions as an iterable.
 * @param s A schema.
 * @returns An iterable of field name and its definition.
 */
export function SchemaGetFields(
  s: Schema,
): readonly [string, FieldDef<ValueType>][] {
  let r = gCachedSchemaFields.get(s);
  if (!r) {
    r = Object.entries(s.fields).concat(Object.entries(kBuiltinFields));
    Object.freeze(r);
    gCachedSchemaFields.set(s, r);
  }
  return r;
}

const gCachedSchemaRequiredFields = new WeakMap<Schema, string[]>();
/**
 * Given a schema, this functions returns an iterable of its required fields.
 * @param s A schema.
 * @returns An iterable of required field names.
 */
export function SchemaGetRequiredFields(s: Schema): readonly string[] {
  let r = gCachedSchemaRequiredFields.get(s);
  if (!r) {
    r = [];
    for (const [fieldName, def] of SchemaGetFields(s)) {
      if (def.required === true) {
        r.push(fieldName);
      }
    }
    Object.freeze(r);
    gCachedSchemaRequiredFields.set(s, r);
  }
  return r;
}

/**
 * Given a schema and a field, returns its
 * @param s
 * @param field
 * @returns
 */
export function SchemaGetFieldDef<
  S extends Schema,
  F extends keyof S['fields'] | keyof typeof kBuiltinFields,
>(s: S, field: F): FieldDef<S['fields'][F]['type']> | undefined {
  const def = s.fields[field as string] || kBuiltinFields[field as string];
  if (!def) {
    return undefined;
  }
  return def;
}

/**
 * Given two schemas, returns whether they're the same one or not.
 * @param s1 First schema.
 * @param s2 Second schema.
 * @returns true if the schemas are the same, false otherwise.
 */
export function SchemaEquals(s1: Schema, s2: Schema): boolean {
  return s1.ns === s2.ns && s1.version === s2.version;
}
