/* eslint-disable */
/**
 * Diff Match and Patch
 * Copyright 2018 The diff-match-patch Authors.
 * https://github.com/google/diff-match-patch
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

/**
 * This file has been modified from diff-match-patch.js to diff-match-patch.ts
 * by Ofri Wolfus on 12/10/22. Minimal changes have been made to provide Deno/TS
 * compatibility.
 */

/**
 * @fileoverview Computes the difference between two texts to create a patch.
 * Applies the patch onto another text, allowing for errors.
 * @author fraser@google.com (Neil Fraser)
 */

// Define some regex patterns for matching boundaries.
const kNonAlphaNumericRegex_ = /[^a-zA-Z0-9]/;
const kWhitespaceRegex_ = /\s/;
const kLinebreakRegex_ = /[\r\n]/;
const kBlanklineEndRegex_ = /\n\r?\n$/;
const kBlanklineStartRegex_ = /^\r?\n\r?\n/;

//  DIFF FUNCTIONS

/**
 * The data structure representing a diff is an array of tuples:
 * [[DIFF_DELETE, 'Hello'], [DIFF_INSERT, 'Goodbye'], [DIFF_EQUAL, ' world.']]
 * which means: delete 'Hello', add 'Goodbye' and keep ' world.'
 */
export enum DiffOp {
  Delete = -1,
  Insert = 1,
  Equal = 0,
}

export const DIFF_DELETE = DiffOp.Delete;
export const DIFF_INSERT = DiffOp.Insert;
export const DIFF_EQUAL = DiffOp.Equal;

/**
 * Class representing one diff tuple.
 * Attempts to look like a two-element array (which is what this used to be).
 * @param {number} op Operation, one of: DIFF_DELETE, DIFF_INSERT, DIFF_EQUAL.
 * @param {string} text Text to be deleted, inserted, or retained.
 * @constructor
 */
export type Diff = [DiffOp, string];

/**
 * Class containing the diff, match and patch methods.
 * @constructor
 */
export class DiffMatchPatch {
  // Defaults.
  // Redefine these in your program to override the defaults.

  // Number of seconds to map a diff before giving up (0 for infinity).
  public Diff_Timeout = 1.0;
  // Cost of an empty edit operation in terms of edit characters.
  public Diff_EditCost = 4;
  // At what point is no match declared (0.0 = perfection, 1.0 = very loose).
  public Match_Threshold = 0.5;
  // How far to search for a match (0 = exact location, 1000+ = broad match).
  // A match this many characters away from the expected location will add
  // 1.0 to the score (0.0 is a perfect match).
  public Match_Distance = 1000;
  // When deleting a large block of text (over ~64 characters), how close do
  // the contents have to be to match the expected contents. (0.0 = perfection,
  // 1.0 = very loose).  Note that Match_Threshold controls how closely the
  // end points of a delete need to match.
  public Patch_DeleteThreshold = 0.5;
  // Chunk size for context length.
  public Patch_Margin = 4;

  // The number of bits in an int.
  public Match_MaxBits = 32;
  /**
   * Find the differences between two texts.  Simplifies the problem by stripping
   * any common prefix or suffix off the texts before diffing.
   * @param {string} text1 Old string to be diffed.
   * @param {string} text2 New string to be diffed.
   * @param {boolean=} opt_checklines Optional speedup flag. If present and false,
   *     then don't run a line-level diff first to identify the changed areas.
   *     Defaults to true, which does a faster, slightly less optimal diff.
   * @param {number=} opt_deadline Optional time when the diff should be complete
   *     by.  Used internally for recursive calls.  Users should set DiffTimeout
   *     instead.
   * @return {!Array.<!diff_match_patch.Diff>} Array of diff tuples.
   */
  diff_main(
    text1: string,
    text2: string,
    opt_checklines?: boolean,
    opt_deadline?: number
  ): Diff[] {
    // Set a deadline by which time the diff must be complete.
    if (typeof opt_deadline == 'undefined') {
      if (this.Diff_Timeout <= 0) {
        opt_deadline = Number.MAX_VALUE;
      } else {
        opt_deadline = new Date().getTime() + this.Diff_Timeout * 1000;
      }
    }
    const deadline = opt_deadline;

    // Check for null inputs.
    if (text1 == null || text2 == null) {
      throw new Error('Null input. (diff_main)');
    }

    // Check for equality (speedup).
    if (text1 == text2) {
      if (text1) {
        return [[DIFF_EQUAL, text1]];
      }
      return [];
    }

    if (typeof opt_checklines == 'undefined') {
      opt_checklines = true;
    }
    const checklines = opt_checklines!;

    // Trim off common prefix (speedup).
    let commonlength = this.diff_commonPrefix(text1, text2);
    const commonprefix = text1.substring(0, commonlength);
    text1 = text1.substring(commonlength);
    text2 = text2.substring(commonlength);

    // Trim off common suffix (speedup).
    commonlength = this.diff_commonSuffix(text1, text2);
    const commonsuffix = text1.substring(text1.length - commonlength);
    text1 = text1.substring(0, text1.length - commonlength);
    text2 = text2.substring(0, text2.length - commonlength);

    // Compute the diff on the middle block.
    const diffs = this.diff_compute_(text1, text2, checklines, deadline);

    // Restore the prefix and suffix.
    if (commonprefix) {
      diffs.unshift([DIFF_EQUAL, commonprefix]);
    }
    if (commonsuffix) {
      diffs.push([DIFF_EQUAL, commonsuffix]);
    }
    this.diff_cleanupMerge(diffs);
    return diffs;
  }

  /**
   * Find the differences between two texts.  Assumes that the texts do not
   * have any common prefix or suffix.
   * @param {string} text1 Old string to be diffed.
   * @param {string} text2 New string to be diffed.
   * @param {boolean} checklines Speedup flag.  If false, then don't run a
   *     line-level diff first to identify the changed areas.
   *     If true, then run a faster, slightly less optimal diff.
   * @param {number} deadline Time when the diff should be complete by.
   * @return {!Array.<!diff_match_patch.Diff>} Array of diff tuples.
   * @private
   */
  private diff_compute_(
    text1: string,
    text2: string,
    checklines: boolean,
    deadline: number
  ): Diff[] {
    let diffs: Diff[];

    if (!text1) {
      // Just add some text (speedup).
      return [[DIFF_INSERT, text2]];
    }

    if (!text2) {
      // Just delete some text (speedup).
      return [[DIFF_DELETE, text1]];
    }

    const longtext = text1.length > text2.length ? text1 : text2;
    const shorttext = text1.length > text2.length ? text2 : text1;
    const i = longtext.indexOf(shorttext);
    if (i != -1) {
      // Shorter text is inside the longer text (speedup).
      diffs = [
        [DIFF_INSERT, longtext.substring(0, i)],
        [DIFF_EQUAL, shorttext],
        [DIFF_INSERT, longtext.substring(i + shorttext.length)],
      ];
      // Swap insertions for deletions if diff is reversed.
      if (text1.length > text2.length) {
        diffs[0][0] = diffs[2][0] = DIFF_DELETE;
      }
      return diffs;
    }

    if (shorttext.length == 1) {
      // Single character string.
      // After the previous speedup, the character can't be an equality.
      return [
        [DIFF_DELETE, text1],
        [DIFF_INSERT, text2],
      ];
    }

    // Check to see if the problem can be split in two.
    const hm = this.diff_halfMatch_(text1, text2);
    if (hm) {
      // A half-match was found, sort out the return data.
      const text1_a = hm[0];
      const text1_b = hm[1];
      const text2_a = hm[2];
      const text2_b = hm[3];
      const mid_common = hm[4];
      // Send both pairs off for separate processing.
      const diffs_a = this.diff_main(text1_a, text2_a, checklines, deadline);
      const diffs_b = this.diff_main(text1_b, text2_b, checklines, deadline);
      // Merge the results.
      return diffs_a.concat([[DIFF_EQUAL, mid_common]], diffs_b);
    }

    if (checklines && text1.length > 100 && text2.length > 100) {
      return this.diff_lineMode_(text1, text2, deadline);
    }

    return this.diff_bisect_(text1, text2, deadline);
  }

  /**
   * Do a quick line-level diff on both strings, then rediff the parts for
   * greater accuracy.
   * This speedup can produce non-minimal diffs.
   * @param {string} text1 Old string to be diffed.
   * @param {string} text2 New string to be diffed.
   * @param {number} deadline Time when the diff should be complete by.
   * @return {!Array.<!diff_match_patch.Diff>} Array of diff tuples.
   * @private
   */
  private diff_lineMode_(
    text1: string,
    text2: string,
    deadline: number
  ): Diff[] {
    // Scan the text on a line-by-line basis first.
    const a = this.diff_linesToChars_(text1, text2);
    text1 = a.chars1;
    text2 = a.chars2;
    const linearray = a.lineArray;

    const diffs = this.diff_main(text1, text2, false, deadline);

    // Convert the diff back to original text.
    this.diff_charsToLines_(diffs, linearray);
    // Eliminate freak matches (e.g. blank lines)
    this.diff_cleanupSemantic(diffs);

    // Rediff any replacement blocks, this time character-by-character.
    // Add a dummy entry at the end.
    diffs.push([DIFF_EQUAL, '']);
    let pointer = 0;
    let count_delete = 0;
    let count_insert = 0;
    let text_delete = '';
    let text_insert = '';
    while (pointer < diffs.length) {
      switch (diffs[pointer][0]) {
        case DIFF_INSERT:
          count_insert++;
          text_insert += diffs[pointer][1];
          break;
        case DIFF_DELETE:
          count_delete++;
          text_delete += diffs[pointer][1];
          break;
        case DIFF_EQUAL:
          // Upon reaching an equality, check for prior redundancies.
          if (count_delete >= 1 && count_insert >= 1) {
            // Delete the offending records and add the merged ones.
            diffs.splice(
              pointer - count_delete - count_insert,
              count_delete + count_insert
            );
            pointer = pointer - count_delete - count_insert;
            const subDiff = this.diff_main(
              text_delete,
              text_insert,
              false,
              deadline
            );
            for (let j = subDiff.length - 1; j >= 0; j--) {
              diffs.splice(pointer, 0, subDiff[j]);
            }
            pointer = pointer + subDiff.length;
          }
          count_insert = 0;
          count_delete = 0;
          text_delete = '';
          text_insert = '';
          break;
        default:
          break;
      }
      pointer++;
    }
    diffs.pop(); // Remove the dummy entry at the end.

    return diffs;
  }

  /**
   * Find the 'middle snake' of a diff, split the problem in two
   * and return the recursively constructed diff.
   * See Myers 1986 paper: An O(ND) Difference Algorithm and Its Variations.
   * @param {string} text1 Old string to be diffed.
   * @param {string} text2 New string to be diffed.
   * @param {number} deadline Time at which to bail if not yet complete.
   * @return {!Array.<!diff_match_patch.Diff>} Array of diff tuples.
   * @private
   */
  private diff_bisect_(text1: string, text2: string, deadline: number): Diff[] {
    // Cache the text lengths to prevent multiple calls.
    const text1_length = text1.length;
    const text2_length = text2.length;
    const max_d = Math.ceil((text1_length + text2_length) / 2);
    const v_offset = max_d;
    const v_length = 2 * max_d;
    const v1 = new Array(v_length);
    const v2 = new Array(v_length);
    // Setting all elements to -1 is faster in Chrome & Firefox than mixing
    // integers and undefined.
    for (let x = 0; x < v_length; x++) {
      v1[x] = -1;
      v2[x] = -1;
    }
    v1[v_offset + 1] = 0;
    v2[v_offset + 1] = 0;
    const delta = text1_length - text2_length;
    // If the total number of characters is odd, then the front path will collide
    // with the reverse path.
    const front = delta % 2 !== 0;
    // Offsets for start and end of k loop.
    // Prevents mapping of space beyond the grid.
    let k1start = 0;
    let k1end = 0;
    let k2start = 0;
    let k2end = 0;
    for (let d = 0; d < max_d; d++) {
      // Bail out if deadline is reached.
      if (new Date().getTime() > deadline) {
        break;
      }

      // Walk the front path one step.
      for (let k1 = -d + k1start; k1 <= d - k1end; k1 += 2) {
        const k1_offset = v_offset + k1;
        let x1;
        if (k1 === -d || (k1 !== d && v1[k1_offset - 1] < v1[k1_offset + 1])) {
          x1 = v1[k1_offset + 1];
        } else {
          x1 = v1[k1_offset - 1] + 1;
        }
        let y1 = x1 - k1;
        while (
          x1 < text1_length &&
          y1 < text2_length &&
          text1.charAt(x1) === text2.charAt(y1)
        ) {
          x1++;
          y1++;
        }
        v1[k1_offset] = x1;
        if (x1 > text1_length) {
          // Ran off the right of the graph.
          k1end += 2;
        } else if (y1 > text2_length) {
          // Ran off the bottom of the graph.
          k1start += 2;
        } else if (front) {
          const k2_offset = v_offset + delta - k1;
          if (k2_offset >= 0 && k2_offset < v_length && v2[k2_offset] !== -1) {
            // Mirror x2 onto top-left coordinate system.
            const x2 = text1_length - v2[k2_offset];
            if (x1 >= x2) {
              // Overlap detected.
              return this.diff_bisectSplit_(text1, text2, x1, y1, deadline);
            }
          }
        }
      }

      // Walk the reverse path one step.
      for (let k2 = -d + k2start; k2 <= d - k2end; k2 += 2) {
        const k2_offset = v_offset + k2;
        let x2;
        if (k2 === -d || (k2 !== d && v2[k2_offset - 1] < v2[k2_offset + 1])) {
          x2 = v2[k2_offset + 1];
        } else {
          x2 = v2[k2_offset - 1] + 1;
        }
        let y2 = x2 - k2;
        while (
          x2 < text1_length &&
          y2 < text2_length &&
          text1.charAt(text1_length - x2 - 1) ===
            text2.charAt(text2_length - y2 - 1)
        ) {
          x2++;
          y2++;
        }
        v2[k2_offset] = x2;
        if (x2 > text1_length) {
          // Ran off the left of the graph.
          k2end += 2;
        } else if (y2 > text2_length) {
          // Ran off the top of the graph.
          k2start += 2;
        } else if (!front) {
          const k1_offset = v_offset + delta - k2;
          if (k1_offset >= 0 && k1_offset < v_length && v1[k1_offset] != -1) {
            const x1 = v1[k1_offset];
            const y1 = v_offset + x1 - k1_offset;
            // Mirror x2 onto top-left coordinate system.
            x2 = text1_length - x2;
            if (x1 >= x2) {
              // Overlap detected.
              return this.diff_bisectSplit_(text1, text2, x1, y1, deadline);
            }
          }
        }
      }
    }
    // Diff took too long and hit the deadline or
    // number of diffs equals number of characters, no commonality at all.
    return [
      [DIFF_DELETE, text1],
      [DIFF_INSERT, text2],
    ];
  }

  /**
   * Given the location of the 'middle snake', split the diff in two parts
   * and recurse.
   * @param {string} text1 Old string to be diffed.
   * @param {string} text2 New string to be diffed.
   * @param {number} x Index of split point in text1.
   * @param {number} y Index of split point in text2.
   * @param {number} deadline Time at which to bail if not yet complete.
   * @return {!Array.<!diff_match_patch.Diff>} Array of diff tuples.
   * @private
   */
  private diff_bisectSplit_(
    text1: string,
    text2: string,
    x: number,
    y: number,
    deadline: number
  ): Diff[] {
    const text1a = text1.substring(0, x);
    const text2a = text2.substring(0, y);
    const text1b = text1.substring(x);
    const text2b = text2.substring(y);

    // Compute both diffs serially.
    const diffs = this.diff_main(text1a, text2a, false, deadline);
    const diffsb = this.diff_main(text1b, text2b, false, deadline);

    return diffs.concat(diffsb);
  }

  /**
   * Split two texts into an array of strings.  Reduce the texts to a string of
   * hashes where each Unicode character represents one line.
   * @param {string} text1 First string.
   * @param {string} text2 Second string.
   * @return {{chars1: string, chars2: string, lineArray: !Array.<string>}}
   *     An object containing the encoded text1, the encoded text2 and
   *     the array of unique strings.
   *     The zeroth element of the array of unique strings is intentionally blank.
   * @private
   */
  private diff_linesToChars_(
    text1: string,
    text2: string
  ): { chars1: string; chars2: string; lineArray: string[] } {
    const lineArray = []; // e.g. lineArray[4] == 'Hello\n'
    const lineHash: { [key: string]: number } = {}; // e.g. lineHash['Hello\n'] == 4

    // '\x00' is a valid character, but various debuggers don't like it.
    // So we'll insert a junk entry to avoid generating a null character.
    lineArray[0] = '';

    /**
     * Split a text into an array of strings.  Reduce the texts to a string of
     * hashes where each Unicode character represents one line.
     * Modifies linearray and linehash through being a closure.
     * @param {string} text String to encode.
     * @return {string} Encoded string.
     * @private
     */
    function diff_linesToCharsMunge_(text: string): string {
      let chars = '';
      // Walk the text, pulling out a substring for each line.
      // text.split('\n') would would temporarily double our memory footprint.
      // Modifying text would create many large strings to garbage collect.
      let lineStart = 0;
      let lineEnd = -1;
      // Keeping our own length variable is faster than looking it up.
      let lineArrayLength = lineArray.length;
      while (lineEnd < text.length - 1) {
        lineEnd = text.indexOf('\n', lineStart);
        if (lineEnd === -1) {
          lineEnd = text.length - 1;
        }
        let line = text.substring(lineStart, lineEnd + 1);

        if (
          lineHash.hasOwnProperty
            ? lineHash.hasOwnProperty(line)
            : lineHash[line] !== undefined
        ) {
          chars += String.fromCharCode(lineHash[line]);
        } else {
          if (lineArrayLength === maxLines) {
            // Bail out at 65535 because
            // String.fromCharCode(65536) == String.fromCharCode(0)
            line = text.substring(lineStart);
            lineEnd = text.length;
          }
          chars += String.fromCharCode(lineArrayLength);
          lineHash[line] = lineArrayLength;
          lineArray[lineArrayLength++] = line;
        }
        lineStart = lineEnd + 1;
      }
      return chars;
    }
    // Allocate 2/3rds of the space for text1, the rest for text2.
    let maxLines = 40000;
    const chars1 = diff_linesToCharsMunge_(text1);
    maxLines = 65535;
    const chars2 = diff_linesToCharsMunge_(text2);
    return { chars1: chars1, chars2: chars2, lineArray: lineArray };
  }

  /**
   * Rehydrate the text in a diff from a string of line hashes to real lines of
   * text.
   * @param {!Array.<!diff_match_patch.Diff>} diffs Array of diff tuples.
   * @param {!Array.<string>} lineArray Array of unique strings.
   * @private
   */
  private diff_charsToLines_(diffs: Diff[], lineArray: string[]): void {
    for (let i = 0; i < diffs.length; i++) {
      const chars = diffs[i][1];
      const text = [];
      for (let j = 0; j < chars.length; j++) {
        text[j] = lineArray[chars.charCodeAt(j)];
      }
      diffs[i][1] = text.join('');
    }
  }

  /**
   * Determine the common prefix of two strings.
   * @param {string} text1 First string.
   * @param {string} text2 Second string.
   * @return {number} The number of characters common to the start of each
   *     string.
   */
  diff_commonPrefix(text1: string, text2: string): number {
    // Quick check for common null cases.
    if (!text1 || !text2 || text1.charAt(0) != text2.charAt(0)) {
      return 0;
    }
    // Binary search.
    // Performance analysis: https://neil.fraser.name/news/2007/10/09/
    let pointermin = 0;
    let pointermax = Math.min(text1.length, text2.length);
    let pointermid = pointermax;
    let pointerstart = 0;
    while (pointermin < pointermid) {
      if (
        text1.substring(pointerstart, pointermid) ==
        text2.substring(pointerstart, pointermid)
      ) {
        pointermin = pointermid;
        pointerstart = pointermin;
      } else {
        pointermax = pointermid;
      }
      pointermid = Math.floor((pointermax - pointermin) / 2 + pointermin);
    }
    return pointermid;
  }

  /**
   * Determine the common suffix of two strings.
   * @param {string} text1 First string.
   * @param {string} text2 Second string.
   * @return {number} The number of characters common to the end of each string.
   */
  diff_commonSuffix(text1: string, text2: string): number {
    // Quick check for common null cases.
    if (
      !text1 ||
      !text2 ||
      text1.charAt(text1.length - 1) != text2.charAt(text2.length - 1)
    ) {
      return 0;
    }
    // Binary search.
    // Performance analysis: https://neil.fraser.name/news/2007/10/09/
    let pointermin = 0;
    let pointermax = Math.min(text1.length, text2.length);
    let pointermid = pointermax;
    let pointerend = 0;
    while (pointermin < pointermid) {
      if (
        text1.substring(text1.length - pointermid, text1.length - pointerend) ==
        text2.substring(text2.length - pointermid, text2.length - pointerend)
      ) {
        pointermin = pointermid;
        pointerend = pointermin;
      } else {
        pointermax = pointermid;
      }
      pointermid = Math.floor((pointermax - pointermin) / 2 + pointermin);
    }
    return pointermid;
  }

  /**
   * Determine if the suffix of one string is the prefix of another.
   * @param {string} text1 First string.
   * @param {string} text2 Second string.
   * @return {number} The number of characters common to the end of the first
   *     string and the start of the second string.
   * @private
   */
  private diff_commonOverlap_(text1: string, text2: string): number {
    // Cache the text lengths to prevent multiple calls.
    const text1_length = text1.length;
    const text2_length = text2.length;
    // Eliminate the null case.
    if (text1_length == 0 || text2_length == 0) {
      return 0;
    }
    // Truncate the longer string.
    if (text1_length > text2_length) {
      text1 = text1.substring(text1_length - text2_length);
    } else if (text1_length < text2_length) {
      text2 = text2.substring(0, text1_length);
    }
    const text_length = Math.min(text1_length, text2_length);
    // Quick check for the worst case.
    if (text1 == text2) {
      return text_length;
    }

    // Start by looking for a single character match
    // and increase length until no match is found.
    // Performance analysis: https://neil.fraser.name/news/2010/11/04/
    let best = 0;
    let length = 1;
    while (true) {
      const pattern = text1.substring(text_length - length);
      const found = text2.indexOf(pattern);
      if (found == -1) {
        return best;
      }
      length += found;
      if (
        found == 0 ||
        text1.substring(text_length - length) == text2.substring(0, length)
      ) {
        best = length;
        length++;
      }
    }
  }

  /**
   * Do the two texts share a substring which is at least half the length of the
   * longer text?
   * This speedup can produce non-minimal diffs.
   * @param {string} text1 First string.
   * @param {string} text2 Second string.
   * @return {Array.<string>} Five element Array, containing the prefix of
   *     text1, the suffix of text1, the prefix of text2, the suffix of
   *     text2 and the common middle.  Or null if there was no match.
   * @private
   */
  private diff_halfMatch_(text1: string, text2: string): string[] | null {
    if (this.Diff_Timeout <= 0) {
      // Don't risk returning a non-optimal diff if we have unlimited time.
      return null;
    }
    const longtext = text1.length > text2.length ? text1 : text2;
    const shorttext = text1.length > text2.length ? text2 : text1;
    if (longtext.length < 4 || shorttext.length * 2 < longtext.length) {
      return null; // Pointless.
    }
    const dmp = this; // 'this' becomes 'window' in a closure.

    /**
     * Does a substring of shorttext exist within longtext such that the substring
     * is at least half the length of longtext?
     * Closure, but does not reference any external variables.
     * @param {string} longtext Longer string.
     * @param {string} shorttext Shorter string.
     * @param {number} i Start index of quarter length substring within longtext.
     * @return {Array.<string>} Five element Array, containing the prefix of
     *     longtext, the suffix of longtext, the prefix of shorttext, the suffix
     *     of shorttext and the common middle.  Or null if there was no match.
     * @private
     */
    function diff_halfMatchI_(
      longtext: string,
      shorttext: string,
      i: number
    ): string[] | null {
      // Start with a 1/4 length substring at position i as a seed.
      const seed = longtext.substring(i, i + Math.floor(longtext.length / 4));
      let j = -1;
      let best_common = '';
      let best_longtext_a: string,
        best_longtext_b: string,
        best_shorttext_a: string,
        best_shorttext_b: string;
      while ((j = shorttext.indexOf(seed, j + 1)) != -1) {
        const prefixLength = dmp.diff_commonPrefix(
          longtext.substring(i),
          shorttext.substring(j)
        );
        const suffixLength = dmp.diff_commonSuffix(
          longtext.substring(0, i),
          shorttext.substring(0, j)
        );
        if (best_common.length < suffixLength + prefixLength) {
          best_common =
            shorttext.substring(j - suffixLength, j) +
            shorttext.substring(j, j + prefixLength);
          best_longtext_a = longtext.substring(0, i - suffixLength);
          best_longtext_b = longtext.substring(i + prefixLength);
          best_shorttext_a = shorttext.substring(0, j - suffixLength);
          best_shorttext_b = shorttext.substring(j + prefixLength);
        }
      }
      if (best_common.length * 2 >= longtext.length) {
        return [
          best_longtext_a!,
          best_longtext_b!,
          best_shorttext_a!,
          best_shorttext_b!,
          best_common,
        ];
      } else {
        return null;
      }
    }

    // First check if the second quarter is the seed for a half-match.
    const hm1 = diff_halfMatchI_(
      longtext,
      shorttext,
      Math.ceil(longtext.length / 4)
    );
    // Check again based on the third quarter.
    const hm2 = diff_halfMatchI_(
      longtext,
      shorttext,
      Math.ceil(longtext.length / 2)
    );
    let hm;
    if (!hm1 && !hm2) {
      return null;
    } else if (!hm2) {
      hm = hm1;
    } else if (!hm1) {
      hm = hm2;
    } else {
      // Both matched.  Select the longest.
      hm = hm1[4].length > hm2[4].length ? hm1 : hm2;
    }

    // A half-match was found, sort out the return data.
    let text1_a, text1_b, text2_a, text2_b;
    if (text1.length > text2.length) {
      text1_a = hm![0];
      text1_b = hm![1];
      text2_a = hm![2];
      text2_b = hm![3];
    } else {
      text2_a = hm![0];
      text2_b = hm![1];
      text1_a = hm![2];
      text1_b = hm![3];
    }
    const mid_common = hm![4];
    return [text1_a, text1_b, text2_a, text2_b, mid_common];
  }

  /**
   * Reduce the number of edits by eliminating semantically trivial equalities.
   * @param {!Array.<!diff_match_patch.Diff>} diffs Array of diff tuples.
   */
  diff_cleanupSemantic(diffs: Diff[]): void {
    let changes = false;
    const equalities = []; // Stack of indices where equalities are found.
    let equalitiesLength = 0; // Keeping our own length const is faster in JS.
    /** @type {?string} */
    let lastEquality = null;
    // Always equal to diffs[equalities[equalitiesLength - 1]][1]
    let pointer = 0; // Index of current position.
    // Number of characters that changed prior to the equality.
    let length_insertions1 = 0;
    let length_deletions1 = 0;
    // Number of characters that changed after the equality.
    let length_insertions2 = 0;
    let length_deletions2 = 0;
    while (pointer < diffs.length) {
      if (diffs[pointer][0] == DIFF_EQUAL) {
        // Equality found.
        equalities[equalitiesLength++] = pointer;
        length_insertions1 = length_insertions2;
        length_deletions1 = length_deletions2;
        length_insertions2 = 0;
        length_deletions2 = 0;
        lastEquality = diffs[pointer][1];
      } else {
        // An insertion or deletion.
        if (diffs[pointer][0] == DIFF_INSERT) {
          length_insertions2 += diffs[pointer][1].length;
        } else {
          length_deletions2 += diffs[pointer][1].length;
        }
        // Eliminate an equality that is smaller or equal to the edits on both
        // sides of it.
        if (
          lastEquality &&
          lastEquality.length <=
            Math.max(length_insertions1, length_deletions1) &&
          lastEquality.length <= Math.max(length_insertions2, length_deletions2)
        ) {
          // Duplicate record.
          diffs.splice(equalities[equalitiesLength - 1], 0, [
            DIFF_DELETE,
            lastEquality,
          ]);
          // Change second copy to insert.
          diffs[equalities[equalitiesLength - 1] + 1][0] = DIFF_INSERT;
          // Throw away the equality we just deleted.
          equalitiesLength--;
          // Throw away the previous equality (it needs to be reevaluated).
          equalitiesLength--;
          pointer =
            equalitiesLength > 0 ? equalities[equalitiesLength - 1] : -1;
          length_insertions1 = 0; // Reset the counters.
          length_deletions1 = 0;
          length_insertions2 = 0;
          length_deletions2 = 0;
          lastEquality = null;
          changes = true;
        }
      }
      pointer++;
    }

    // Normalize the diff.
    if (changes) {
      this.diff_cleanupMerge(diffs);
    }
    this.diff_cleanupSemanticLossless(diffs);

    // Find any overlaps between deletions and insertions.
    // e.g: <del>abcxxx</del><ins>xxxdef</ins>
    //   -> <del>abc</del>xxx<ins>def</ins>
    // e.g: <del>xxxabc</del><ins>defxxx</ins>
    //   -> <ins>def</ins>xxx<del>abc</del>
    // Only extract an overlap if it is as big as the edit ahead or behind it.
    pointer = 1;
    while (pointer < diffs.length) {
      if (
        diffs[pointer - 1][0] == DIFF_DELETE &&
        diffs[pointer][0] == DIFF_INSERT
      ) {
        const deletion = diffs[pointer - 1][1];
        const insertion = diffs[pointer][1];
        const overlap_length1 = this.diff_commonOverlap_(deletion, insertion);
        const overlap_length2 = this.diff_commonOverlap_(insertion, deletion);
        if (overlap_length1 >= overlap_length2) {
          if (
            overlap_length1 >= deletion.length / 2 ||
            overlap_length1 >= insertion.length / 2
          ) {
            // Overlap found.  Insert an equality and trim the surrounding edits.
            diffs.splice(pointer, 0, [
              DIFF_EQUAL,
              insertion.substring(0, overlap_length1),
            ]);
            diffs[pointer - 1][1] = deletion.substring(
              0,
              deletion.length - overlap_length1
            );
            diffs[pointer + 1][1] = insertion.substring(overlap_length1);
            pointer++;
          }
        } else {
          if (
            overlap_length2 >= deletion.length / 2 ||
            overlap_length2 >= insertion.length / 2
          ) {
            // Reverse overlap found.
            // Insert an equality and swap and trim the surrounding edits.
            diffs.splice(pointer, 0, [
              DIFF_EQUAL,
              deletion.substring(0, overlap_length2),
            ]);
            diffs[pointer - 1][0] = DIFF_INSERT;
            diffs[pointer - 1][1] = insertion.substring(
              0,
              insertion.length - overlap_length2
            );
            diffs[pointer + 1][0] = DIFF_DELETE;
            diffs[pointer + 1][1] = deletion.substring(overlap_length2);
            pointer++;
          }
        }
        pointer++;
      }
      pointer++;
    }
  }

  /**
   * Look for single edits surrounded on both sides by equalities
   * which can be shifted sideways to align the edit to a word boundary.
   * e.g: The c<ins>at c</ins>ame. -> The <ins>cat </ins>came.
   * @param {!Array.<!diff_match_patch.Diff>} diffs Array of diff tuples.
   */
  diff_cleanupSemanticLossless(diffs: Diff[]): void {
    /**
     * Given two strings, compute a score representing whether the internal
     * boundary falls on logical boundaries.
     * Scores range from 6 (best) to 0 (worst).
     * Closure, but does not reference any external variables.
     * @param {string} one First string.
     * @param {string} two Second string.
     * @return {number} The score.
     * @private
     */
    function diff_cleanupSemanticScore_(one: string, two: string): number {
      if (!one || !two) {
        // Edges are the best.
        return 6;
      }

      // Each port of this function behaves slightly differently due to
      // subtle differences in each language's definition of things like
      // 'whitespace'.  Since this function's purpose is largely cosmetic,
      // the choice has been made to use each language's native features
      // rather than force total conformity.
      const char1 = one.charAt(one.length - 1);
      const char2 = two.charAt(0);
      const nonAlphaNumeric1 = char1.match(kNonAlphaNumericRegex_);
      const nonAlphaNumeric2 = char2.match(kNonAlphaNumericRegex_);
      const whitespace1 = nonAlphaNumeric1 && char1.match(kWhitespaceRegex_);
      const whitespace2 = nonAlphaNumeric2 && char2.match(kWhitespaceRegex_);
      const lineBreak1 = whitespace1 && char1.match(kLinebreakRegex_);
      const lineBreak2 = whitespace2 && char2.match(kLinebreakRegex_);
      const blankLine1 = lineBreak1 && one.match(kBlanklineEndRegex_);
      const blankLine2 = lineBreak2 && two.match(kBlanklineStartRegex_);

      if (blankLine1 || blankLine2) {
        // Five points for blank lines.
        return 5;
      } else if (lineBreak1 || lineBreak2) {
        // Four points for line breaks.
        return 4;
      } else if (nonAlphaNumeric1 && !whitespace1 && whitespace2) {
        // Three points for end of sentences.
        return 3;
      } else if (whitespace1 || whitespace2) {
        // Two points for whitespace.
        return 2;
      } else if (nonAlphaNumeric1 || nonAlphaNumeric2) {
        // One point for non-alphanumeric.
        return 1;
      }
      return 0;
    }

    let pointer = 1;
    // Intentionally ignore the first and last element (don't need checking).
    while (pointer < diffs.length - 1) {
      if (
        diffs[pointer - 1][0] == DIFF_EQUAL &&
        diffs[pointer + 1][0] == DIFF_EQUAL
      ) {
        // This is a single edit surrounded by equalities.
        let equality1 = diffs[pointer - 1][1];
        let edit = diffs[pointer][1];
        let equality2 = diffs[pointer + 1][1];

        // First, shift the edit as far left as possible.
        const commonOffset = this.diff_commonSuffix(equality1, edit);
        if (commonOffset) {
          const commonString = edit.substring(edit.length - commonOffset);
          equality1 = equality1.substring(0, equality1.length - commonOffset);
          edit = commonString + edit.substring(0, edit.length - commonOffset);
          equality2 = commonString + equality2;
        }

        // Second, step character by character right, looking for the best fit.
        let bestEquality1 = equality1;
        let bestEdit = edit;
        let bestEquality2 = equality2;
        let bestScore =
          diff_cleanupSemanticScore_(equality1, edit) +
          diff_cleanupSemanticScore_(edit, equality2);
        while (edit.charAt(0) === equality2.charAt(0)) {
          equality1 += edit.charAt(0);
          edit = edit.substring(1) + equality2.charAt(0);
          equality2 = equality2.substring(1);
          const score =
            diff_cleanupSemanticScore_(equality1, edit) +
            diff_cleanupSemanticScore_(edit, equality2);
          // The >= encourages trailing rather than leading whitespace on edits.
          if (score >= bestScore) {
            bestScore = score;
            bestEquality1 = equality1;
            bestEdit = edit;
            bestEquality2 = equality2;
          }
        }

        if (diffs[pointer - 1][1] != bestEquality1) {
          // We have an improvement, save it back to the diff.
          if (bestEquality1) {
            diffs[pointer - 1][1] = bestEquality1;
          } else {
            diffs.splice(pointer - 1, 1);
            pointer--;
          }
          diffs[pointer][1] = bestEdit;
          if (bestEquality2) {
            diffs[pointer + 1][1] = bestEquality2;
          } else {
            diffs.splice(pointer + 1, 1);
            pointer--;
          }
        }
      }
      pointer++;
    }
  }

  /**
   * Reduce the number of edits by eliminating operationally trivial equalities.
   * @param {!Array.<!diff_match_patch.Diff>} diffs Array of diff tuples.
   */
  diff_cleanupEfficiency(diffs: Diff[]): void {
    let changes = false;
    const equalities = []; // Stack of indices where equalities are found.
    let equalitiesLength = 0; // Keeping our own length const is faster in JS.
    /** @type {?string} */
    let lastEquality = null;
    // Always equal to diffs[equalities[equalitiesLength - 1]][1]
    let pointer = 0; // Index of current position.
    // Is there an insertion operation before the last equality.
    let pre_ins = 0;
    // Is there a deletion operation before the last equality.
    let pre_del = 0;
    // Is there an insertion operation after the last equality.
    let post_ins = 0;
    // Is there a deletion operation after the last equality.
    let post_del = 0;
    while (pointer < diffs.length) {
      if (diffs[pointer][0] == DIFF_EQUAL) {
        // Equality found.
        if (
          diffs[pointer][1].length < this.Diff_EditCost &&
          (post_ins || post_del)
        ) {
          // Candidate found.
          equalities[equalitiesLength++] = pointer;
          pre_ins = post_ins;
          pre_del = post_del;
          lastEquality = diffs[pointer][1];
        } else {
          // Not a candidate, and can never become one.
          equalitiesLength = 0;
          lastEquality = null;
        }
        post_ins = post_del = 0;
      } else {
        // An insertion or deletion.
        if (diffs[pointer][0] == DIFF_DELETE) {
          post_del = 1;
        } else {
          post_ins = 1;
        }
        /*
         * Five types to be split:
         * <ins>A</ins><del>B</del>XY<ins>C</ins><del>D</del>
         * <ins>A</ins>X<ins>C</ins><del>D</del>
         * <ins>A</ins><del>B</del>X<ins>C</ins>
         * <ins>A</del>X<ins>C</ins><del>D</del>
         * <ins>A</ins><del>B</del>X<del>C</del>
         */
        if (
          lastEquality &&
          ((pre_ins && pre_del && post_ins && post_del) ||
            (lastEquality.length < this.Diff_EditCost / 2 &&
              pre_ins + pre_del + post_ins + post_del == 3))
        ) {
          // Duplicate record.
          diffs.splice(equalities[equalitiesLength - 1], 0, [
            DIFF_DELETE,
            lastEquality,
          ]);
          // Change second copy to insert.
          diffs[equalities[equalitiesLength - 1] + 1][0] = DIFF_INSERT;
          equalitiesLength--; // Throw away the equality we just deleted;
          lastEquality = null;
          if (pre_ins && pre_del) {
            // No changes made which could affect previous entry, keep going.
            post_ins = post_del = 1;
            equalitiesLength = 0;
          } else {
            equalitiesLength--; // Throw away the previous equality.
            pointer =
              equalitiesLength > 0 ? equalities[equalitiesLength - 1] : -1;
            post_ins = post_del = 0;
          }
          changes = true;
        }
      }
      pointer++;
    }

    if (changes) {
      this.diff_cleanupMerge(diffs);
    }
  }

  /**
   * Reorder and merge like edit sections.  Merge equalities.
   * Any edit section can move as long as it doesn't cross an equality.
   * @param {!Array.<!diff_match_patch.Diff>} diffs Array of diff tuples.
   */
  diff_cleanupMerge(diffs: Diff[]): void {
    // Add a dummy entry at the end.
    diffs.push([DIFF_EQUAL, '']);
    let pointer = 0;
    let count_delete = 0;
    let count_insert = 0;
    let text_delete = '';
    let text_insert = '';
    let commonlength;
    while (pointer < diffs.length) {
      switch (diffs[pointer][0]) {
        case DIFF_INSERT:
          count_insert++;
          text_insert += diffs[pointer][1];
          pointer++;
          break;
        case DIFF_DELETE:
          count_delete++;
          text_delete += diffs[pointer][1];
          pointer++;
          break;
        case DIFF_EQUAL:
          // Upon reaching an equality, check for prior redundancies.
          if (count_delete + count_insert > 1) {
            if (count_delete !== 0 && count_insert !== 0) {
              // Factor out any common prefixies.
              commonlength = this.diff_commonPrefix(text_insert, text_delete);
              if (commonlength !== 0) {
                if (
                  pointer - count_delete - count_insert > 0 &&
                  diffs[pointer - count_delete - count_insert - 1][0] ==
                    DIFF_EQUAL
                ) {
                  diffs[pointer - count_delete - count_insert - 1][1] +=
                    text_insert.substring(0, commonlength);
                } else {
                  diffs.splice(0, 0, [
                    DIFF_EQUAL,
                    text_insert.substring(0, commonlength),
                  ]);
                  pointer++;
                }
                text_insert = text_insert.substring(commonlength);
                text_delete = text_delete.substring(commonlength);
              }
              // Factor out any common suffixies.
              commonlength = this.diff_commonSuffix(text_insert, text_delete);
              if (commonlength !== 0) {
                diffs[pointer][1] =
                  text_insert.substring(text_insert.length - commonlength) +
                  diffs[pointer][1];
                text_insert = text_insert.substring(
                  0,
                  text_insert.length - commonlength
                );
                text_delete = text_delete.substring(
                  0,
                  text_delete.length - commonlength
                );
              }
            }
            // Delete the offending records and add the merged ones.
            pointer -= count_delete + count_insert;
            diffs.splice(pointer, count_delete + count_insert);
            if (text_delete.length) {
              diffs.splice(pointer, 0, [DIFF_DELETE, text_delete]);
              pointer++;
            }
            if (text_insert.length) {
              diffs.splice(pointer, 0, [DIFF_INSERT, text_insert]);
              pointer++;
            }
            pointer++;
          } else if (pointer !== 0 && diffs[pointer - 1][0] == DIFF_EQUAL) {
            // Merge this equality with the previous one.
            diffs[pointer - 1][1] += diffs[pointer][1];
            diffs.splice(pointer, 1);
          } else {
            pointer++;
          }
          count_insert = 0;
          count_delete = 0;
          text_delete = '';
          text_insert = '';
          break;
      }
    }
    if (diffs[diffs.length - 1][1] === '') {
      diffs.pop(); // Remove the dummy entry at the end.
    }

    // Second pass: look for single edits surrounded on both sides by equalities
    // which can be shifted sideways to eliminate an equality.
    // e.g: A<ins>BA</ins>C -> <ins>AB</ins>AC
    let changes = false;
    pointer = 1;
    // Intentionally ignore the first and last element (don't need checking).
    while (pointer < diffs.length - 1) {
      if (
        diffs[pointer - 1][0] == DIFF_EQUAL &&
        diffs[pointer + 1][0] == DIFF_EQUAL
      ) {
        // This is a single edit surrounded by equalities.
        if (
          diffs[pointer][1].substring(
            diffs[pointer][1].length - diffs[pointer - 1][1].length
          ) == diffs[pointer - 1][1]
        ) {
          // Shift the edit over the previous equality.
          diffs[pointer][1] =
            diffs[pointer - 1][1] +
            diffs[pointer][1].substring(
              0,
              diffs[pointer][1].length - diffs[pointer - 1][1].length
            );
          diffs[pointer + 1][1] = diffs[pointer - 1][1] + diffs[pointer + 1][1];
          diffs.splice(pointer - 1, 1);
          changes = true;
        } else if (
          diffs[pointer][1].substring(0, diffs[pointer + 1][1].length) ==
          diffs[pointer + 1][1]
        ) {
          // Shift the edit over the next equality.
          diffs[pointer - 1][1] += diffs[pointer + 1][1];
          diffs[pointer][1] =
            diffs[pointer][1].substring(diffs[pointer + 1][1].length) +
            diffs[pointer + 1][1];
          diffs.splice(pointer + 1, 1);
          changes = true;
        }
      }
      pointer++;
    }
    // If shifts were made, the diff needs reordering and another shift sweep.
    if (changes) {
      this.diff_cleanupMerge(diffs);
    }
  }

  /**
   * loc is a location in text1, compute and return the equivalent location in
   * text2.
   * e.g. 'The cat' vs 'The big cat', 1->1, 5->8
   * @param {!Array.<!diff_match_patch.Diff>} diffs Array of diff tuples.
   * @param {number} loc Location within text1.
   * @return {number} Location within text2.
   */
  diff_xIndex(diffs: Diff[], loc: number): number {
    let chars1 = 0;
    let chars2 = 0;
    let last_chars1 = 0;
    let last_chars2 = 0;
    let x: number;
    for (x = 0; x < diffs.length; x++) {
      if (diffs[x][0] !== DIFF_INSERT) {
        // Equality or deletion.
        chars1 += diffs[x][1].length;
      }
      if (diffs[x][0] !== DIFF_DELETE) {
        // Equality or insertion.
        chars2 += diffs[x][1].length;
      }
      if (chars1 > loc) {
        // Overshot the location.
        break;
      }
      last_chars1 = chars1;
      last_chars2 = chars2;
    }
    // Was the location was deleted?
    if (diffs.length != x && diffs[x][0] === DIFF_DELETE) {
      return last_chars2;
    }
    // Add the remaining character length.
    return last_chars2 + (loc - last_chars1);
  }

  /**
   * Convert a diff array into a pretty HTML report.
   * @param {!Array.<!diff_match_patch.Diff>} diffs Array of diff tuples.
   * @return {string} HTML representation.
   */
  diff_prettyHtml(diffs: Diff[]): string {
    const html = [];
    const pattern_amp = /&/g;
    const pattern_lt = /</g;
    const pattern_gt = />/g;
    const pattern_para = /\n/g;
    for (let x = 0; x < diffs.length; x++) {
      const op = diffs[x][0]; // Operation (insert, delete, equal)
      const data = diffs[x][1]; // Text of change.
      const text = data
        .replace(pattern_amp, '&amp;')
        .replace(pattern_lt, '&lt;')
        .replace(pattern_gt, '&gt;')
        .replace(pattern_para, '&para;<br>');
      switch (op) {
        case DIFF_INSERT:
          html[x] = '<ins style="background:#e6ffe6;">' + text + '</ins>';
          break;
        case DIFF_DELETE:
          html[x] = '<del style="background:#ffe6e6;">' + text + '</del>';
          break;
        case DIFF_EQUAL:
          html[x] = '<span>' + text + '</span>';
          break;
      }
    }
    return html.join('');
  }

  /**
   * Compute and return the source text (all equalities and deletions).
   * @param {!Array.<!diff_match_patch.Diff>} diffs Array of diff tuples.
   * @return {string} Source text.
   */
  diff_text1(diffs: Diff[]): string {
    const text = [];
    for (let x = 0; x < diffs.length; x++) {
      if (diffs[x][0] !== DIFF_INSERT) {
        text[x] = diffs[x][1];
      }
    }
    return text.join('');
  }

  /**
   * Compute and return the destination text (all equalities and insertions).
   * @param {!Array.<!diff_match_patch.Diff>} diffs Array of diff tuples.
   * @return {string} Destination text.
   */
  diff_text2(diffs: Diff[]): string {
    const text = [];
    for (let x = 0; x < diffs.length; x++) {
      if (diffs[x][0] !== DIFF_DELETE) {
        text[x] = diffs[x][1];
      }
    }
    return text.join('');
  }

  /**
   * Compute the Levenshtein distance; the number of inserted, deleted or
   * substituted characters.
   * @param {!Array.<!diff_match_patch.Diff>} diffs Array of diff tuples.
   * @return {number} Number of changes.
   */
  diff_levenshtein(diffs: Diff[]): number {
    let levenshtein = 0;
    let insertions = 0;
    let deletions = 0;
    for (let x = 0; x < diffs.length; x++) {
      const op = diffs[x][0];
      const data = diffs[x][1];
      switch (op) {
        case DIFF_INSERT:
          insertions += data.length;
          break;
        case DIFF_DELETE:
          deletions += data.length;
          break;
        case DIFF_EQUAL:
          // A deletion and an insertion is one substitution.
          levenshtein += Math.max(insertions, deletions);
          insertions = 0;
          deletions = 0;
          break;
      }
    }
    levenshtein += Math.max(insertions, deletions);
    return levenshtein;
  }

  /**
   * Crush the diff into an encoded string which describes the operations
   * required to transform text1 into text2.
   * E.g. =3\t-2\t+ing  -> Keep 3 chars, delete 2 chars, insert 'ing'.
   * Operations are tab-separated.  Inserted text is escaped using %xx notation.
   * @param {!Array.<!diff_match_patch.Diff>} diffs Array of diff tuples.
   * @return {string} Delta text.
   */
  diff_toDelta(diffs: Diff[]): string {
    const text = [];
    for (let x = 0; x < diffs.length; x++) {
      switch (diffs[x][0]) {
        case DIFF_INSERT:
          text[x] = '+' + encodeURI(diffs[x][1]);
          break;
        case DIFF_DELETE:
          text[x] = '-' + diffs[x][1].length;
          break;
        case DIFF_EQUAL:
          text[x] = '=' + diffs[x][1].length;
          break;
      }
    }
    return text.join('\t').replace(/%20/g, ' ');
  }

  /**
   * Given the original text1, and an encoded string which describes the
   * operations required to transform text1 into text2, compute the full diff.
   * @param {string} text1 Source string for the diff.
   * @param {string} delta Delta text.
   * @return {!Array.<!diff_match_patch.Diff>} Array of diff tuples.
   * @throws {!Error} If invalid input.
   */
  diff_fromDelta(text1: string, delta: string): Diff[] {
    const diffs: Diff[] = [];
    let diffsLength = 0; // Keeping our own length const is faster in JS.
    let pointer = 0; // Cursor in text1
    const tokens = delta.split(/\t/g);
    for (let x = 0; x < tokens.length; x++) {
      // Each token begins with a one character parameter which specifies the
      // operation of this token (delete, insert, equality).
      const param = tokens[x].substring(1);
      switch (tokens[x].charAt(0)) {
        case '+':
          try {
            diffs[diffsLength++] = [DIFF_INSERT, decodeURI(param)];
          } catch (ex) {
            // Malformed URI sequence.
            throw new Error('Illegal escape in diff_fromDelta: ' + param);
          }
          break;
        case '-':
        // Fall through.
        case '=':
          const n = parseInt(param, 10);
          if (isNaN(n) || n < 0) {
            throw new Error('Invalid number in diff_fromDelta: ' + param);
          }
          const text = text1.substring(pointer, (pointer += n));
          if (tokens[x].charAt(0) == '=') {
            diffs[diffsLength++] = [DIFF_EQUAL, text];
          } else {
            diffs[diffsLength++] = [DIFF_DELETE, text];
          }
          break;
        default:
          // Blank tokens are ok (from a trailing \t).
          // Anything else is an error.
          if (tokens[x]) {
            throw new Error(
              'Invalid diff operation in diff_fromDelta: ' + tokens[x]
            );
          }
      }
    }
    if (pointer != text1.length) {
      throw new Error(
        'Delta length (' +
          pointer +
          ') does not equal source text length (' +
          text1.length +
          ').'
      );
    }
    return diffs;
  }

  //  MATCH FUNCTIONS

  /**
   * Locate the best instance of 'pattern' in 'text' near 'loc'.
   * @param {string} text The text to search.
   * @param {string} pattern The pattern to search for.
   * @param {number} loc The location to search around.
   * @return {number} Best match index or -1.
   */
  match_main(text: string, pattern: string, loc: number): number {
    // Check for null inputs.
    if (text == null || pattern == null || loc == null) {
      throw new Error('Null input. (match_main)');
    }

    loc = Math.max(0, Math.min(loc, text.length));
    if (text == pattern) {
      // Shortcut (potentially not guaranteed by the algorithm)
      return 0;
    } else if (!text.length) {
      // Nothing to match.
      return -1;
    } else if (text.substring(loc, loc + pattern.length) == pattern) {
      // Perfect match at the perfect spot!  (Includes case of null pattern)
      return loc;
    } else {
      // Do a fuzzy compare.
      return this.match_bitap_(text, pattern, loc);
    }
  }

  /**
   * Locate the best instance of 'pattern' in 'text' near 'loc' using the
   * Bitap algorithm.
   * @param {string} text The text to search.
   * @param {string} pattern The pattern to search for.
   * @param {number} loc The location to search around.
   * @return {number} Best match index or -1.
   * @private
   */
  private match_bitap_(text: string, pattern: string, loc: number): number {
    if (pattern.length > this.Match_MaxBits) {
      throw new Error('Pattern too long for this browser.');
    }

    // Initialise the alphabet.
    const s = this.match_alphabet_(pattern);

    const dmp = this; // 'this' becomes 'window' in a closure.

    /**
     * Compute and return the score for a match with e errors and x location.
     * Accesses loc and pattern through being a closure.
     * @param {number} e Number of errors in match.
     * @param {number} x Location of match.
     * @return {number} Overall score for match (0.0 = good, 1.0 = bad).
     * @private
     */
    function match_bitapScore_(e: number, x: number): number {
      const accuracy = e / pattern.length;
      const proximity = Math.abs(loc - x);
      if (!dmp.Match_Distance) {
        // Dodge divide by zero error.
        return proximity ? 1.0 : accuracy;
      }
      return accuracy + proximity / dmp.Match_Distance;
    }

    // Highest score beyond which we give up.
    let score_threshold = this.Match_Threshold;
    // Is there a nearby exact match? (speedup)
    let best_loc = text.indexOf(pattern, loc);
    if (best_loc != -1) {
      score_threshold = Math.min(
        match_bitapScore_(0, best_loc),
        score_threshold
      );
      // What about in the other direction? (speedup)
      best_loc = text.lastIndexOf(pattern, loc + pattern.length);
      if (best_loc != -1) {
        score_threshold = Math.min(
          match_bitapScore_(0, best_loc),
          score_threshold
        );
      }
    }

    // Initialise the bit arrays.
    const matchmask = 1 << (pattern.length - 1);
    best_loc = -1;

    let bin_min: number, bin_mid: number;
    let bin_max = pattern.length + text.length;
    let last_rd: number[];
    for (let d = 0; d < pattern.length; d++) {
      // Scan for the best match; each iteration allows for one more error.
      // Run a binary search to determine how far from 'loc' we can stray at this
      // error level.
      bin_min = 0;
      bin_mid = bin_max;
      while (bin_min < bin_mid) {
        if (match_bitapScore_(d, loc + bin_mid) <= score_threshold) {
          bin_min = bin_mid;
        } else {
          bin_max = bin_mid;
        }
        bin_mid = Math.floor((bin_max - bin_min) / 2 + bin_min);
      }
      // Use the result from this iteration as the maximum for the next.
      bin_max = bin_mid;
      let start = Math.max(1, loc - bin_mid + 1);
      const finish = Math.min(loc + bin_mid, text.length) + pattern.length;

      const rd = Array(finish + 2);
      rd[finish + 1] = (1 << d) - 1;
      for (let j = finish; j >= start; j--) {
        // The alphabet (s) is a sparse hash, so the following line generates
        // warnings.
        const charMatch = s[text.charAt(j - 1)];
        if (d === 0) {
          // First pass: exact match.
          rd[j] = ((rd[j + 1] << 1) | 1) & charMatch;
        } else {
          // Subsequent passes: fuzzy match.
          rd[j] =
            (((rd[j + 1] << 1) | 1) & charMatch) |
            (((last_rd![j + 1] | last_rd![j]) << 1) | 1) |
            last_rd![j + 1];
        }
        if (rd[j] & matchmask) {
          const score = match_bitapScore_(d, j - 1);
          // This match will almost certainly be better than any existing match.
          // But check anyway.
          if (score <= score_threshold) {
            // Told you so.
            score_threshold = score;
            best_loc = j - 1;
            if (best_loc > loc) {
              // When passing loc, don't exceed our current distance from loc.
              start = Math.max(1, 2 * loc - best_loc);
            } else {
              // Already passed loc, downhill from here on in.
              break;
            }
          }
        }
      }
      // No hope for a (better) match at greater error levels.
      if (match_bitapScore_(d + 1, loc) > score_threshold) {
        break;
      }
      last_rd = rd;
    }
    return best_loc;
  }

  /**
   * Initialise the alphabet for the Bitap algorithm.
   * @param {string} pattern The text to encode.
   * @return {!Object} Hash of character locations.
   * @private
   */
  private match_alphabet_(pattern: string): { [char: string]: number } {
    const s: { [char: string]: number } = {};
    for (let i = 0; i < pattern.length; i++) {
      s[pattern.charAt(i)] = 0;
    }
    for (let i = 0; i < pattern.length; i++) {
      s[pattern.charAt(i)] |= 1 << (pattern.length - i - 1);
    }
    return s;
  }

  //  PATCH FUNCTIONS

  /**
   * Increase the context until it is unique,
   * but don't let the pattern expand beyond Match_MaxBits.
   * @param {!diff_match_patch.patch_obj} patch The patch to grow.
   * @param {string} text Source text.
   * @private
   */
  private patch_addContext_(patch: Patch, text: string): void {
    if (text.length == 0) {
      return;
    }
    if (patch.start2 === null) {
      throw Error('patch not initialized');
    }
    let pattern = text.substring(patch.start2, patch.start2 + patch.length1);
    let padding = 0;

    // Look for the first and last matches of pattern in text.  If two different
    // matches are found, increase the pattern length.
    while (
      text.indexOf(pattern) != text.lastIndexOf(pattern) &&
      pattern.length <
        this.Match_MaxBits - this.Patch_Margin - this.Patch_Margin
    ) {
      padding += this.Patch_Margin;
      pattern = text.substring(
        patch.start2 - padding,
        patch.start2 + patch.length1 + padding
      );
    }
    // Add one chunk for good luck.
    padding += this.Patch_Margin;

    // Add the prefix.
    const prefix = text.substring(patch.start2 - padding, patch.start2);
    if (prefix) {
      patch.diffs.unshift([DIFF_EQUAL, prefix]);
    }
    // Add the suffix.
    const suffix = text.substring(
      patch.start2 + patch.length1,
      patch.start2 + patch.length1 + padding
    );
    if (suffix) {
      patch.diffs.push([DIFF_EQUAL, suffix]);
    }

    // Roll back the start points.
    patch.start1 = patch.start1 || 0 - prefix.length;
    patch.start2 = patch.start2 || 0 - prefix.length;
    // Extend the lengths.
    patch.length1 += prefix.length + suffix.length;
    patch.length2 += prefix.length + suffix.length;
  }

  /**
   * Compute a list of patches to turn text1 into text2.
   * Use diffs if provided, otherwise compute it ourselves.
   * There are four ways to call this function, depending on what data is
   * available to the caller:
   * Method 1:
   * a = text1, b = text2
   * Method 2:
   * a = diffs
   * Method 3 (optimal):
   * a = text1, b = diffs
   * Method 4 (deprecated, use method 3):
   * a = text1, b = text2, c = diffs
   *
   * @param {string|!Array.<!diff_match_patch.Diff>} a text1 (methods 1,3,4) or
   * Array of diff tuples for text1 to text2 (method 2).
   * @param {string|!Array.<!diff_match_patch.Diff>} opt_b text2 (methods 1,4) or
   * Array of diff tuples for text1 to text2 (method 3) or undefined (method 2).
   * @param {string|!Array.<!diff_match_patch.Diff>} opt_c Array of diff tuples
   * for text1 to text2 (method 4) or undefined (methods 1,2,3).
   * @return {!Array.<!diff_match_patch.patch_obj>} Array of Patch objects.
   */
  patch_make(
    a: string | Diff[],
    opt_b: string | Diff[],
    opt_c: string | Diff[]
  ): Patch[] {
    let text1: string, diffs: Diff[];
    if (
      typeof a == 'string' &&
      typeof opt_b == 'string' &&
      typeof opt_c == 'undefined'
    ) {
      // Method 1: text1, text2
      // Compute diffs from text1 and text2.
      text1 = /** @type {string} */ a;
      diffs = this.diff_main(text1, /** @type {string} */ opt_b, true);
      if (diffs.length > 2) {
        this.diff_cleanupSemantic(diffs);
        this.diff_cleanupEfficiency(diffs);
      }
    } else if (
      a &&
      typeof a == 'object' &&
      typeof opt_b == 'undefined' &&
      typeof opt_c == 'undefined'
    ) {
      // Method 2: diffs
      // Compute text1 from diffs.
      diffs = /** @type {!Array.<!diff_match_patch.Diff>} */ a;
      text1 = this.diff_text1(diffs);
    } else if (
      typeof a == 'string' &&
      opt_b &&
      typeof opt_b == 'object' &&
      typeof opt_c == 'undefined'
    ) {
      // Method 3: text1, diffs
      text1 = /** @type {string} */ a;
      diffs = /** @type {!Array.<!diff_match_patch.Diff>} */ opt_b;
    } else if (
      typeof a == 'string' &&
      typeof opt_b == 'string' &&
      opt_c &&
      typeof opt_c == 'object'
    ) {
      // Method 4: text1, text2, diffs
      // text2 is not used.
      text1 = /** @type {string} */ a;
      diffs = /** @type {!Array.<!diff_match_patch.Diff>} */ opt_c;
    } else {
      throw new Error('Unknown call format to patch_make.');
    }

    if (diffs.length === 0) {
      return []; // Get rid of the null case.
    }
    const patches = [];
    let patch = new Patch();
    let patchDiffLength = 0; // Keeping our own length const is faster in JS.
    let char_count1 = 0; // Number of characters into the text1 string.
    let char_count2 = 0; // Number of characters into the text2 string.
    // Start with text1 (prepatch_text) and apply the diffs until we arrive at
    // text2 (postpatch_text).  We recreate the patches one by one to determine
    // context info.
    let prepatch_text = text1;
    let postpatch_text = text1;
    for (let x = 0; x < diffs.length; x++) {
      const diff_type = diffs[x][0];
      const diff_text = diffs[x][1];

      if (!patchDiffLength && diff_type !== DIFF_EQUAL) {
        // A new patch starts here.
        patch.start1 = char_count1;
        patch.start2 = char_count2;
      }

      switch (diff_type) {
        case DIFF_INSERT:
          patch.diffs[patchDiffLength++] = diffs[x];
          patch.length2 += diff_text.length;
          postpatch_text =
            postpatch_text.substring(0, char_count2) +
            diff_text +
            postpatch_text.substring(char_count2);
          break;
        case DIFF_DELETE:
          patch.length1 += diff_text.length;
          patch.diffs[patchDiffLength++] = diffs[x];
          postpatch_text =
            postpatch_text.substring(0, char_count2) +
            postpatch_text.substring(char_count2 + diff_text.length);
          break;
        case DIFF_EQUAL:
          if (
            diff_text.length <= 2 * this.Patch_Margin &&
            patchDiffLength &&
            diffs.length != x + 1
          ) {
            // Small equality inside a patch.
            patch.diffs[patchDiffLength++] = diffs[x];
            patch.length1 += diff_text.length;
            patch.length2 += diff_text.length;
          } else if (diff_text.length >= 2 * this.Patch_Margin) {
            // Time for a new patch.
            if (patchDiffLength) {
              this.patch_addContext_(patch, prepatch_text);
              patches.push(patch);
              patch = new Patch();
              patchDiffLength = 0;
              // Unlike Unidiff, our patch lists have a rolling context.
              // https://github.com/google/diff-match-patch/wiki/Unidiff
              // Update prepatch text & pos to reflect the application of the
              // just completed patch.
              prepatch_text = postpatch_text;
              char_count1 = char_count2;
            }
          }
          break;
      }

      // Update the current character count.
      if (diff_type !== DIFF_INSERT) {
        char_count1 += diff_text.length;
      }
      if (diff_type !== DIFF_DELETE) {
        char_count2 += diff_text.length;
      }
    }
    // Pick up the leftover patch if not empty.
    if (patchDiffLength) {
      this.patch_addContext_(patch, prepatch_text);
      patches.push(patch);
    }

    return patches;
  }

  /**
   * Given an array of patches, return another array that is identical.
   * @param {!Array.<!diff_match_patch.patch_obj>} patches Array of Patch objects.
   * @return {!Array.<!diff_match_patch.patch_obj>} Array of Patch objects.
   */
  patch_deepCopy(patches: Patch[]): Patch[] {
    // Making deep copies is hard in JavaScript.
    const patchesCopy = [];
    for (let x = 0; x < patches.length; x++) {
      const patch = patches[x];
      const patchCopy = new Patch();
      patchCopy.diffs = [];
      for (let y = 0; y < patch.diffs.length; y++) {
        patchCopy.diffs[y] = [patch.diffs[y][0], patch.diffs[y][1]];
      }
      patchCopy.start1 = patch.start1;
      patchCopy.start2 = patch.start2;
      patchCopy.length1 = patch.length1;
      patchCopy.length2 = patch.length2;
      patchesCopy[x] = patchCopy;
    }
    return patchesCopy;
  }

  /**
   * Merge a set of patches onto the text.  Return a patched text, as well
   * as a list of true/false values indicating which patches were applied.
   * @param {!Array.<!diff_match_patch.patch_obj>} patches Array of Patch objects.
   * @param {string} text Old text.
   * @return {!Array.<string|!Array.<boolean>>} Two element Array, containing the
   *      new text and an array of boolean values.
   */
  patch_apply(patches: Patch[], text: string): [string, boolean[]] {
    if (patches.length == 0) {
      return [text, []];
    }

    // Deep copy the patches so that no changes are made to originals.
    patches = this.patch_deepCopy(patches);

    const nullPadding = this.patch_addPadding(patches);
    text = nullPadding + text + nullPadding;

    this.patch_splitMax(patches);
    // delta keeps track of the offset between the expected and actual location
    // of the previous patch.  If there are patches expected at positions 10 and
    // 20, but the first patch was found at 12, delta is 2 and the second patch
    // has an effective expected position of 22.
    let delta = 0;
    const results = [];
    for (let x = 0; x < patches.length; x++) {
      const expected_loc = patches[x].start2 || 0 + delta;
      const text1 = this.diff_text1(patches[x].diffs);
      let start_loc: number;
      let end_loc = -1;
      if (text1.length > this.Match_MaxBits) {
        // patch_splitMax will only provide an oversized pattern in the case of
        // a monster delete.
        start_loc = this.match_main(
          text,
          text1.substring(0, this.Match_MaxBits),
          expected_loc
        );
        if (start_loc != -1) {
          end_loc = this.match_main(
            text,
            text1.substring(text1.length - this.Match_MaxBits),
            expected_loc + text1.length - this.Match_MaxBits
          );
          if (end_loc == -1 || start_loc >= end_loc) {
            // Can't find valid trailing context.  Drop this patch.
            start_loc = -1;
          }
        }
      } else {
        start_loc = this.match_main(text, text1, expected_loc);
      }
      if (start_loc == -1) {
        // No match found.  :(
        results[x] = false;
        // Subtract the delta for this failed patch from subsequent patches.
        delta -= patches[x].length2 - patches[x].length1;
      } else {
        // Found a match.  :)
        results[x] = true;
        delta = start_loc - expected_loc;
        let text2: string;
        if (end_loc == -1) {
          text2 = text.substring(start_loc, start_loc + text1.length);
        } else {
          text2 = text.substring(start_loc, end_loc + this.Match_MaxBits);
        }
        if (text1 == text2) {
          // Perfect match, just shove the replacement text in.
          text =
            text.substring(0, start_loc) +
            this.diff_text2(patches[x].diffs) +
            text.substring(start_loc + text1.length);
        } else {
          // Imperfect match.  Run a diff to get a framework of equivalent
          // indices.
          const diffs = this.diff_main(text1, text2, false);
          if (
            text1.length > this.Match_MaxBits &&
            this.diff_levenshtein(diffs) / text1.length >
              this.Patch_DeleteThreshold
          ) {
            // The end points match, but the content is unacceptably bad.
            results[x] = false;
          } else {
            this.diff_cleanupSemanticLossless(diffs);
            let index1 = 0;
            let index2: number;
            for (let y = 0; y < patches[x].diffs.length; y++) {
              const mod = patches[x].diffs[y];
              if (mod[0] !== DIFF_EQUAL) {
                index2 = this.diff_xIndex(diffs, index1);
              }
              if (mod[0] === DIFF_INSERT) {
                // Insertion
                text =
                  text.substring(0, start_loc + index2!) +
                  mod[1] +
                  text.substring(start_loc + index2!);
              } else if (mod[0] === DIFF_DELETE) {
                // Deletion
                text =
                  text.substring(0, start_loc + index2!) +
                  text.substring(
                    start_loc + this.diff_xIndex(diffs, index1 + mod[1].length)
                  );
              }
              if (mod[0] !== DIFF_DELETE) {
                index1 += mod[1].length;
              }
            }
          }
        }
      }
    }
    // Strip the padding off.
    text = text.substring(nullPadding.length, text.length - nullPadding.length);
    return [text, results];
  }

  /**
   * Add some padding on text start and end so that edges can match something.
   * Intended to be called only from within patch_apply.
   * @param {!Array.<!diff_match_patch.patch_obj>} patches Array of Patch objects.
   * @return {string} The padding string added to each side.
   */
  patch_addPadding(patches: Patch[]): string {
    let paddingLength = this.Patch_Margin;
    let nullPadding = '';
    for (let x = 1; x <= paddingLength; x++) {
      nullPadding += String.fromCharCode(x);
    }

    // Bump all the patches forward.
    for (let x = 0; x < patches.length; x++) {
      patches[x].start1 = patches[x].start1 || 0 + paddingLength;
      patches[x].start2 = patches[x].start2 || 0 + paddingLength;
    }

    // Add some padding on start of first diff.
    let patch = patches[0];
    let diffs = patch.diffs;
    if (diffs.length == 0 || diffs[0][0] != DIFF_EQUAL) {
      // Add nullPadding equality.
      diffs.unshift([DIFF_EQUAL, nullPadding]);
      patch.start1! -= paddingLength; // Should be 0.
      patch.start2! -= paddingLength; // Should be 0.
      patch.length1 += paddingLength;
      patch.length2 += paddingLength;
    } else if (paddingLength > diffs[0][1].length) {
      // Grow first equality.
      const extraLength = paddingLength - diffs[0][1].length;
      diffs[0][1] = nullPadding.substring(diffs[0][1].length) + diffs[0][1];
      patch.start1! -= extraLength;
      patch.start2! -= extraLength;
      patch.length1 += extraLength;
      patch.length2 += extraLength;
    }

    // Add some padding on end of last diff.
    patch = patches[patches.length - 1];
    diffs = patch.diffs;
    if (diffs.length == 0 || diffs[diffs.length - 1][0] != DIFF_EQUAL) {
      // Add nullPadding equality.
      diffs.push([DIFF_EQUAL, nullPadding]);
      patch.length1 += paddingLength;
      patch.length2 += paddingLength;
    } else if (paddingLength > diffs[diffs.length - 1][1].length) {
      // Grow last equality.
      const extraLength = paddingLength - diffs[diffs.length - 1][1].length;
      diffs[diffs.length - 1][1] += nullPadding.substring(0, extraLength);
      patch.length1 += extraLength;
      patch.length2 += extraLength;
    }

    return nullPadding;
  }

  /**
   * Look through the patches and break up any which are longer than the maximum
   * limit of the match algorithm.
   * Intended to be called only from within patch_apply.
   * @param {!Array.<!diff_match_patch.patch_obj>} patches Array of Patch objects.
   */
  patch_splitMax(patches: Patch[]): void {
    const patch_size = this.Match_MaxBits;
    for (let x = 0; x < patches.length; x++) {
      if (patches[x].length1 <= patch_size) {
        continue;
      }
      const bigpatch = patches[x];
      // Remove the big old patch.
      patches.splice(x--, 1);
      let start1 = bigpatch.start1 || 0;
      let start2 = bigpatch.start2 || 0;
      let precontext: string = '';
      while (bigpatch.diffs.length !== 0) {
        // Create one of several smaller patches.
        const patch = new Patch();
        let empty = true;
        patch.start1 = start1 - precontext.length;
        patch.start2 = start2 - precontext.length;
        if (precontext !== '') {
          patch.length1 = patch.length2 = precontext.length;
          patch.diffs.push([DIFF_EQUAL, precontext]);
        }
        while (
          bigpatch.diffs.length !== 0 &&
          patch.length1 < patch_size - this.Patch_Margin
        ) {
          const diff_type = bigpatch.diffs[0][0];
          let diff_text = bigpatch.diffs[0][1];
          if (diff_type === DIFF_INSERT) {
            // Insertions are harmless.
            patch.length2 += diff_text.length;
            start2 += diff_text.length;
            patch.diffs.push(bigpatch!.diffs!.shift()!);
            empty = false;
          } else if (
            diff_type === DIFF_DELETE &&
            patch.diffs.length == 1 &&
            patch.diffs[0][0] == DIFF_EQUAL &&
            diff_text.length > 2 * patch_size
          ) {
            // This is a large deletion.  Let it pass in one chunk.
            patch.length1 += diff_text.length;
            start1 += diff_text.length;
            empty = false;
            patch.diffs.push([diff_type, diff_text]);
            bigpatch.diffs.shift();
          } else {
            // Deletion or equality.  Only take as much as we can stomach.
            diff_text = diff_text.substring(
              0,
              patch_size - patch.length1 - this.Patch_Margin
            );
            patch.length1 += diff_text.length;
            start1 += diff_text.length;
            if (diff_type === DIFF_EQUAL) {
              patch.length2 += diff_text.length;
              start2 += diff_text.length;
            } else {
              empty = false;
            }
            patch.diffs.push([diff_type, diff_text]);
            if (diff_text == bigpatch.diffs[0][1]) {
              bigpatch.diffs.shift();
            } else {
              bigpatch.diffs[0][1] = bigpatch.diffs[0][1].substring(
                diff_text.length
              );
            }
          }
        }
        // Compute the head context for the next patch.
        precontext = this.diff_text2(patch.diffs);
        precontext = precontext.substring(
          precontext.length - this.Patch_Margin
        );
        // Append the end context for this patch.
        const postcontext = this.diff_text1(bigpatch.diffs).substring(
          0,
          this.Patch_Margin
        );
        if (postcontext !== '') {
          patch.length1 += postcontext.length;
          patch.length2 += postcontext.length;
          if (
            patch.diffs.length !== 0 &&
            patch.diffs[patch.diffs.length - 1][0] === DIFF_EQUAL
          ) {
            patch.diffs[patch.diffs.length - 1][1] += postcontext;
          } else {
            patch.diffs.push([DIFF_EQUAL, postcontext]);
          }
        }
        if (!empty) {
          patches.splice(++x, 0, patch);
        }
      }
    }
  }

  /**
   * Take a list of patches and return a textual representation.
   * @param {!Array.<!diff_match_patch.patch_obj>} patches Array of Patch objects.
   * @return {string} Text representation of patches.
   */
  patch_toText(patches: Patch[]): string {
    const text = [];
    for (let x = 0; x < patches.length; x++) {
      text[x] = patches[x];
    }
    return text.join('');
  }

  /**
   * Parse a textual representation of patches and return a list of Patch objects.
   * @param {string} textline Text representation of patches.
   * @return {!Array.<!diff_match_patch.patch_obj>} Array of Patch objects.
   * @throws {!Error} If invalid input.
   */
  patch_fromText(textline: string): Patch[] {
    const patches: Patch[] = [];
    if (!textline) {
      return patches;
    }
    const text = textline.split('\n');
    let textPointer = 0;
    const patchHeader = /^@@ -(\d+),?(\d*) \+(\d+),?(\d*) @@$/;
    while (textPointer < text.length) {
      const m = text[textPointer].match(patchHeader);
      if (!m) {
        throw new Error('Invalid patch string: ' + text[textPointer]);
      }
      const patch = new Patch();
      patches.push(patch);
      patch.start1 = parseInt(m[1], 10);
      if (m[2] === '') {
        patch.start1--;
        patch.length1 = 1;
      } else if (m[2] == '0') {
        patch.length1 = 0;
      } else {
        patch.start1--;
        patch.length1 = parseInt(m[2], 10);
      }

      patch.start2 = parseInt(m[3], 10);
      if (m[4] === '') {
        patch.start2--;
        patch.length2 = 1;
      } else if (m[4] == '0') {
        patch.length2 = 0;
      } else {
        patch.start2--;
        patch.length2 = parseInt(m[4], 10);
      }
      textPointer++;

      while (textPointer < text.length) {
        const sign = text[textPointer].charAt(0);
        const line = decodeURI(text[textPointer].substring(1));
        if (sign == '-') {
          // Deletion.
          patch.diffs.push([DIFF_DELETE, line]);
        } else if (sign == '+') {
          // Insertion.
          patch.diffs.push([DIFF_INSERT, line]);
        } else if (sign == ' ') {
          // Minor equality.
          patch.diffs.push([DIFF_EQUAL, line]);
        } else if (sign == '@') {
          // Start of next patch.
          break;
        } else if (sign === '') {
          // Blank line?  Whatever.
        } else {
          // WTF?
          throw new Error('Invalid patch mode "' + sign + '" in: ' + line);
        }
        textPointer++;
      }
    }
    return patches;
  }
}

/**
 * Class representing one patch operation.
 * @constructor
 */
export class Patch {
  diffs: Diff[];
  start1: number | null = null;
  start2: number | null = null;
  length1: number = 0;
  length2: number = 0;

  constructor() {
    this.diffs = [];
  }

  /**
   * Emulate GNU diff's format.
   * Header: @@ -382,8 +481,9 @@
   * Indices are printed as 1-based, not 0-based.
   * @return {string} The GNU diff string.
   */
  toString(): string {
    let coords1: string | number, coords2: string | number;
    if (this.length1 === 0) {
      coords1 = this.start1 + ',0';
    } else if (this.length1 == 1) {
      coords1 = this.start1! + 1;
    } else {
      coords1 = this.start1! + 1 + ',' + this.length1;
    }
    if (this.length2 === 0) {
      coords2 = this.start2 + ',0';
    } else if (this.length2 == 1) {
      coords2 = this.start2! + 1;
    } else {
      coords2 = this.start2! + 1 + ',' + this.length2;
    }
    const text = ['@@ -' + coords1 + ' +' + coords2 + ' @@\n'];
    let op;
    // Escape the body of the patch with %xx notation.
    for (let x = 0; x < this.diffs.length; x++) {
      switch (this.diffs[x][0]) {
        case DIFF_INSERT:
          op = '+';
          break;
        case DIFF_DELETE:
          op = '-';
          break;
        case DIFF_EQUAL:
          op = ' ';
          break;
      }
      text[x + 1] = op + encodeURI(this.diffs[x][1]) + '\n';
    }
    return text.join('').replace(/%20/g, ' ');
  }
}