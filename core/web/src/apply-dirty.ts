// Brings the elements of the nodes a batch touched in line with their props, once the batch is in

import {
  dlog,
  fabricProps,
  isDebug,
  isSymbioteNode,
} from '@symbiote-native/engine';
import { RETAINED_KIND } from '@symbiote-native/engine/retained-visitor';
import { isHtmlElement, isImageElement, isTextField } from './dom-guards';
import type { IDomNode } from './dom-node';
import { domSpecOf } from './dom-spec';
import { applySpec } from './element-props';
import { initialValueOf } from './input-rules';
import { addDependents, derivedBitsOf } from './node-bits';
import { initialOffsetOf } from './scroll-rules';
import type { INodeWatching } from './node-watching';
import type { IDomSpec } from './spec-types';
import { effectiveViewName } from './text-context';

// The payload bag is built by the engine for its own nodes, a handle of any other kind has none
// The bit of an owned press listener is added, as the C++ rules read it off the node too
function bagOf(node: IDomNode): Readonly<Record<string, unknown>> {
  const bag = isSymbioteNode(node.handle)
    ? fabricProps(node.handle, node.props)
    : {};
  return { ...bag, ...derivedBitsOf(node) };
}

const sourceOf = (spec: IDomSpec | undefined): string | undefined =>
  spec?.attributes.src ?? spec?.attributes.srcset;

// What an element starts with and is never rewritten to by a later prop: a field's value, which
// `setTextAndSelection` owns afterwards, and the offset of a scroller, which the user moves
function seedElement(
  element: HTMLElement,
  bag: Readonly<Record<string, unknown>>,
): void {
  const initial = initialValueOf(bag);
  if (initial !== undefined && isTextField(element)) element.value = initial;
  const offset = initialOffsetOf(bag);
  if (offset === undefined) return;
  element.scrollLeft = offset.x;
  element.scrollTop = offset.y;
}

export function applyDirty(
  dirty: Set<IDomNode>,
  watching: INodeWatching,
  onLoadStart?: (handle: object) => void,
): void {
  watching.settle(dirty);
  addDependents(dirty);
  for (const node of dirty) {
    if (node.kind !== RETAINED_KIND.element || !isHtmlElement(node.dom))
      continue;
    const bag = bagOf(node);
    // Built only under the switch, as this runs for every node of a batch
    const onSkipped = isDebug()
      ? (key: string): void => dlog(() => `web: no DOM form for prop "${key}"`)
      : undefined;
    const spec = domSpecOf(
      effectiveViewName(node),
      bag,
      onSkipped,
      node.tagName,
    );
    const isFirst = node.applied === undefined;
    // A page has no event for it, so a new source on an image is where a load begins
    const source = sourceOf(spec);
    const isNewSource =
      isImageElement(node.dom) &&
      source !== undefined &&
      source !== sourceOf(node.applied);
    applySpec(node.dom, node.applied, spec);
    node.applied = spec;
    if (isNewSource) onLoadStart?.(node.handle);
    if (isFirst) seedElement(node.dom, bag);
    watching.sync(node, bag);
  }
  dirty.clear();
}
