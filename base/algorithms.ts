/**
 * Performs a binary search over a sorted array.
 * @param arr The array to search.
 * @param value The value to search.
 * @param comparator function receiving two arguments and
 *                   returning a number. It must return zero if the two
 *                   values are equal, a positive value if the first
 *                   argument is greater than the second, and a negative
 *                   value otherwise. The first argument is the searched
 *                   value while the second argument is the value form
 *                   the array.
 *
 * @returns The index closest to the searched value. You should
 *                   test whether the value at the value at the returned index
 *                   is equal to the searched value. If not, the value doesn't
 *                   exist in the array.
 */
export function bsearch<T>(
  arr: readonly T[],
  value: T,
  comparator: (x: T, y: T) => number = (x, y) => (x > y ? 1 : x < y ? -1 : 0),
): number {
  if (!arr || arr.length <= 0) {
    return 0;
  }

  let start = 0;
  let end = arr.length - 1;
  while (start < end) {
    const mid = ((start + end) / 2) | 0;
    const r = comparator(value, arr[mid]);
    if (r === 0) {
      return mid;
    }
    if (r < 0) {
      end = mid - 1;
    } else {
      start = mid + 1;
    }
  }
  // Fixup the result so it's always "before" the target index enabling
  // standard array ops on the unmodified result.
  return comparator(value, arr[start]) > 0 ? start + 1 : start;
}

export function bsearch_idx(
  length: number,
  comparator: (idx: number) => number = (idx) => {
    throw new Error('Bad comparator');
  },
): number {
  if (!length) {
    return -1;
  }

  let start = 0;
  let end = length - 1;
  while (start < end) {
    const mid = ((start + end) / 2) | 0;
    const r = comparator(mid);
    if (!r) {
      return mid;
    }
    if (r < 0) {
      end = mid - 1;
    } else {
      start = mid + 1;
    }
  }
  return start;
}
