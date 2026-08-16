// findNodeHandle, the Svelte adapter twin of adapters/react/src/host-instance.ts and
// adapters/vue/src/host-instance/index.ts. RN's "ref/instance -> native reactTag" lookup, the
// seam imperative-interop libraries (reanimated, gesture-handler, react-navigation) reach
// through.
//
// A `{@attach node => (hostRef = node)}` on a host intrinsic hands back the real ISymbioteNode
// directly — renderer.ts's `createElementNode` grafts `toPublicInstance` onto every host node AT
// CREATION (nodes are eagerly bound under the official custom-renderer API, unlike the retired
// shim's lazy-until-committed ShimElement), so there is no more "not live yet" state to guard
// against and no separate shim-vs-engine-node translation layer left to write.
import {
  getNativeTag,
  dlog,
  type IHostInstance,
  type ISymbioteNode,
} from '@symbiote-native/engine';

export type { IHostInstance } from '@symbiote-native/engine';

// Kept as a typed passthrough (rather than app code reading `IHostInstance` fields directly) so
// the accessor name stays stable if the node shape ever needs adapting again, matching the other
// adapters' own `hostInstance`/template-ref helpers.
export function hostInstance(node: IHostInstance | null | undefined): IHostInstance | undefined {
  return node ?? undefined;
}

export function findNodeHandle(
  componentOrHandle: ISymbioteNode | number | null | undefined,
): number | null {
  if (componentOrHandle === null || componentOrHandle === undefined) return null;
  if (typeof componentOrHandle === 'number') return componentOrHandle;
  const tag = getNativeTag(componentOrHandle) ?? null;
  dlog(`findNodeHandle: component=${componentOrHandle.component} tag=${tag}`);
  return tag;
}
