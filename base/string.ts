import { assert } from './error.ts';
import { decodeBase32, encodeBase32 } from 'std/encoding/base32.ts';

export function splice(
  str: string,
  start: number,
  delCount: number,
  newSubStr: string,
): string {
  return (
    str.slice(0, start) + newSubStr + str.slice(start + Math.abs(delCount))
  );
}

export function commonPrefixLen(str1: string, str2: string): number {
  const len = Math.min(str1.length, str2.length);
  let end = 0;
  for (; end < len; ++end) {
    if (str1[end] !== str2[end]) {
      break;
    }
  }
  return end;
}

export function commonSuffixLen(str1: string, str2: string): number {
  let idx1 = str1.length - 1;
  let idx2 = str2.length - 1;
  let count = 0;
  while (idx1 >= 0 && idx2 >= 0) {
    if (str1[idx1] !== str2[idx2]) {
      break;
    }
    ++count;
    --idx1;
    --idx2;
  }
  return count;
}

/**
 * Given an expected text and a user input, this functions calculates a boost
 * value between [0, 2.0] based on character similarity.
 */
function letterBoost(expected: string, input: string): number {
  const origChars = new Set(expected);
  let correctCount = 0;
  let wrongCount = 0;
  for (const c of input) {
    if (origChars.has(c)) {
      ++correctCount;
    } else {
      ++wrongCount;
    }
  }
  return 1.0 + (correctCount - wrongCount) / origChars.size;
}

/**
 * Given a string and an index, this function returns the char code at the
 * given index, plus one index before/after it in the case of a unicode
 * surrogate pairs.
 *
 * Shamelessly taken from https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/String/charCodeAt
 *
 * @param str The string to extract from.
 * @param idx The index of the requested code.
 * @returns A fixed char code.
 */
export function fixedCharCodeAt(str: string, idx: number): number {
  if (idx < 0 || idx >= str.length) {
    return 0;
  }
  const code = str.charCodeAt(idx);
  // High surrogate (could change last hex to 0xDB7F to treat high private
  // surrogates as single characters)
  if (0xd800 <= code && code <= 0xdbff) {
    const hi = code;
    const low = str.charCodeAt(idx + 1);
    assert(
      !isNaN(low),
      'High surrogate not followed by low surrogate in fixedCharCodeAt()',
    );
    return (hi - 0xd800) * 0x400 + (low - 0xdc00) + 0x10000;
  }
  if (0xdc00 <= code && code <= 0xdfff) {
    // Low surrogate
    // We return false to allow loops to skip this iteration since should have
    // already handled high surrogate above in the previous iteration
    const hi = str.charCodeAt(idx - 1);
    const low = code;
    return (hi - 0xd800) * 0x400 + (low - 0xdc00) + 0x10000;
  }
  return code;
}

/**
 * Given a string, this function returns a new string, that's lexicographically
 * greater by 1. That means, it'll compare greater than the given string, and
 * no other string can be inserted between the input and the result.
 *
 * @param str The input string.
 * @returns A string that compares greater by 1.
 */
export function increment(str: string): string {
  const code = fixedCharCodeAt(str, str.length - 1);
  // 0x10FFFF is the highest code point encodable to UTF-16. If the last char
  // is lesser than it, we can simply increment it
  if (code < 0x10ffff) {
    return str.substring(0, str.length - 1) + String.fromCodePoint(code + 1);
  }
  // Can't increment last character, so must add a character
  return str + String.fromCharCode(1);
}

/**
 * Given a string, this function returns a new string, that's lexicographically
 * lesser by 1. That means, it'll compare less than the given string, and
 * no other string can be inserted between the input and the result.
 *
 * @param str The input string.
 * @returns A string that compares smaller by 1.
 */
export function decrement(str: string): string {
  const code = fixedCharCodeAt(str, str.length - 1);
  // If our last character is already the lowest value, we must shorten the
  // string.
  if (code < 1) {
    return str.length > 1 ? str.substring(0, str.length - 1) : '';
  }
  // Decrement the last character if we can
  return str + String.fromCharCode(code - 1);
}

export function appendPathComponent(
  path: string,
  ...comps: (string | null | undefined)[]
): string {
  for (const c of comps) {
    if (!c) {
      continue;
    }
    if (path.endsWith('/') || c.startsWith('/')) {
      path += c;
    } else {
      path = `${path}/${c}`;
    }
  }
  return path;
}

const ltrChars =
  'A-Za-z\u00C0-\u00D6\u00D8-\u00F6\u00F8-\u02B8\u0300-\u0590\u0800-\u1FFF' +
  '\u2C00-\uFB1C\uFDFE-\uFE6F\uFEFD-\uFFFF';
const rtlChars = '\u0591-\u07FF\uFB1D-\uFDFD\uFE70-\uFEFC';
const dirRegex = new RegExp(`^[^${ltrChars}]*[${rtlChars}]`);
const notLtrRegex = /(\W|[0-9])+/u;

export function isRTL(s: string): boolean {
  return dirRegex.test(s);
}

export function isLTR(s: string): boolean {
  return !notLtrRegex.test(s);
}

export type WritingDirection = 'ltr' | 'rtl' | 'auto';

export function resolveWritingDirection(
  str: string | undefined,
  base: WritingDirection = 'auto',
): WritingDirection {
  if (!str) {
    return base;
  }
  for (const char of str) {
    if (isRTL(char)) {
      return 'rtl';
    }
    if (isLTR(char)) {
      return 'ltr';
    }
  }
  return base;
}

const kEmailRegex = /^[\w-+\.]+@([\w-]+\.)+[\w-]{2,4}$/;
export function normalizeEmail(email: string): string;
export function normalizeEmail(email: undefined): undefined;
export function normalizeEmail(email: string | undefined): string | undefined {
  if (!email) {
    return undefined;
  }
  email = email.trim();
  if (!email.length) {
    return undefined;
  }
  email = email.toLowerCase();
  const match = email.match(kEmailRegex);
  return match ? match[0] : undefined;
}

export function encodeBase32URL(
  value: ArrayBuffer | Uint8Array | string,
): string {
  return encodeBase32(value).replace('=', '_').toLowerCase();
}

export function decodeBase32URL(value: string): Uint8Array {
  return decodeBase32(value.toUpperCase().replace('_', '='));
}

export function decodeBase32URLString(value: string): string {
  const decoder = new TextDecoder();
  return decoder.decode(decodeBase32URL(value));
}

export function searchAll(str: string, regex: RegExp): number[] {
  const result: number[] = [];
  regex.lastIndex = 0;
  while (regex.exec(str) !== null) {
    result.push(regex.lastIndex);
    ++regex.lastIndex;
  }
  return result;
}

export function compareStrings(s1: string, s2: string): number {
  if (s1 === s2) {
    return 0;
  }
  return s1 > s2 ? 1 : -1;
}
