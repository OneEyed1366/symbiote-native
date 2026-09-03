// How a caller's `ref` on one of our components reaches the host element.
//
// Solid's `ref` is a COMPILE-TIME construct, not a runtime object, and that is the whole reason
// this helper exists. On a component the compiler rewrites `ref={el}` into a callback prop:
//
//   <View ref={el} />   ->   createComponent(View, { ref(r$) { … el = r$ } })
//
// so by the time a component body reads `props.ref`, a variable target has ALREADY become a
// function. React's RefObject / Vue's template ref have no counterpart here — there is nothing to
// write a `.current` into, and nothing for the adapter to allocate. The component's only job is to
// call what it was handed with the host node.
//
// The declared type still has to be solid-js's own `Ref<T>` union (`T | ((val: T) => void)`),
// because type-checking happens on the SOURCE the author wrote: `ref={el}` passes a variable of
// type T, and a callback-only signature would reject it before the compiler ever gets to rewrite
// it. So the union is a call-site typing requirement, and the runtime value is always the
// function branch — a non-function can only arrive from a hand-written createComponent() call,
// where there is no variable binding to assign back into, so it is ignored rather than guessed at.

import type { Ref } from 'solid-js';
import type { IHostInstance } from '../host-instance';

export function applyHostRef(
  ref: Ref<IHostInstance> | undefined,
  node: IHostInstance,
): void {
  if (typeof ref === 'function') ref(node);
}
