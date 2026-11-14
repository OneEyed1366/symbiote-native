// The DOM implementation of the engine's tree host: each op edits a logical tree and the document
// Reads answer from the logical tree

import type { ICommittedRecord, ITreeHost } from '@symbiote-native/engine';
import { walkOps } from '@symbiote-native/engine/mutation-walk';
import { createTreeReads } from '@symbiote-native/engine/retained-tree';
import {
  createRetainedVisitor,
  RETAINED_KIND,
  type IRetainedCreate,
  type IRetainedEffects,
  type IRetainedStore,
} from '@symbiote-native/engine/retained-visitor';
import { applyDirty } from './apply-dirty';
import { censusOf } from './census';
import { createDomNode, type IDomNode } from './dom-node';
import { createImperative } from './dom-imperative';
import { ownerAt, setOwner } from './element-owner';
import { createGestureClaim, type IGestureClaim } from './gesture-claim';
import {
  createNodeWatching,
  type INodeWatching,
  type IWatchingOptions,
} from './node-watching';
import { place, unplace } from './placement';
import { ensureResetSheet } from './reset-sheet';
import {
  contextBelow,
  effectiveViewName,
  syncTextContext,
} from './text-context';
import { viewFamilyOf } from './view-tags';

export type IDomHostOptions = IWatchingOptions & {
  document: Document;
  // Told when an image element was given a new source, which is where its load begins
  onLoadStart?: (handle: object) => void;
};

export type IDomHost = ITreeHost & {
  // Where a surface's root element goes once its first commit lands
  registerRoot: (rootTag: number, container: Element) => void;
  // The node an event target belongs to, as the handle the engine addresses events to
  handleAt: (target: Node | null) => object | undefined;
} & Pick<IGestureClaim, 'blocksNative'>;

// Where a tag would be, this host never speaks to Fabric so any number would be an invention
const NO_TAG = -1;

// A node that changes view keeps its identity and its children, so the element is swapped under it
// The new element has shown nothing yet, so the spec it last got no longer holds
function swapElement(document: Document, node: IDomNode): void {
  const old = node.dom;
  const tag = viewFamilyOf(effectiveViewName(node)).tag;
  if (node.kind !== RETAINED_KIND.element || old === undefined) return;
  if (old.nodeName.toLowerCase() === tag) return;
  const next = document.createElement(tag);
  while (old.firstChild !== null) next.appendChild(old.firstChild);
  old.parentNode?.replaceChild(next, old);
  node.dom = next;
  node.applied = undefined;
  setOwner(next, node);
}

function domFor(document: Document, spec: IRetainedCreate): Node | undefined {
  if (spec.kind === RETAINED_KIND.element) {
    return document.createElement(viewFamilyOf(spec.viewName).tag);
  }
  if (spec.kind === RETAINED_KIND.text) {
    return document.createTextNode(spec.text ?? '');
  }
  return undefined;
}

// An element gets its reset class even when no prop ever arrives, so a create marks it too
function createStore(
  document: Document,
  nodes: WeakMap<object, IDomNode>,
  dirty: Set<IDomNode>,
): IRetainedStore<IDomNode> & {
  nodeOf: (handle: object, what: string) => IDomNode;
} {
  const nodeOf = (handle: object, what: string): IDomNode => {
    const node = nodes.get(handle);
    if (node === undefined) {
      throw new Error(`${what}: handle names no node in this tree`);
    }
    return node;
  };
  return {
    nodeOf,
    at: handle => nodeOf(handle, 'applyOps'),
    create: (handle, spec) => {
      const node = createDomNode(
        handle,
        spec.kind,
        spec.viewName,
        domFor(document, spec),
      );
      if (spec.text !== undefined) node.props.text = spec.text;
      if (node.dom !== undefined) setOwner(node.dom, node);
      nodes.set(handle, node);
      dirty.add(node);
    },
  };
}

function createEffects(
  document: Document,
  roots: ReadonlyMap<number, Element>,
  dirty: Set<IDomNode>,
  watching: INodeWatching,
): IRetainedEffects<IDomNode> {
  // The element is swapped before it is placed, so a nested text never sits in the page as a block
  const retag = (node: IDomNode): void => {
    swapElement(document, node);
    dirty.add(node);
  };
  return {
    placed: node => {
      const { parent } = node;
      if (parent !== undefined) {
        syncTextContext(node, contextBelow(parent), retag);
      }
      place(node);
    },
    removed: node => {
      unplace(node);
      watching.suspend(node);
    },
    propChanged: node => dirty.add(node),
    textChanged: (node, text) => {
      if (node.kind === RETAINED_KIND.text && node.dom !== undefined) {
        node.dom.nodeValue = text;
      }
    },
    componentChanged: node => {
      retag(node);
      const below = contextBelow(node);
      for (const child of node.children) syncTextContext(child, below, retag);
    },
    // The surface root is an ordinary view, so mounting it is one append into the container
    committed: (rootTag, surface) => {
      const container = roots.get(rootTag);
      const root = surface.dom;
      if (container === undefined || root === undefined) return;
      if (root.parentNode !== container) container.appendChild(root);
    },
  };
}

export function createDomHost({
  document,
  onLoadStart,
  ...watchingOptions
}: IDomHostOptions): IDomHost {
  const nodes = new WeakMap<object, IDomNode>();
  const roots = new Map<number, Element>();
  const dirty = new Set<IDomNode>();
  const store = createStore(document, nodes, dirty);
  const watching = createNodeWatching(watchingOptions);
  const visitor = createRetainedVisitor(
    store,
    createEffects(document, roots, dirty, watching),
  );
  ensureResetSheet(document);
  return {
    ...createTreeReads(store.nodeOf),
    registerRoot: (rootTag, container) => {
      roots.set(rootTag, container);
    },
    handleAt: target => ownerAt(target)?.handle,
    applyOps: batch => {
      walkOps(batch, visitor);
      applyDirty(dirty, watching, onLoadStart);
    },
    // Nothing is memoized here, so there is nothing to invalidate
    markPropsDirty: () => {},
    // Read off `committedRootTag`, т.к. `removeChild` cuts the parent link before a teardown sweep
    committedRecordOf: (handle): ICommittedRecord | undefined => {
      const rootTag = nodes.get(handle)?.committedRootTag;
      if (rootTag === undefined) return undefined;
      return { handle, tag: NO_TAG, rootTag };
    },
    // No payload is built on web, props go to the element directly
    committedPayloadOf: () => undefined,
    census: handles =>
      censusOf(handles.map(handle => store.nodeOf(handle, 'census'))),
    ...createImperative(handle => store.nodeOf(handle, 'imperative')),
    // The page learns of a claim through `blocksNative`, see `dom-gestures.ts`
    ...createGestureClaim(),
  };
}
