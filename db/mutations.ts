import * as ArrayUtils from '../base/array.ts';
import { CoreValue } from '../base/core-types/index.ts';

export type Mutation<T extends string = string> = [
  field: T,
  local: boolean,
  value: CoreValue,
];

export type MutationPack<T extends string = string> =
  | Mutation<T>
  | Mutation<T>[]
  | undefined
  | void;

function isMutation<T extends string = string>(
  pack: MutationPack,
): pack is Mutation<T> {
  return (
    pack instanceof Array && pack.length === 3 && typeof pack[0] === 'string'
  );
}

export function mutationPackAppend<T extends string = string>(
  pack: MutationPack<T>,
  mutation: MutationPack<T>,
): MutationPack<T> {
  // NOP
  if (mutation === undefined) {
    return pack;
  }
  if (pack === undefined) {
    return mutation;
  }
  // Both pack and mutation are not empty. Must allocate an array
  if (isMutation(pack)) {
    pack = [pack];
  }
  // Append the added mutations
  if (isMutation(mutation)) {
    pack.push(mutation);
  } else {
    ArrayUtils.append(pack, mutation);
  }
  return mutationPackOptimize(pack);
}

export function* mutationPackIter<T extends string = string>(
  pack: MutationPack<T>,
): Generator<Mutation<T>> {
  if (pack === undefined) {
    return;
  }
  if (isMutation(pack)) {
    yield pack;
  } else {
    for (const m of pack) {
      yield m;
    }
  }
}

export function mutationPackGetFirst<T extends string = string>(
  pack: MutationPack<T>,
): Mutation<T> | undefined {
  if (pack === undefined) {
    return undefined;
  }
  if (isMutation(pack)) {
    return pack;
  }
  return pack[0];
}

export function mutationPackLength(pack: MutationPack): number {
  if (pack === undefined) {
    return 0;
  }
  if (isMutation(pack)) {
    return 1;
  }
  return pack.length;
}

export function mutationPackGet<T extends string = string>(
  pack: MutationPack<T>,
  idx: number,
): Mutation<T> | undefined {
  if (pack === undefined) {
    return undefined;
  }
  if (isMutation(pack)) {
    return idx === 0 ? pack : undefined;
  }
  return pack[idx];
}

export function mutationPackDeleteFirst<T extends string = string>(
  pack: MutationPack<T>,
): MutationPack<T> {
  if (pack === undefined || isMutation(pack) || pack.length <= 1) {
    return undefined;
  }
  pack.shift();
  return pack;
}

export function mutationPackToArr<T extends string = string>(
  pack: MutationPack<T>,
): Mutation<T>[] {
  if (pack === undefined) {
    return [];
  }
  if (isMutation(pack)) {
    return [pack];
  }
  return pack;
}

export function mutationPackIsEmpty(pack: MutationPack): boolean {
  return pack === undefined || pack.length === 0;
}

/**
 * Removes duplicate mutations for the same field.
 *
 * @param pack The pack to optimize.
 * @returns An optimized pack where each field appears only once.
 */
export function mutationPackOptimize<T extends string = string>(
  pack: MutationPack<T>,
): MutationPack<T> {
  if (pack === undefined || isMutation(pack) || pack.length <= 1) {
    return pack;
  }
  // Keep the first occurrence of of each field, which also preserves the
  // original value. Later, internal, mutations can be safely discarded.
  const seenFields: string[] = [];
  for (let i = 0; i < pack.length; ++i) {
    const [fieldName] = pack[i];
    if (seenFields.indexOf(fieldName) > -1) {
      pack.splice(i, 1);
      --i;
    } else {
      seenFields.push(fieldName);
    }
  }
  return pack;
}

export function mutationPackClone<T extends string = string>(
  pack: MutationPack<T>,
): MutationPack<T> {
  if (!pack) {
    return undefined;
  }
  if (isMutation(pack)) {
    return [pack[0], pack[1], pack[2]];
  }
  return (pack as Mutation<T>[]).map((m) => [m[0], m[1], m[2]] as Mutation<T>);
}

export function mutationPackHasRemote(pack: MutationPack): boolean {
  if (pack !== undefined) {
    if (isMutation(pack)) {
      return pack[1] === false;
    }
    for (const [_f, local] of pack) {
      if (local === false) {
        return true;
      }
    }
  }
  return false;
}

export function mutationPackHasLocal(pack: MutationPack): boolean {
  return !mutationPackHasRemote(pack);
}

export function mutationPackHasField<T extends string = string>(
  pack: MutationPack<T>,
  ...fields: T[]
): boolean {
  for (const [field] of mutationPackIter(pack)) {
    if (fields.includes(field)) {
      return true;
    }
  }
  return false;
}

export function mutationPackDeleteField<T extends string = string>(
  pack: MutationPack<T>,
  fieldName: T,
): MutationPack<T> {
  if (pack === undefined) {
    return undefined;
  }
  if (isMutation(pack)) {
    return pack[0] === fieldName ? undefined : pack;
  }
  if (pack.length === 1) {
    return pack[0][0] === fieldName ? undefined : pack;
  }
  for (let i = 0; i < pack.length; ++i) {
    if ((pack[i] as Mutation)[0] === fieldName) {
      pack.splice(i, 1);
      break;
    }
  }
  return pack.length > 0 ? pack : undefined;
}

export function mutationPackSubtractFields<T extends string = string>(
  pack: MutationPack<T>,
  toRemoveField: MutationPack<T>,
): MutationPack<T> {
  for (const m of mutationPackIter(toRemoveField)) {
    pack = mutationPackDeleteField(pack, m[0]);
  }
  return pack;
}
