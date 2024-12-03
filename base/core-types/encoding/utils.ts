import { ConstructorDecoderConfig } from './types.ts';

export function isDecoderConfig<T extends ConstructorDecoderConfig<unknown>>(
  v: unknown,
): v is T {
  // deno-lint-ignore no-prototype-builtins
  return v !== undefined && v !== null && v.hasOwnProperty('decoder');
}
