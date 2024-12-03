export type {
  CoreOptions,
  Clonable,
  Comparable,
  CoreArray,
  CoreClassObject,
  CoreDictionary,
  CoreObject,
  CoreSet,
  CoreValue,
  Encodable,
  Encoder,
  Equatable,
  ReadonlyCoreArray,
  ReadonlyCoreObject,
  CoreValueCloneOpts,
  ConcreteCoreValue,
  CoreKey,
} from './base.ts';

export { CoreType } from './base.ts';

export {
  getCoreType,
  isReadonlyCoreObject,
  getCoreTypeOrUndef,
} from './utils.ts';

export { coreValueClone } from './clone.ts';

export { coreValueCompare } from './comparable.ts';

export { coreValueEquals } from './equals.ts';
