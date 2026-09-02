// The public instance a host ref hands back, and the ref -> tag lookup. toPublicInstance and
// IHostInstance live in @symbiote-native/engine (every adapter inherits the same public instance);
// this module re-exports them so the React surface (findNodeHandle + IHostInstance, host-config's
// getPublicInstance) is unchanged. findNodeHandle stays React-specific: it is the
// RN-shaped "ref -> native tag" lookup over the engine's getNativeTag.

import {
  getNativeTag,
  isSymbioteNode,
  toPublicInstance,
  type ISymbioteNode,
  type IHostInstance,
} from '@symbiote-native/engine';

export { toPublicInstance, type IHostInstance };

// The committed native tag of a host ref (or a bare tag, idempotent). RN's
// findNodeHandle: a ref/instance resolves to its reactTag, a number passes through,
// null/undefined yields null. Undefined-until-committed surfaces as null.
export function findNodeHandle(
  componentOrHandle: IHostInstance | ISymbioteNode | number | null | undefined,
): number | null {
  if (componentOrHandle === null || componentOrHandle === undefined)
    return null;
  if (typeof componentOrHandle === 'number') return componentOrHandle;
  if (isSymbioteNode(componentOrHandle))
    return getNativeTag(componentOrHandle) ?? null;
  return null;
}
