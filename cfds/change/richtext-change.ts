import { EncodedChange, Change, ChangeType } from './index.ts';
import {
  CoreValue,
  Encoder,
  coreValueClone,
  CoreOptions,
  coreValueEquals,
} from '../../base/core-types/index.ts';
import {
  ConstructorDecoderConfig,
  isDecoderConfig,
} from '../../base/core-types/encoding/index.ts';
import { Operation } from '../richtext/merge-context.ts';
import { TreeNode } from '../richtext/tree.ts';
import { CoreValueCloneOpts } from '../../base/core-types/base.ts';

export interface EncodedRTChange extends EncodedChange {
  readonly changeType: 'rt';
  readonly op: Operation;
  readonly start: number;
  readonly end?: number;
  readonly values?: TreeNode[];
}

export interface RichTextChangeConfig {
  readonly op: Operation;
  readonly start: number;
  end?: number;
  values?: TreeNode[];
}

export class RichTextChange extends Change<EncodedRTChange> {
  readonly op: Operation;
  readonly start: number;
  readonly end?: number;
  readonly values?: TreeNode[];

  constructor(
    config: RichTextChangeConfig | ConstructorDecoderConfig<EncodedRTChange>
  ) {
    super(config);
    if (isDecoderConfig(config)) {
      this.op = config.decoder.get<Operation>('op')!;
      this.start = config.decoder.get<number>('start')!;
      if (config.decoder.has('end')) {
        this.end = config.decoder.get<number>('end');
      }
      if (config.decoder.has('values')) {
        this.values = config.decoder.get('values') as TreeNode[];
      }
    } else {
      this.op = config.op;
      this.start = config.start;
      if (config.end !== undefined) {
        this.end = config.end;
      }
      if (config.values !== undefined) {
        this.values = coreValueClone(config.values);
      }
    }
  }

  clone<T extends Change<EncodedRTChange>>(
    _opts?: CoreValueCloneOpts | undefined
  ): T {
    return new RichTextChange({
      op: this.op,
      start: this.start,
      end: this.end,
      values: this.values,
    }) as unknown as T;
  }

  getType(): ChangeType {
    return 'rt';
  }

  serialize(
    encoder: Encoder<keyof EncodedRTChange, CoreValue>,
    opts?: CoreOptions
  ): void {
    super.serialize(encoder, opts);
    encoder.set('op', this.op);
    encoder.set('start', this.start);
    if (this.end !== undefined) {
      encoder.set('end', this.end);
    }
    if (this.values !== undefined) {
      encoder.set('values', coreValueClone(this.values, opts));
    }
  }

  isEqual(other: RichTextChange): boolean {
    return (
      this.op === other.op &&
      this.start === other.start &&
      this.end === other.end &&
      coreValueEquals(this.values, other.values)
    );
  }
}
