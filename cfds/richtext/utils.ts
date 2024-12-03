import { JSONObject, ReadonlyJSONObject } from '../../base/interfaces.ts';
import {
  JSONCyclicalDecoder,
  JSONCyclicalEncoder,
} from '../../base/core-types/encoding/json.ts';
import { dfs, isTextNode, RichText, TextNode } from './tree.ts';

export function findFirstTextNode(rt: RichText): TextNode | undefined {
  for (const [node] of dfs(rt.root)) {
    if (isTextNode(node)) {
      return node;
    }
  }
}

export function richTextToJS(rt: RichText): JSONObject {
  const jsEncoder = new JSONCyclicalEncoder();
  jsEncoder.set('rt', rt);

  const out = jsEncoder.getOutput() as ReadonlyJSONObject;
  const rtJS = out['rt'] as JSONObject;
  return rtJS;
}

export function jsToRichtext(rtJS: JSONObject): RichText {
  const jsDecoder = JSONCyclicalDecoder.get({ rt: rtJS });
  const out = jsDecoder.get('rt') as RichText;
  jsDecoder.finalize();
  return out;
}
