import { JSONValue, ReadonlyJSONObject } from './interfaces.ts';

function formatPair(k: string, v: JSONValue): string {
  return `${JSON.stringify(k)}:${
    typeof v === 'object'
      ? stableStringify(v as ReadonlyJSONObject)
      : JSON.stringify(v)
  }`;
}

export function stableStringify(obj: ReadonlyJSONObject): string {
  let res = '{';
  const keys = Object.keys(obj).sort();
  const len = keys.length;
  for (let i = 0; i < len - 1; ++i) {
    const k = keys[i];
    res += formatPair(k, obj[k]) + ',';
  }
  if (len > 0) {
    const k = keys[len - 1];
    res += formatPair(k, obj[k]);
  }
  res += '}';
  return res;
}
