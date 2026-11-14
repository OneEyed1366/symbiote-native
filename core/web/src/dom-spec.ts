// What one node asks of its element, worked out from its view name and its payload bag: reset
// class, inline CSS and attributes. Pure, so the whole mapping is testable without a document

import { attributesFromBag } from './dom-attributes';
import { cssFromBag } from './css-style';
import { CLASS_NAMES } from './reset-sheet';
import type { IDomSpec } from './spec-types';
import { viewRulesOf } from './view-rules';
import { viewFamilyOf } from './view-tags';

export type { IDomSpec };

// `auto` is the element's own behavior, so it has no class
const POINTER_CLASSES: ReadonlyMap<string, string> = new Map([
  ['none', CLASS_NAMES.pointerNone],
  ['box-none', CLASS_NAMES.pointerBoxNone],
  ['box-only', CLASS_NAMES.pointerBoxOnly],
]);

// `tagName` is the intrinsic tag a host behavior attached, empty for a node without one
export function domSpecOf(
  viewName: string,
  bag: Readonly<Record<string, unknown>>,
  onSkipped?: (key: string) => void,
  tagName = '',
): IDomSpec {
  const { pointerEvents, ...ownBag } = bag;
  const view = viewRulesOf(viewName, tagName, ownBag);
  const classNames = [viewFamilyOf(viewName).className, ...view.classNames];
  const pointerClass = POINTER_CLASSES.get(String(pointerEvents));
  if (pointerClass !== undefined) classNames.push(pointerClass);
  // A style key beats the rule it overlaps, as `userSelect` does `selectable`
  return {
    classNames,
    css: { ...view.css, ...cssFromBag(view.rest, onSkipped) },
    attributes: {
      ...view.attributes,
      ...attributesFromBag(view.rest, onSkipped),
    },
  };
}
