import { isRefMarker } from '../model.ts';
import { ElementNode, isElementNode, isTextNode, TreeNode } from '../tree.ts';
import { userDefinedRules } from './setup.ts';
import { ConditionSource, RuleAction } from './types.ts';
import * as SetUtils from '../../../base/set.ts';

interface SingleRuleCondition {
  source: ConditionSource;
  tags?: Set<string>;
  isDefined?: boolean;
  hasTag?: boolean;
  isElement?: boolean;
  func?: (node: TreeNode | undefined) => boolean;
}

export interface Rule {
  condition?: SingleRuleCondition;
  action: RuleAction;
}

const rules: { [key: string]: Rule[] } = {};
const tagsCache: { [key: string]: string[] } = {};

const ELEMENT_KEY = 'elem';
const NOT_ELEMENT_KEY = 'n_elem';
const TEXT_KEY = 'txt';
const NOT_TEXT_KEY = 'n_txt';
const REF_MARKER_KEY = 'rm';
const NOT_REF_MARKER_KEY = 'n_rm';

const ELEMENT_KEYS = [ELEMENT_KEY, NOT_TEXT_KEY, NOT_REF_MARKER_KEY];
const TEXT_KEYS = [TEXT_KEY, NOT_ELEMENT_KEY, NOT_REF_MARKER_KEY];
const REF_MARKER_KEYS = [REF_MARKER_KEY, NOT_ELEMENT_KEY, NOT_TEXT_KEY];
const NON_KEYS = [NOT_TEXT_KEY, NOT_ELEMENT_KEY, NOT_REF_MARKER_KEY];

function getKeysForNode(node: TreeNode) {
  if (typeof node.tagName === 'string') {
    if (tagsCache[node.tagName] !== undefined) return tagsCache[node.tagName];

    let tags: string[] = [];
    if (isElementNode(node)) {
      tags.push(...ELEMENT_KEYS);
    } else if (isTextNode(node)) {
      tags.push(...TEXT_KEYS);
    } else if (isRefMarker(node)) {
      tags.push(...REF_MARKER_KEYS);
    } else {
      tags.push(...NON_KEYS);
    }

    tags.push('t_' + node.tagName);

    tagsCache[node.tagName] = tags;
    return tags;
  }

  if (isElementNode(node)) {
    return ELEMENT_KEYS;
  } else if (isTextNode(node)) {
    return TEXT_KEYS;
  } else if (isRefMarker(node)) {
    return REF_MARKER_KEYS;
  }

  return NON_KEYS;
}

export function* getRuleActions(
  node: TreeNode,
  parent: ElementNode,
  grandParent?: ElementNode
): Generator<RuleAction, void, void> {
  for (const key of getKeysForNode(node)) {
    if (rules[key] !== undefined) {
      for (const rule of rules[key]) {
        if (rule.condition === undefined) {
          yield rule.action;
          continue;
        }

        switch (rule.condition.source) {
          case 'node':
            if (checkCondition(rule.condition, node)) {
              yield rule.action;
            }
            break;
          case 'parent':
            if (checkCondition(rule.condition, parent)) {
              yield rule.action;
            }
            break;
          case 'grandparent':
            if (checkCondition(rule.condition, grandParent)) {
              yield rule.action;
            }
            break;
          case 'first-sibling':
            if (node !== parent.children[0]) {
              if (checkCondition(rule.condition, parent.children[0])) {
                yield rule.action;
              }
            }
            break;
        }
      }
    }
  }
}

function checkCondition(
  condition: SingleRuleCondition,
  node: TreeNode | undefined
) {
  const nodeTagName =
    node !== undefined && typeof node.tagName === 'string'
      ? node.tagName
      : undefined;

  if (condition.tags !== undefined && nodeTagName !== undefined) {
    if (condition.tags.has(nodeTagName)) {
      return true;
    }
  }

  if (condition.isElement !== undefined && node !== undefined) {
    const nodeIsElement = isElementNode(node);
    if (condition.isElement && nodeIsElement) {
      return true;
    }
    if (!condition.isElement && !nodeIsElement) {
      return true;
    }
  }

  if (condition.isDefined !== undefined) {
    if (condition.isDefined && node !== undefined) {
      return true;
    }
    if (!condition.isDefined && node === undefined) {
      return true;
    }
  }
  if (condition.hasTag !== undefined) {
    if (condition.hasTag && nodeTagName !== undefined) {
      return true;
    }
    if (!condition.hasTag && nodeTagName === undefined) {
      return true;
    }
  }
  if (condition.func !== undefined) {
    if (condition.func(node)) {
      return true;
    }
  }
  return false;
}

function convertNodeCondition(node: any): string[] | undefined {
  const keys: string[] = [];
  if (typeof node.tag === 'string') {
    keys.push('t_' + node.tag);
  }
  if (node.tags !== undefined && Array.isArray(node.tags)) {
    keys.push(...(node.tags as string[]).map((t) => 't_' + t));
  }
  if (typeof node.isElement === 'boolean') {
    if (node.isElement) {
      keys.push(ELEMENT_KEY);
    } else {
      keys.push(NOT_ELEMENT_KEY);
    }
  }

  if (typeof node.isText === 'boolean') {
    if (node.isText) {
      keys.push(TEXT_KEY);
    } else {
      keys.push(NOT_TEXT_KEY);
    }
  }

  if (typeof node.isRefMarker === 'boolean') {
    if (node.isRefMarker) {
      keys.push(REF_MARKER_KEY);
    } else {
      keys.push(NOT_REF_MARKER_KEY);
    }
  }
  return keys;
}

function convertRuleCondition(condition: any): SingleRuleCondition | undefined {
  if (condition === undefined) return;
  const converted: SingleRuleCondition = {
    source: condition.source,
  };
  if (typeof condition.tag === 'string') {
    converted.tags = new Set<string>([condition.tag]);
  }
  if (condition.tags !== undefined && Array.isArray(condition.tags)) {
    converted.tags = SetUtils.union(
      converted.tags || new Set<string>(),
      condition.tags
    );
  }
  if (typeof condition.isDefined === 'boolean') {
    converted.isDefined = condition.isDefined;
  }
  if (typeof condition.hasTag === 'boolean') {
    converted.hasTag = condition.hasTag;
  }
  if (typeof condition.isElement === 'boolean') {
    converted.isElement = condition.isElement;
  }
  if (typeof condition.func === 'function') {
    converted.func = condition.func;
  }
  return converted;
}

function convertSetupRules() {
  for (const uRule of userDefinedRules) {
    const keys = convertNodeCondition(uRule.node);
    if (keys === undefined) continue;

    const condition = convertRuleCondition(uRule.condition);

    for (const key of keys) {
      if (rules[key] === undefined) {
        rules[key] = [];
      }
      rules[key].push({
        condition,
        action: uRule.action,
      });
    }
  }
}

convertSetupRules();
