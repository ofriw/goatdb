import { ElementNode, isElementNode } from '../tree.ts';
import { RuleSetup } from './types.ts';

export const userDefinedRules: RuleSetup[] = [
  {
    node: { tags: ['p', 'h1', 'h2', 'ol', 'ul', 'li'] },
    condition: { source: 'parent', tags: ['table', 'tr'] },
    action: {
      name: 'to-sibling-below',
    },
  },
  {
    node: { tag: 'p' },
    condition: { source: 'parent', tag: 'li' },
    action: {
      name: 'remove-child',
    },
  },
  {
    node: { tags: ['p', 'h1', 'h2', 'ol', 'ul'] },
    condition: { source: 'parent', tag: 'p' },
    action: {
      name: 'to-sibling-below',
    },
  },
  {
    node: { tag: 'li' },
    condition: {
      source: 'parent',
      tags: ['p', 'h1', 'h2', 'td'],
      hasTag: false,
    },
    action: {
      name: 'add-parent',
      tag: 'ul',
    },
  },
  {
    node: { tag: 'li' },
    condition: { source: 'parent', tag: 'li' },
    action: {
      name: 'to-sibling-below',
    },
  },
  {
    node: { tag: 'table' },
    condition: { source: 'parent', tags: ['table', 'tr'] },
    action: {
      name: 'remove-child',
    },
  },
  {
    node: { tag: 'tr' },
    condition: { source: 'parent', tags: ['p', 'h1', 'h2', 'ul', 'ol', 'li'] },
    action: {
      name: 'add-parent',
      tag: 'table',
    },
  },
  {
    node: { tag: 'tr' },
    condition: { source: 'parent', tags: ['tr', 'td'] },
    action: {
      name: 'to-sibling-below',
    },
  },
  {
    node: { tag: 'td' },
    condition: {
      source: 'parent',
      tags: ['p', 'h1', 'h2', 'ul', 'ol', 'li', 'table'],
    },
    action: {
      name: 'add-parent',
      tag: 'tr',
    },
  },
  {
    node: { tag: 'td' },
    condition: { source: 'parent', tag: 'td' },
    action: {
      name: 'to-sibling-below',
    },
  },
  {
    node: { isRefMarker: true, tag: 'inline-task' },
    condition: { source: 'grandparent', isDefined: true },
    action: {
      name: 'to-sibling-below',
    },
  },
  {
    node: { isText: true },
    condition: { source: 'parent', tags: ['table', 'tr'] },
    action: {
      name: 'add-parent',
      tag: 'td',
    },
  },
  {
    node: { tags: ['object', 'img'] },
    condition: { source: 'parent', tags: ['table', 'tr'] },
    action: {
      name: 'add-parent',
      tag: 'td',
    },
  },
  {
    node: { isText: true, tags: ['object', 'img'] },
    condition: { source: 'grandparent', isDefined: false },
    action: {
      name: 'add-parent',
      tag: 'p',
    },
  },
  {
    node: { tags: ['object', 'img'] },
    action: {
      name: 'wrap-text',
    },
  },
  {
    node: { isElement: true },
    action: {
      name: 'no-empty-element',
    },
  },
  {
    node: { tags: ['ref', 'inline-task'] },
    condition: {
      source: 'node',
      func: (n) => {
        //first child of ref must be a text node
        const firstChild = (n as ElementNode).children[0];
        return firstChild && isElementNode(firstChild);
      },
    },
    action: {
      name: 'add-to-element',
      func: () => {
        return { text: '' };
      },
      index: 0,
    },
  },
  {
    node: { isElement: true },
    action: {
      name: 'element-consistent-children',
    },
  },
  {
    node: { isText: true },
    action: {
      name: 'empty-local-text',
    },
  },
  {
    node: { isText: true },
    action: {
      name: 'single-local-text',
    },
  },
  {
    node: { tag: 'p' },
    condition: { source: 'parent', tags: ['ul', 'ol'] },
    action: {
      name: 'replace-tag',
      newTag: 'li',
    },
  },
  {
    node: { isText: true },
    condition: { source: 'parent', tags: ['ul', 'ol'] },
    action: {
      name: 'add-parent',
      tag: 'li',
    },
  },
];

export const inlineElementTags = ['mention'];
