// A node of the logical tree the DOM host keeps beside the document. The tree answers the engine's
// reads, and `dom` is what the node stands for on the page

import type { IRetainedKind } from '@symbiote-native/engine/retained-visitor';
import type { IDomSpec } from './dom-spec';

export type IDomNode = {
  readonly handle: object;
  // An anchor stands for its children and a void for nothing, so neither has a `dom`
  readonly kind: IRetainedKind;
  viewName: string;
  // The intrinsic tag of a node a host behavior attached to, empty for every other node
  tagName: string;
  props: Record<string, unknown>;
  ownedListeners: Record<string, boolean>;
  underlayShown: boolean;
  parent: IDomNode | undefined;
  children: IDomNode[];
  dom: Node | undefined;
  // Whether a text sits above this node with no plain view between, see `text-context`
  textContext: boolean;
  // What the element was last brought to, so the next write is only the difference
  applied: IDomSpec | undefined;
  // The element the layout watcher holds for this node, if any
  watched: HTMLElement | undefined;
  // Set when the node first lands under a committed surface, never cleared by a removal
  committedRootTag: number | undefined;
};

export function createDomNode(
  handle: object,
  kind: IRetainedKind,
  viewName: string,
  dom: Node | undefined,
): IDomNode {
  return {
    handle,
    kind,
    viewName,
    tagName: '',
    props: {},
    ownedListeners: {},
    underlayShown: false,
    parent: undefined,
    children: [],
    dom,
    textContext: false,
    applied: undefined,
    watched: undefined,
    committedRootTag: undefined,
  };
}
