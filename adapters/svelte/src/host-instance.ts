// `findNodeHandle`, the ref to native `reactTag` lookup that interop libraries reach through
// An element ref taken with `{@attach}` is the engine node itself, so it is the host instance
// The tag is undefined until the first commit, so an uncommitted ref resolves to null as in RN
import {
  componentOf,
  getNativeTag,
  isSymbioteNode,
  toPublicInstance,
  dlog,
  type IHostInstance,
} from '@symbiote-native/engine';

export type { IHostInstance } from '@symbiote-native/engine';

// The typed handle (`measure`, `setNativeProps`, `focus`) of an element ref
// The parameter is `unknown` and the guard narrows it, as the ref type svelte2tsx emits comes
// from `lib.dom` tag maps that cannot be augmented, so app code would need an `as` cast
export function hostInstance(ref: unknown): IHostInstance | undefined {
  return isSymbioteNode(ref) ? toPublicInstance(ref) : undefined;
}

export function findNodeHandle(componentOrHandle: unknown): number | null {
  if (componentOrHandle === null || componentOrHandle === undefined)
    return null;
  if (typeof componentOrHandle === 'number') return componentOrHandle;
  if (!isSymbioteNode(componentOrHandle)) return null;
  const tag = getNativeTag(componentOrHandle) ?? null;
  dlog(
    `findNodeHandle: component=${componentOf(componentOrHandle)} tag=${tag}`,
  );
  return tag;
}
