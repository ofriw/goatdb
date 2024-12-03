import { TreeNode } from '../tree.ts';

interface SingleTagCondition {
  tag: string;
}

interface MultipleTagsCondition {
  tags: string[];
}

interface IsDefinedCondition {
  isDefined: boolean;
}

interface IsElementCondition {
  isElement: boolean;
}

interface IsTextCondition {
  isText: boolean;
}

interface IsRefMarkerCondition {
  isRefMarker: boolean;
}

interface HasTagMarkerCondition {
  hasTag: boolean;
}

interface FuncCondition {
  func: (node: TreeNode | undefined) => boolean;
}

export type ConditionSource =
  | 'node'
  | 'parent'
  | 'grandparent'
  | 'first-sibling';

export type NodeCondition =
  | SingleTagCondition
  | MultipleTagsCondition
  | IsElementCondition
  | IsTextCondition
  | IsRefMarkerCondition;

type RuleCondition = { source: ConditionSource } & (
  | SingleTagCondition
  | MultipleTagsCondition
  | IsDefinedCondition
  | HasTagMarkerCondition
  | IsElementCondition
  | FuncCondition
);

export interface ToSiblingAction {
  name: 'to-sibling-below';
}

export interface AddParentAction {
  name: 'add-parent';
  tag: string;
}

export interface RemoveChildAction {
  name: 'remove-child';
}

export interface ReplaceTagAction {
  name: 'replace-tag';
  newTag: string;
}

export interface WrapTextAction {
  name: 'wrap-text';
}

export interface NoEmptyElementAction {
  name: 'no-empty-element';
}

export interface EmptyLocalTextAction {
  name: 'empty-local-text';
}

export interface AddToElementAction {
  name: 'add-to-element';
  func: () => TreeNode;
  index?: number;
}

export interface ElementConsistentChildrenAction {
  name: 'element-consistent-children';
}

export interface SingleLocalTextAction {
  name: 'single-local-text';
}

export type RuleAction =
  | ToSiblingAction
  | AddParentAction
  | RemoveChildAction
  | WrapTextAction
  | NoEmptyElementAction
  | AddToElementAction
  | ElementConsistentChildrenAction
  | EmptyLocalTextAction
  | ReplaceTagAction
  | SingleLocalTextAction;

export interface RuleSetup {
  node: NodeCondition;
  condition?: RuleCondition | RuleCondition[];
  action: RuleAction;
}
