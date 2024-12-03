import { uniqueId } from '../../base/common.ts';
import {
  FlatRepAtom,
  isDepthMarker,
  isElementSpacer,
  kElementSpacer,
} from './flat-rep.ts';
import { OrderedListNode } from './model.ts';
import { isElementNode, isTextNode } from './tree.ts';

type ReplacerFunction = (
  buffer: readonly FlatRepAtom[],
) => FlatRepAtom[] | undefined;

const ShortcutsByLength: Record<number, ReplacerFunction[]> = {
  5: [replaceH1, replaceUL, replaceTask],
  6: [replaceH2, replaceOL],
  // 7: [replaceH3],
  // 8: [replaceH4],
  // 9: [replaceH5],
  // 10: [replaceH6],
};

function replaceH1(buffer: readonly FlatRepAtom[]): FlatRepAtom[] | undefined {
  if (
    isElementSpacer(buffer[0]) &&
    isElementNode(buffer[1]) &&
    isDepthMarker(buffer[2]) &&
    isTextNode(buffer[3]) &&
    buffer[3].text === '#' &&
    isTextNode(buffer[4]) &&
    buffer[4].text === ' '
  ) {
    return [
      buffer[0],
      {
        children: [],
        tagName: 'h1',
      },
      buffer[2],
      {
        text: '',
      },
    ];
  }
}

function replaceH2(buffer: readonly FlatRepAtom[]): FlatRepAtom[] | undefined {
  if (
    isElementSpacer(buffer[0]) &&
    isElementNode(buffer[1]) &&
    isDepthMarker(buffer[2]) &&
    isTextNode(buffer[3]) &&
    buffer[3].text === '#' &&
    isTextNode(buffer[4]) &&
    buffer[4].text === '#' &&
    isTextNode(buffer[5]) &&
    buffer[5].text === ' '
  ) {
    return [
      buffer[0],
      {
        children: [],
        tagName: 'h2',
      },
      buffer[2],
      {
        text: '',
      },
    ];
  }
}

function replaceH3(buffer: readonly FlatRepAtom[]): FlatRepAtom[] | undefined {
  if (
    isElementSpacer(buffer[0]) &&
    isElementNode(buffer[1]) &&
    isDepthMarker(buffer[2]) &&
    isTextNode(buffer[3]) &&
    buffer[3].text === '#' &&
    isTextNode(buffer[4]) &&
    buffer[4].text === '#' &&
    isTextNode(buffer[5]) &&
    buffer[5].text === '#' &&
    isTextNode(buffer[6]) &&
    buffer[6].text === ' '
  ) {
    return [
      buffer[0],
      {
        children: [],
        tagName: 'h3',
      },
      buffer[2],
      {
        text: '',
      },
    ];
  }
}

function replaceH4(buffer: readonly FlatRepAtom[]): FlatRepAtom[] | undefined {
  if (
    isElementSpacer(buffer[0]) &&
    isElementNode(buffer[1]) &&
    isDepthMarker(buffer[2]) &&
    isTextNode(buffer[3]) &&
    buffer[3].text === '#' &&
    isTextNode(buffer[4]) &&
    buffer[4].text === '#' &&
    isTextNode(buffer[5]) &&
    buffer[5].text === '#' &&
    isTextNode(buffer[6]) &&
    buffer[6].text === '#' &&
    isTextNode(buffer[7]) &&
    buffer[7].text === ' '
  ) {
    return [
      buffer[0],
      {
        children: [],
        tagName: 'h4',
      },
      buffer[2],
      {
        text: '',
      },
    ];
  }
}

function replaceH5(buffer: readonly FlatRepAtom[]): FlatRepAtom[] | undefined {
  if (
    isElementSpacer(buffer[0]) &&
    isElementNode(buffer[1]) &&
    isDepthMarker(buffer[2]) &&
    isTextNode(buffer[3]) &&
    buffer[3].text === '#' &&
    isTextNode(buffer[4]) &&
    buffer[4].text === '#' &&
    isTextNode(buffer[5]) &&
    buffer[5].text === '#' &&
    isTextNode(buffer[6]) &&
    buffer[6].text === '#' &&
    isTextNode(buffer[7]) &&
    buffer[7].text === '#' &&
    isTextNode(buffer[8]) &&
    buffer[8].text === ' '
  ) {
    return [
      buffer[0],
      {
        children: [],
        tagName: 'h5',
      },
      buffer[2],
      {
        text: '',
      },
    ];
  }
}

function replaceH6(buffer: readonly FlatRepAtom[]): FlatRepAtom[] | undefined {
  if (
    isElementSpacer(buffer[0]) &&
    isElementNode(buffer[1]) &&
    isDepthMarker(buffer[2]) &&
    isTextNode(buffer[3]) &&
    buffer[3].text === '#' &&
    isTextNode(buffer[4]) &&
    buffer[4].text === '#' &&
    isTextNode(buffer[5]) &&
    buffer[5].text === '#' &&
    isTextNode(buffer[6]) &&
    buffer[6].text === '#' &&
    isTextNode(buffer[7]) &&
    buffer[7].text === '#' &&
    isTextNode(buffer[8]) &&
    buffer[8].text === '#' &&
    isTextNode(buffer[9]) &&
    buffer[9].text === ' '
  ) {
    return [
      buffer[0],
      {
        children: [],
        tagName: 'h6',
      },
      buffer[2],
      {
        text: '',
      },
    ];
  }
}

function replaceUL(buffer: readonly FlatRepAtom[]): FlatRepAtom[] | undefined {
  if (
    isElementSpacer(buffer[0]) &&
    isElementNode(buffer[1]) &&
    isDepthMarker(buffer[2]) &&
    isTextNode(buffer[3]) &&
    buffer[3].text === '*' &&
    isTextNode(buffer[4]) &&
    buffer[4].text === ' '
  ) {
    return [
      buffer[0],
      {
        children: [],
        tagName: 'ul',
      },
      buffer[2],
      {
        tagName: 'li',
        children: [],
      },
      { depthMarker: buffer[2].depthMarker + 1 },
      {
        text: '',
      },
    ];
  }
}

function replaceOL(buffer: readonly FlatRepAtom[]): FlatRepAtom[] | undefined {
  if (
    isElementSpacer(buffer[0]) &&
    isElementNode(buffer[1]) &&
    isDepthMarker(buffer[2]) &&
    isTextNode(buffer[3]) &&
    buffer[3].text.charCodeAt(0) >= 48 &&
    buffer[3].text.charCodeAt(0) <= 57 &&
    isTextNode(buffer[4]) &&
    buffer[4].text === '.' &&
    isTextNode(buffer[5]) &&
    buffer[5].text === ' '
  ) {
    const ol: OrderedListNode = {
      tagName: 'ol',
      children: [],
    };
    if (buffer[3].text !== '1') {
      ol.start = parseInt(buffer[3].text);
    }
    return [
      buffer[0],
      ol,
      buffer[2],
      {
        tagName: 'li',
        children: [],
      },
      { depthMarker: buffer[2].depthMarker + 1 },
      {
        text: '',
      },
    ];
  }
}

function replaceTask(
  buffer: readonly FlatRepAtom[],
): FlatRepAtom[] | undefined {
  if (
    isElementSpacer(buffer[0]) &&
    isElementNode(buffer[1]) &&
    isDepthMarker(buffer[2]) &&
    isTextNode(buffer[3]) &&
    buffer[3].text === '-' &&
    isTextNode(buffer[4]) &&
    buffer[4].text === ' '
  ) {
    return [
      buffer[0],
      {
        tagName: 'ref',
        type: 'inter-doc',
        ref: uniqueId(),
        children: [],
      },
      buffer[2],
      kElementSpacer,
      {
        tagName: 'p',
        children: [],
      },
      { depthMarker: buffer[2].depthMarker + 1 },
    ];
  }
}

export function* applyShortcuts(
  flatRep: Iterable<FlatRepAtom>,
): Generator<FlatRepAtom> {
  const buffer: FlatRepAtom[] = [];
  const detectionSizes = Object.keys(ShortcutsByLength).map((k) => parseInt(k))
    .sort((a, b) => a - b);
  const minDetectionSize = detectionSizes[0];
  const maxDetectionSize = detectionSizes[detectionSizes.length - 1];
  for (const atom of flatRep) {
    buffer.push(atom);
    const bufferLen = buffer.length;
    if (bufferLen >= minDetectionSize) {
      for (
        let size = Math.min(maxDetectionSize, bufferLen);
        size >= minDetectionSize;
        --size
      ) {
        const offset = buffer.length - size;
        const detectors = ShortcutsByLength[size] || [];
        for (const f of detectors) {
          const replacement = f(buffer.slice(offset));
          if (replacement) {
            for (let i = 0; i < offset; ++i) {
              yield buffer[i];
            }
            for (const atom of replacement) {
              yield atom;
            }
            buffer.splice(0, size + offset);
            break;
          }
        }
      }
    }
    if (buffer.length === maxDetectionSize) {
      yield buffer[0];
      buffer.shift();
    }
  }
  for (const a of buffer) {
    yield a;
  }
}
