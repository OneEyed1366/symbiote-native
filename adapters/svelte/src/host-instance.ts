// findNodeHandle, the Svelte adapter twin of adapters/react/src/host-instance.ts and
// adapters/vue/src/host-instance/index.ts. RN's "ref/instance -> native reactTag" lookup, the
// seam imperative-interop libraries (reanimated, gesture-handler, react-navigation) reach
// through.
//
// A Svelte `bind:this={hostShim}` gives back a ShimElement (dom-shim/element.ts), not the raw
// engine node directly — its `.engineNode` field IS the raw ISymbioteNode once the shim has
// gone live (undefined before the first commit, same "uncommitted -> null" idempotent shape
// RN's own findNodeHandle has). The node -> tag resolution itself belongs to the engine
// (getNativeTag, keyed on the raw node in the commit mirror); this only adapts the
// Svelte-shaped input (a ShimElement) onto it.
import {
  getNativeTag,
  isSymbioteNode,
  toPublicInstance,
  dlog,
  type IHostInstance,
} from '@symbiote-native/engine';
import type { ShimElement } from './dom-shim';

export type { IHostInstance } from '@symbiote-native/engine';

// `engineNode` alone does NOT identify a ShimElement: it is declared on the shared ShimNode base
// (dom-shim/shim-node.ts), so a ShimText / ShimComment / ShimDocumentFragment satisfies it too,
// and none of those is a host ref an interop library can hand back. `tagName` is ShimElement's
// own field, so checking it makes the predicate mean what its name says.
function isShimElement(value: unknown): value is ShimElement {
  return (
    typeof value === 'object' &&
    value !== null &&
    'engineNode' in value &&
    'tagName' in value
  );
}

// The typed imperative handle (measure/measureInWindow/measureLayout/setNativeProps/focus/blur)
// a `bind:this` host ref carries — the Svelte twin of a React `ref.current`/Vue template ref
// already being an `IHostInstance`. Every engine node carries those methods on its prototype, so
// the toPublicInstance call below is the identity; this helper exists only to give app code a correctly
// TYPED accessor off the SHIM value (`ShimElement`) instead of the bare `.engineNode` field,
// with no `as` cast at the call site.
export function hostInstance(
  shim: ShimElement | null | undefined,
): IHostInstance | undefined {
  if (shim === null || shim === undefined) return undefined;
  const node = shim.engineNode;
  return node !== undefined && isSymbioteNode(node)
    ? toPublicInstance(node)
    : undefined;
}

export function findNodeHandle(
  componentOrHandle: ShimElement | number | null | undefined,
): number | null {
  if (componentOrHandle === null || componentOrHandle === undefined)
    return null;
  if (typeof componentOrHandle === 'number') return componentOrHandle;
  if (!isShimElement(componentOrHandle)) return null;
  const node = componentOrHandle.engineNode;
  if (node !== undefined && isSymbioteNode(node)) {
    const tag = getNativeTag(node) ?? null;
    dlog(`findNodeHandle: component=${node.component} tag=${tag}`);
    return tag;
  }
  dlog('findNodeHandle: hostShim not live yet (engineNode undefined)');
  return null;
}
