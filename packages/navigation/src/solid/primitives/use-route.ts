// Mirrors @react-navigation's useRoute. Zero logic of its own - the route object is built by the
// navigators' route derivation from the shared core reducer's state.
//
// THE ACCESSOR IS THE WHOLE POINT HERE. React re-runs a screen's body on every navigation, so its
// useRoute() can hand back a plain object; Solid runs the body ONCE. A `useRoute()` returning
// `IRoute` would therefore paint the params the screen was pushed with and never update again -
// `navigation.setParams({...})` produces a new route object under the SAME key, and nothing would
// re-read it. Pinned by "setParams reaches a mounted screen" in ../solid.test.tsx.

import { createMemo } from 'solid-js';
import type { Accessor } from 'solid-js';
import type { IRoute } from '../../core';
import { requireNavigationScope } from '../navigation-context';

export function useRoute(): Accessor<IRoute<unknown>> {
  const scope = requireNavigationScope('useRoute');
  return createMemo(() => scope().route);
}
