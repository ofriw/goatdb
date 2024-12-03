import { dfs, ElementNode, isTextNode } from './tree.ts';

export function treeToMarkdown(root: ElementNode | undefined): string {
  if (!root) {
    return '';
  }
  let result = '';
  let prevDepth = 1;
  for (const [node, depth] of dfs(root)) {
    if (depth !== prevDepth) {
      result += '\n';
      prevDepth = depth;
    }
    switch (node.tagName) {
      case 'h1':
        result += '# ';
        break;

      case 'h2':
        result += '## ';
        break;

      case 'li':
        result += '* ';
        break;

      case 'ref':
        result += '- ';
        break;

      default:
        break;
    }
    if (isTextNode(node)) {
      result += node.text;
    }
  }
  return result;
}
