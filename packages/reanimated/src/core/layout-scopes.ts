import {
  bindToNode,
  childrenOf,
  getNativeTag,
  isInSurface,
  parentOf,
  type ISymbioteNode,
} from '@symbiote-native/engine';
import { setShouldAnimateExitingForTag } from 'react-native-reanimated/src/core';

export type IScope = { skipEntering?: boolean; skipExiting?: boolean };

export type IPendingEntering = { node: ISymbioteNode; id: number };

type IState = {
  scopes: WeakMap<ISymbioteNode, IScope>;
  // The scopes made since the last flush
  fresh: Set<ISymbioteNode>;
  pending: IPendingEntering[];
};

export function isScope(value: unknown): value is IScope {
  return typeof value === 'object' && value !== null;
}

function isSkippedByFreshScope(state: IState, node: ISymbioteNode): boolean {
  for (let up = parentOf(node); up !== undefined; up = parentOf(up)) {
    if (state.fresh.has(up) && state.scopes.get(up)?.skipEntering) return true;
  }
  return false;
}

// Once the scope is gone its children cannot be asked for an exit animation of their own
function skipChildrenExiting(node: ISymbioteNode, skip: boolean): void {
  for (const child of childrenOf(node)) {
    const tag = getNativeTag(child);
    if (tag !== undefined) setShouldAnimateExitingForTag(tag, !skip);
  }
}

// The props of a scope come again with every render, and only the first sight makes it new
function noteScope(state: IState, node: ISymbioteNode, scope: IScope): void {
  const isKnown = state.scopes.has(node);
  state.scopes.set(node, scope);
  if (isKnown) return;
  state.fresh.add(node);
  bindToNode(node, () => () => {
    const skipExiting = state.scopes.get(node)?.skipExiting;
    if (skipExiting !== undefined) skipChildrenExiting(node, skipExiting);
  });
}

// A scope is a node of its own, as `LayoutAnimationConfig` is, and speaks for its children.
// Skipping entering reaches what was made in the scope's own batch, a later mount still animates
export function createLayoutScopes(
  cancelEntering: (pending: IPendingEntering) => void,
) {
  const state: IState = {
    scopes: new WeakMap(),
    fresh: new Set(),
    pending: [],
  };
  return {
    noteScope: (node: ISymbioteNode, scope: IScope) =>
      noteScope(state, node, scope),
    noteEntering: (node: ISymbioteNode, id: number) =>
      state.pending.push({ node, id }),
    // Runs on every read too, so a node whose chain has not reached a surface waits to be decided
    flush(): void {
      const waiting: IPendingEntering[] = [];
      for (const entering of state.pending) {
        if (!isInSurface(entering.node)) waiting.push(entering);
        else if (isSkippedByFreshScope(state, entering.node)) {
          cancelEntering(entering);
        }
      }
      state.pending = waiting;
    },
    // A commit closes the batch: what is still unplaced is not in it, and no scope is new any more
    afterCommit(): void {
      state.pending = [];
      state.fresh.clear();
    },
  };
}
