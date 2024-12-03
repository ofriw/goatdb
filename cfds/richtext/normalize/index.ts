import { assert } from '../../../base/error.ts';
import { coreValueClone } from '../../../base/core-types/index.ts';
import { flattenRichText, reconstructRichText } from '../flat-rep.ts';
import {
  dfs,
  ElementNode,
  initRichTextRoot,
  isElementNode,
  isNodeSameLocality,
  isTextNode,
  isTrivialTextNode,
  Pointer,
  pointersForNode,
  RichText,
  TextNode,
  TreeNode,
} from '../tree.ts';
import { getRuleActions } from './rules.ts';
import { inlineElementTags } from './setup.ts';

export function normalizeRichText(richText: RichText): RichText {
  // normalizeNodeText(richText, richText.root);
  richText = coreValueClone(richText);
  stripTrivialTextNodes(richText);
  richText = reconstructRichText(
    // stripTrivialTextNodes(
    flattenRichText(richText, true, false)
    // richText.pointers
    // )
  );
  while (runNodeRules(richText.root) > 0) {}

  if (richText.root.children.length === 0) {
    richText.root = initRichTextRoot();
  }

  if (richText.pointers && richText.pointers.size === 0) {
    delete richText.pointers;
  }
  return richText;
}

function hasPointers(
  node: TextNode,
  ptrSet: Set<Pointer> | undefined
): boolean {
  if (!ptrSet) {
    return false;
  }
  for (const _ of pointersForNode(ptrSet, node, true)) {
    return true;
  }
  return false;
}

function stripTrivialTextNodes(rt: RichText): void {
  for (const [node, _depth, path] of dfs(rt.root, true)) {
    if (
      isTrivialTextNode(node) &&
      node.text.length === 0 &&
      !hasPointers(node, rt.pointers)
    ) {
      if (path.length === 0) {
        const idx = rt.root.children.indexOf(node);
        if (idx >= 0) {
          rt.root.children.splice(idx, 1);
        }
        continue;
      }
      const parent = path[path.length - 1];
      if (parent.children.length > 1) {
        const idx = parent.children.indexOf(node);
        assert(idx >= 0);
        parent.children.splice(idx, 1);
      }
    }
  }
}

// const kTextNodesEqOpts = {
//   objectFilterFields: treeAtomKeyFilter,
// };

// function normalizeNodeText(richText: RichText, node: ElementNode) {
//   let i = 0;
//   let toNextChild = true;
//   while (i < node.children.length) {
//     //for (let i = 0; i < node.children.length; i++) {
//     let curChild = node.children[i];
//     toNextChild = true;

//     if (isElementNode(curChild)) {
//       normalizeNodeText(richText, curChild);
//     } else {
//       if (isTextNode(curChild)) {
//         while (i + 1 < node.children.length) {
//           const nextChild = node.children[i + 1]!;

//           const delRes = canDeleteTextNode(curChild, nextChild);
//           if (delRes === 0) {
//             break;
//           }

//           let delIndex: number;
//           let prevLength: number;
//           let nodeToKeep: TextNode;
//           let nodeToDelete: TextNode;

//           if (delRes === -1) {
//             //Merge Left to right
//             delIndex = i;
//             prevLength = 0;
//             nodeToDelete = curChild;
//             nodeToKeep = nextChild as TextNode;

//             nextChild.text = curChild.text + nextChild.text;
//           } else {
//             //Merge right to left
//             delIndex = i + 1;
//             prevLength = curChild.text.length;
//             nodeToDelete = nextChild as TextNode;
//             nodeToKeep = curChild;

//             curChild.text += nextChild.text;
//           }

//           if (richText.pointers) {
//             for (const pointer of pointersForNode(
//               richText.pointers,
//               nodeToDelete,
//               true
//             )) {
//               pointer.node = nodeToKeep;
//               pointer.offset += prevLength;
//             }
//           }

//           node.children.splice(delIndex, 1);

//           if (delRes === -1) {
//             toNextChild = false;
//             break;
//           }
//         }
//       }
//     }

//     if (toNextChild) i++;
//   }
// }

// function canDeleteTextNode(left: TextNode, right: TreeNode): -1 | 0 | 1 {
//   if (!isNodeSameLocality(left, right)) {
//     return 0; //Can't delete because one is local and one is not
//   }

//   if (!isTextNode(right)) {
//     return 0;
//   }

//   const leftEmpty = left.text === '' && isTrivialTextNode(left);
//   const rightEmpty = right.text === '' && isTrivialTextNode(right);

//   if (leftEmpty && !rightEmpty) {
//     return -1;
//   }
//   if (rightEmpty && !leftEmpty) {
//     return 1;
//   }

//   if (coreValueEquals(left, right, equalsOptions)) {
//     return 1;
//   }

//   return 0;
// }

enum ActionResult {
  CONTINUE,
  RETURN_TO_PARENT,
  SAME_CHILD,
}

function runNodeRules(
  parent: ElementNode,
  grandParent?: ElementNode,
  gpIndex?: number
): number {
  let i = parent.children.length - 1;
  let counter = 0;
  let result: ActionResult;

  while (i >= 0 && i < parent.children.length) {
    const child = parent.children[i];
    result = ActionResult.CONTINUE;

    for (const action of getRuleActions(child, parent, grandParent)) {
      switch (action.name) {
        case 'add-parent': {
          //Add parent between current parent and child
          //return to parent
          const newParent: ElementNode = {
            children: [child],
            tagName: action.tag,
          };
          if (child.isLocal !== undefined) newParent.isLocal = child.isLocal;
          parent.children[i] = newParent;

          counter++;
          result = ActionResult.RETURN_TO_PARENT;
          break;
        }

        case 'to-sibling-below': {
          //moves child to be a sibling below
          //return to parent
          if (grandParent !== undefined && gpIndex !== undefined) {
            let toI = gpIndex + 1;
            //Remove from Parent
            parent.children.splice(i, 1);

            //Add to Grandparent
            grandParent.children.splice(toI, 0, child);

            //Will go over children in next run
            counter++;
            result = ActionResult.SAME_CHILD;
          }
          break;
        }

        case 'remove-child': {
          //remove child from parent
          //run child again
          if (isElementNode(child)) {
            parent.children.splice(i, 1, ...child.children);
          } else {
            parent.children.splice(i, 1);
          }

          counter++;
          result = ActionResult.SAME_CHILD;
          break;
        }
        case 'replace-tag': {
          child.tagName = action.newTag;
          break;
        }
        case 'wrap-text': {
          //wrap text around non text nodes
          //return to parent
          if (i === 0 || !isTextNode(parent.children[i - 1])) {
            //No Text From Above
            const tIndex = i > 0 ? i - 1 : 0;
            parent.children.splice(tIndex, 0, { text: '' });
            i++;
            counter++;
            result = ActionResult.RETURN_TO_PARENT;
          }

          if (
            i === parent.children.length - 1 ||
            !isTextNode(parent.children[i + 1])
          ) {
            //No Text From Bottom
            parent.children.splice(i + 1, 0, { text: '' });
            counter++;
            result = ActionResult.RETURN_TO_PARENT;
          }

          break;
        }
        case 'no-empty-element': {
          //delete empty elements
          //return to parent
          if (isElementNode(child) && child.children.length === 0) {
            parent.children.splice(i, 1);

            //counter++;
            result = ActionResult.SAME_CHILD;
          }
          break;
        }
        case 'add-to-element': {
          //add element to parent
          //continue
          if (isElementNode(child)) {
            const newNode = action.func();
            delete newNode.isLocal;
            if (child.isLocal !== undefined) newNode.isLocal = child.isLocal;

            if (action.index !== undefined) {
              child.children.splice(action.index, 0, newNode);
            } else {
              child.children.push(newNode);
            }

            counter++;
          }
          break;
        }
        case 'element-consistent-children': {
          //fix inconsistent issues
          //return to parent
          if (isElementNode(child) && child.children.length >= 2) {
            const fTextOrInline = isTextOrInline(child.children[0]);
            let j = 1;
            for (; j < child.children.length; j++) {
              if (fTextOrInline !== isTextOrInline(child.children[j])) {
                break;
              }
            }
            if (j < child.children.length) {
              //group them in a P
              const newP: ElementNode = {
                tagName: 'p',
                children: child.children.slice(j),
              };

              //move the P to parent
              parent.children.splice(i + 1, 0, newP);

              //Remove from Child
              child.children.splice(j, child.children.length);

              //Will go over children in next run
              counter++;
              result = ActionResult.RETURN_TO_PARENT;
            }
          }
          break;
        }
        case 'empty-local-text': {
          if (
            (i === 0 || i + 1 === parent.children.length) && //First or Last Child
            isTextNode(child) &&
            child.text === '' &&
            child.isLocal === undefined
          ) {
            const brother =
              i === 0 ? parent.children[1] : parent.children[i - 1];

            if (i + 1 === parent.children.length) {
              const firstChild = parent.children[0];
              if (isTextNode(firstChild) && firstChild.text === '') {
                //If both first and last are empty, only update the first to isLocal
                continue;
              }
            }
            if (brother) {
              if (brother.isLocal === undefined) {
                delete child.isLocal;
              } else if (brother.isLocal !== child.isLocal) {
                child.isLocal = brother.isLocal;
              }
            }
          }

          break;
        }
        case 'single-local-text': {
          if (
            parent.children.length === 1 && //Only Child
            isTextNode(child) &&
            child.text === '' &&
            !isNodeSameLocality(parent, child)
          ) {
            if (parent.isLocal === undefined) {
              delete child.isLocal;
            } else {
              child.isLocal = parent.isLocal;
            }
          }

          break;
        }
        default: {
          throw new Error(
            `Rule action: ${(action as any).name} is not defined!`
          );
        }
      }
      if (result !== ActionResult.CONTINUE) {
        break;
      }
    }

    if (result === ActionResult.RETURN_TO_PARENT) {
      break;
    }

    if (result === ActionResult.SAME_CHILD) {
      continue;
    }

    if (isElementNode(child)) {
      counter += runNodeRules(child, parent, i);
    }

    i--;
  }

  return counter;
}

function isTextOrInline(node: TreeNode) {
  if (isElementNode(node)) {
    return (
      typeof node.tagName === 'string' &&
      inlineElementTags.includes(node.tagName)
    );
  }
  return true;
}
