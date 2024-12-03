import { Dictionary } from '../collections/dict.ts';

export type ReadonlyCoreObject = {
  readonly [key: string]: CoreValue;
};

export interface CoreObject<T extends CoreValue = CoreValue> {
  [key: string]: T;
}

export type ReadonlyCoreArray = readonly CoreValue[];

export type CoreArray = CoreValue[];

export type CoreSet = Set<CoreValue>;

export type CoreKey = keyof ReadonlyCoreObject & string;

export type CoreDictionary = Dictionary<CoreKey, CoreValue>;

export type ConcreteCoreValue =
  | string
  | number
  | boolean
  | null
  | Date
  | CoreArray
  | CoreObject
  | Set<ConcreteCoreValue>
  | Dictionary<CoreKey, ConcreteCoreValue>
  | Generator<ConcreteCoreValue>
  | CoreClassObject
  | ReadonlyCoreArray
  | ReadonlyCoreObject;

export type CoreValue =
  | undefined
  | ConcreteCoreValue
  | CoreSet
  | CoreDictionary
  | Generator<CoreValue>;

export enum CoreType {
  String,
  Number,
  Boolean,
  Null,
  Date,
  Array,
  Object,
  Set,
  Dictionary,
  Undefined,
  Generator,
  ClassObject,
}

export type CoreClassObject = Comparable | Clonable | Equatable | Encodable;

export type ObjFieldsFilterFunc = (
  key: string,
  obj: ReadonlyCoreObject
) => boolean;

export type IterableFilterFunc = (value: CoreValue) => boolean;

export interface CoreOptions {
  objectFilterFields?: ObjFieldsFilterFunc;
  iterableFilter?: IterableFilterFunc;
}

export interface Comparable<T = unknown> {
  compare(other: T): number;
}

export interface Equatable<T = unknown> {
  isEqual(other: T): boolean;
}

export interface Clonable<T = unknown> {
  clone(opts?: CoreValueCloneOpts): T;
}

export interface CoreValueCloneOpts extends CoreOptions {
  fieldCloneOverride?: (
    obj: ReadonlyCoreObject | CoreDictionary,
    key: string,
    opts?: CoreValueCloneOpts
  ) => CoreValue;
  objectOverride?: (obj: CoreValue) => [boolean, CoreValue];
  notClonableExt?: <T extends Object>(obj: T) => T | undefined;
}

export interface Encoder<
  K = CoreKey,
  V = CoreValue,
  T = CoreValue,
  OT = unknown
> {
  set(key: K, value: V, options?: OT): void;
  getOutput(): T;
  newEncoder(): Encoder<K, V, T, OT>;
}

export interface Encodable<
  K = CoreKey,
  V = CoreValue,
  T = CoreValue,
  OT = unknown
> {
  serialize(encoder: Encoder<K, V, T>, options?: OT): void;
}
