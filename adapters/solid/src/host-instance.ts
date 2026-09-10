// findNodeHandle, the Solid adapter twin of adapters/react/src/host-instance.ts and
// adapters/vue/src/host-instance. RN's "ref/instance -> native reactTag" lookup, the seam
// imperative-interop libraries (reanimated, gesture-handler, react-navigation) reach through.
//
// A Solid `ref={el}` on a symbiote host tag assigns the raw engine SymbioteNode, which already
// carries measure / setNativeProps / focus on its prototype, exactly like React's
// getPublicInstance.
//
// The node -> tag resolution itself belongs to the engine (getNativeTag, keyed on the raw node in the
// commit mirror); this only unwraps the Solid-shaped inputs onto it. An uncommitted or unknown input
// has no tag yet and surfaces as null.

import {
  componentOf,
  getNativeTag,
  isSymbioteNode,
  dlog,
} from '@symbiote-native/engine';

// The public instance a Solid host ref hands back: the engine node itself. Re-exported from the
// engine so a call site reads in parity with the React and Vue adapters.
export type { IHostInstance } from '@symbiote-native/engine';

// Solid's counterpart to Vue's isRef branch. Solid has no ref wrapper — `ref={el}` writes the node
// straight into a variable — but holding that node in a signal is idiomatic, and a signal reads as a
// zero-argument accessor. Calling it is the only way to unwrap one (there is no isSignal predicate:
// an accessor is an ordinary function). Note this UNWRAPS ONE LEVEL only, deliberately: recursing
// would turn a component that happens to be passed here into a call chain.
function isAccessor(value: unknown): value is () => unknown {
  return typeof value === 'function' && value.length === 0;
}

export function findNodeHandle(componentOrHandle: unknown): number | null {
  const candidate = isAccessor(componentOrHandle)
    ? componentOrHandle()
    : componentOrHandle;
  if (candidate === null || candidate === undefined) return null;
  if (typeof candidate === 'number') return candidate;
  if (isSymbioteNode(candidate)) {
    const tag = getNativeTag(candidate) ?? null;
    dlog(`findNodeHandle: component=${componentOf(candidate)} tag=${tag}`);
    return tag;
  }
  dlog('findNodeHandle: input did not resolve to a symbiote host node');
  return null;
}
