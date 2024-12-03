import { isRefMarker } from '../../richtext/model.ts';
import {
  SerializeValueTypeOptions,
  ValueType,
  ValueTypeOptions,
} from './index.ts';
import { Change, EncodedChange } from '../../change/index.ts';
import { RichTextChange } from '../../change/richtext-change.ts';
import {
  CoreOptions,
  CoreType,
  coreValueClone,
  coreValueEquals,
  Encoder,
} from '../../../base/core-types/index.ts';
import { DecodedValue } from '../../../base/core-types/encoding/index.ts';
import { diff, patch } from '../../richtext/diff-patch.ts';
import { flattenRichText } from '../../richtext/flat-rep.ts';
import { normalizeRichText } from '../../richtext/normalize/index.ts';
import {
  dfs,
  initRichText,
  isExpiredPointer,
  isRichText,
  onlyNoneLocal,
  purgeExpiredPointers,
  RichText,
  treeAtomKeyFilterIgnoreText,
} from '../../richtext/tree.ts';
import { CoreTypeOperations } from './core-type.ts';

const kCoreValueOpts: CoreOptions = {
  objectFilterFields: treeAtomKeyFilterIgnoreText,
};

const expiredPointersBuffer = 1000 * 60 * 10; //10 minutes

export class RichText3TypeOperations extends CoreTypeOperations<RichText> {
  constructor() {
    super(CoreType.Object, 'richtext');
  }
  patch(
    curValue: RichText | undefined,
    changes: Change<EncodedChange>[],
    _options?: ValueTypeOptions,
  ) {
    if (curValue === undefined) {
      curValue = initRichText();
    }

    const newValue = patch(curValue, changes as RichTextChange[], true);

    return newValue;
  }

  normalize(val: RichText) {
    return normalizeRichText(val);
  }

  getRefOperation() {
    return undefined;
  }

  validate(value: any): boolean {
    return isRichText(value);
  }

  serialize(
    key: string,
    value: RichText,
    encoder: Encoder,
    options?: SerializeValueTypeOptions,
  ): void {
    const local = options?.local === true; //default false

    if (options?.flatRep === true) {
      // For checksum purposes we need to use the flat rep or we won't account
      // for depth changes. Computing the checksum on a DFS run of the tree
      // completely strips out the depth info.

      //const flat = Array.from(flattenRichText(value, local));
      const flat = flattenRichText(value, local, false);

      encoder.set(key, flat, kCoreValueOpts);
    } else {
      const func = local ? undefined : onlyNoneLocal;
      encoder.set(key, value, {
        iterableFilter: func,
      });
    }
  }

  deserialize(value: DecodedValue, options?: ValueTypeOptions) {
    return value as RichText;
  }

  valueAddedDiff(value2: RichText, options?: ValueTypeOptions) {
    const local = options?.local === true; //Default is false

    const empty = initRichText();

    return diff(empty, value2, local);
  }

  valueRemovedDiff(
    value1: RichText,
    options?: ValueTypeOptions,
  ): Change<EncodedChange> | Change<EncodedChange>[] | undefined {
    const local = options?.local === true; //Default is false

    const empty = initRichText();

    return diff(value1, empty, local);
  }

  valueChangedDiff(
    value1: RichText,
    value2: RichText,
    options?: ValueTypeOptions,
  ) {
    return diff(
      value1,
      value2,
      options?.local === true, // Default: false
      options?.byCharacter !== false, // Default: true
    );
  }

  isEmpty(_value: RichText): boolean {
    return false;
  }

  equals(val1: RichText, val2: RichText, options?: ValueTypeOptions): boolean {
    const local = options?.local === true; //Default is false

    const func = local ? undefined : onlyNoneLocal;
    return coreValueEquals(val1, val2, {
      iterableFilter: func,
    });
  }

  clone(value: RichText) {
    return coreValueClone(value);
  }

  needGC(value: RichText): boolean {
    if (value.pointers) {
      for (const pointer of value.pointers) {
        if (isExpiredPointer(pointer, expiredPointersBuffer)) {
          return true;
        }
      }
    }
    return false;
  }

  gc(value: RichText): RichText | undefined {
    return purgeExpiredPointers(value, expiredPointersBuffer);
  }

  fillRefs(refs: Set<string>, value: RichText): void {
    for (const [node] of dfs(value.root)) {
      if (isRefMarker(node)) {
        refs.add(node.ref);
      }
    }
  }

  rewriteRefs(
    keyMapping: Map<string, string>,
    value: RichText,
    deleteRefs?: Set<string>,
  ): RichText {
    for (const [node, _depth, path] of dfs(value.root, true)) {
      if (isRefMarker(node)) {
        if (deleteRefs?.has(node.ref)) {
          const children = path[path.length - 1].children!;
          children.splice(children.indexOf(node), 1);
        } else {
          node.ref = keyMapping.get(node.ref) || node.ref;
        }
      }
    }
    return value;
  }
}
