// ScrollView's behavior on iOS: a RefreshControl is a SIBLING of the content view, rendered before
// it (`ScrollView.js:1844`). That is the whole platform half — a claim in `beside` mode, and the
// engine's placement rule already puts a claimed child before the slot.
//
// This file is also the base the folder's `index.ts` re-exports for headless, matching
// `render-scroll-view`'s own choice to make iOS the default for anything platform-branched.

import { registerScrollViewBehaviors } from './shared';

export function registerScrollViewBehavior(): void {
  registerScrollViewBehaviors({ claimMode: 'beside' });
}
