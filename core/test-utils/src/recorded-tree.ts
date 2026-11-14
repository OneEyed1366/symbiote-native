// The authored tree an op batch describes, and the walk that builds it. Apart from
// `recording-host` so that file holds the `ITreeHost` surface and this one the mechanism

import { isSymbioteNode, type ISymbioteNode } from '@symbiote-native/engine';
import type { IMutationBatch } from '@symbiote-native/engine/mutation-buffer';
import { walkOps } from '@symbiote-native/engine/mutation-walk';
import {
  createRetainedVisitor,
  type IRetainedCreate,
} from '@symbiote-native/engine/retained-visitor';

export type IRecorded = {
  handle: ISymbioteNode;
  instanceHandle: unknown;
  viewName: string;
  tagName: string;
  ownedListeners: Record<string, boolean>;
  underlayShown: boolean;
  props: Record<string, unknown>;
  parent: IRecorded | undefined;
  children: IRecorded[];
  // The numeric root tag `createSurface` was called with, not the native Fabric `tag`
  // Set at the first commit that lands the node, never cleared by a later removal
  committedRootTag: number | undefined;
};

export type IRecordedTree = {
  /** How many commits the ops asked for. */
  commits: number;
  /** Every node the ops created, in creation order, which is what `find` searches. */
  readonly authored: IRecorded[];
  applyOps: (batch: IMutationBatch) => void;
  recordedOf: (handle: object) => IRecorded | undefined;
  nodeOf: (handle: object, what: string) => IRecorded;
  reset: () => void;
  forget: () => void;
};

function newRecord(handle: object, spec: IRetainedCreate): IRecorded {
  // Checked rather than assumed: the batch types handles as `object`, and the whole value of
  // holding the node is being able to hand it back to the engine's own API
  if (!isSymbioteNode(handle)) {
    throw new Error('applyOps: a handle in this batch is not an engine node');
  }
  return {
    handle,
    instanceHandle: spec.instanceHandle,
    viewName: spec.viewName,
    tagName: '',
    ownedListeners: {},
    underlayShown: false,
    props: spec.text === undefined ? {} : { text: spec.text },
    parent: undefined,
    children: [],
    committedRootTag: undefined,
  };
}

export function createRecordedTree(): IRecordedTree {
  let recorded = new WeakMap<object, IRecorded>();
  // A `WeakMap` cannot be enumerated and `find` has to start somewhere. Strong references, so
  // `forget()` is what a long file calls to stop this growing
  const authored: IRecorded[] = [];

  const nodeOf = (handle: object, what: string): IRecorded => {
    const node = recorded.get(handle);
    if (node === undefined) {
      throw new Error(`${what}: handle names no node in this tree`);
    }
    return node;
  };

  // `setTag`, `setOwnedListener` and `setUnderlayShown` are RECORDED and not acted on, т.к. what
  // each one means is resolved in `SymbioteFabricProps.cpp` and this host must not grow a copy
  const visitor = createRetainedVisitor<IRecorded>(
    {
      at: handle => nodeOf(handle, 'applyOps'),
      create: (handle, spec) => {
        const node = newRecord(handle, spec);
        recorded.set(node.handle, node);
        authored.push(node);
      },
    },
    {
      committed: () => {
        tree.commits += 1;
      },
    },
  );

  const tree: IRecordedTree = {
    commits: 0,
    authored,
    recordedOf: handle => recorded.get(handle),
    nodeOf,
    applyOps: batch => walkOps(batch, visitor),
    reset(): void {
      authored.length = 0;
      tree.commits = 0;
    },
    forget(): void {
      recorded = new WeakMap();
      tree.reset();
    },
  };
  return tree;
}
