/**
 * Order (Sort) stamps are our solution to efficiently ordering semi-related
 * items in a collaborative environment. Typically there are two ways to
 * implement ordered lists over a backing database:
 *
 * 1. Store the entire list as a single row. Each write overwrites the entire
 *    list, thus ensuring correct order of list items when multiple writers
 *    exist.
 *
 * 2. Store each list item as its own row, with an integer order column
 *    representing the index of this item in the list. Writers need to update
 *    all following indexes to account for insertions and deletions, resulting
 *    in O(N) update costs.
 *
 * Aside from performance issues, both of these approaches are fundamentally
 * incompatible with the way Ovvio works. In Ovvio, the user may look at a
 * filtered list (sub-list) containing only a sub set of the items. Then,
 * reorder them, and return back to the full, original, list. Handling the order
 * of filter'ed out items is really hard to get right.
 *
 * Instead, we take a different approach borrowing ideas from CRDTs
 * (Conflict-Free Replicated Datastructures). Our algorithm first models our
 * list as individual items with their positions as a field, similar to the
 * second approach above. However, instead of integer positions, we're using
 * arbitrary numbers (real, not integers).
 *
 * List Insertion at index I:
 * 1. Look at the item above and below I (I-1 and I+1).
 *
 * 2. Compute their average position (position, not index), then shift the
 *    result randomly to one side without crossing the neighboring values (to
 *    avoid conflicts in concurrent inserts).
 *
 * 3. Set the result as the position of the new item.
 *
 * 4. Ensure all readers sort their visible items to account for the new
 *    insertion.
 *
 * Example:
 * List = [("A", 0), ("B", 1)]
 * Insert("C", 1) => [("A", 0), ("C", 0.5 + RND1), ("B", 1)]
 *
 * This approach has several key advantages:
 * - Writes are O(1) and touch only the modified items in the list.
 *
 * - Multiple writers may change the list concurrently without conflicting with
 *   each other. Simply apply a Last-Write Wins policy at the item level.
 *
 * - Relative item order is properly preserved even when viewing and editing
 *   a subset of the original list. For example, if we filter out "C" from the
 *   example above, then execute
 *
 *   Insert("D", 1) => [("A", 0), ("D", 0.5 + RND2), ("B", 1)]
 *
 *   Finally look at the unfiltered result:
 *   [("A", 0), ("C", 0.5 + RND1), ("D", 0.5 + RND2) ("B", 1)]
 *
 *   NOTE: The order between "C" and "D" is indeterminate.
 *
 * While this works, it has major one flaw that makes it impractical in the real
 * world. Numbers in most environments have limited precision (64 bits usually),
 * thus limiting the number of divisions we can do before we converge to zero.
 *
 * To void this issue without requiring big number support, we use strings
 * instead of values, and assume lexicographical order between them. This file
 * implements a bunch of utility functions that implement the above logic using
 * strings.
 *
 * For easier compatibility with the outside world, we also support conversion
 * of arbitrary numbers to strings using the Efficient Lexicographic Encoding
 * of Numbers algorithm (ELEN) by Peter Seymour). Using this technique we
 * naturally create lists that are initially ordered, but can be modified to
 * whatever order the user wants.
 */
import * as ELEN from 'https://esm.sh/elen@1.0.10';
import { commonPrefixLen } from '../../base/string.ts';
import { assert } from '../../base/error.ts';
import { randomInt } from '../../base/math.ts';
import { serializeDate } from '../../base/date.ts';
import { uniqueId } from '../../base/common.ts';

const CHAR_CODE_MIN = 1; // Skip the null character to avoid possible problems
// Note: Theoretically we can use the entire UTF-16 character space, however
// some parts of our pipeline can't handle higher value characters properly
// so we're sticking to single byte characters

const CHAR_CODE_MAX = 254; // Exclusive. Reserves char 254 for right edge

// Increase this value if there are many concurrent writers
const RANDOM_SUFFIX_LEN = 16;

const MIN_REF_DATE = new Date(1420074000000); // 1/1/2015 @ 01:00:00 GMT

/**
 * Returns an order stamp representing now, which is the greatest possible
 * value based on the current time.
 *
 * The result should be used to insert at the edge of the list.
 */
export function present(): string {
  return fromTimestamp(new Date(), uniqueId());
}

/**
 * Returns a fixed order stamp in the past which can be used to insert at the
 * opposite edge from now().
 */
export function past(): string {
  return fromTimestamp(MIN_REF_DATE, uniqueId());
}

/**
 * Generates an initial order stamp based on a timestamp and a unique id.
 * You should pass the key of the item (record) you're dealing with rather than
 * generate a unique id on every call.
 */
export function fromTimestamp(timestamp: Date | number, key?: string) {
  return (
    ELEN.encode(
      typeof timestamp === 'number' ? timestamp : serializeDate(timestamp)
    ) + key || ''
  );
}

/**
 * Given two order stamps, this function generates and returns a value between
 * them. To generate values at the edge of the list (top/bottom), pass the
 * values of present() or past() as needed.
 *
 * Note: You can pass the values in any order you like.
 */
export function between(prev: string, next: string): string {
  // Sanity check. If prev and next are equal, there's no way to generate a
  // value between them.
  assert(prev !== next);

  // Make sure values are in the correct order
  if (prev > next) {
    const tmp = next;
    next = prev;
    prev = tmp;
  }

  // prev has length <= next, and shares a common prefix with next
  const prefixLen = commonPrefixLen(prev, next);
  let result = prev.substring(0, prefixLen);

  // First char after shared prefix is guaranteed to be smaller in prev than
  // in next. Note that it may not actually exist (if prev is shorter than next)
  const minChar =
    prefixLen < prev.length ? prev.charCodeAt(prefixLen) : CHAR_CODE_MIN;
  const maxChar = prefixLen > 0 ? next.charCodeAt(prefixLen) : CHAR_CODE_MAX;
  // Append a random char between prev[prefixLen] and next[prefixLen]. This
  // will place our result before next but also before prev.
  result += String.fromCharCode(randomInt(minChar, maxChar));

  // Search prev from prefixLen+1 to its end
  for (let i = prefixLen + 1; i < prev.length; ++i) {
    const charCode = prev.charCodeAt(i);
    // If we found a char less than MAX, generate a char greater than that
    // which will place our result *after* next.
    if (charCode < CHAR_CODE_MAX) {
      result += String.fromCharCode(randomInt(charCode + 1, CHAR_CODE_MAX));
      break;
    } else {
      // If we found the MAX char, copy it and try again on the following char.
      result += String.fromCharCode(charCode);
    }
  }

  // At this point we can guarantee that:
  //
  // - Our result comes before next
  //
  // - If prev was long enough and not filled with MAX chars, then our result
  //   also comes after prev
  //
  // In any case, we append a random sequence for two reasons:
  //
  // 1. Guarantee that `result` comes after `prev` (`result.length` >
  //    `prev.length`).
  //
  // 2. Guarantee that no two caller pick the same value even if they try to
  //    generate a stamp between the same values. This creates a (random) total
  //    order on the results of all parties with a very high probabili2ty.
  for (let j = 0; j < RANDOM_SUFFIX_LEN; ++j) {
    result += String.fromCharCode(randomInt(CHAR_CODE_MIN, CHAR_CODE_MAX));
  }
  return result;
}

export function fromIndex(idx: number): string {
  return ELEN.encode(idx);
}
