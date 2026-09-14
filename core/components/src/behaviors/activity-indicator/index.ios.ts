// ActivityIndicator's behavior on iOS: `ActivityIndicatorView` takes the size enum and a GRAY
// default colour, and needs no extra native props. That is the entire platform half.
//
// This file is also the base the folder's `index.ts` re-exports for headless, matching every other
// platform-split module in this tree.

import { registerActivityIndicatorBehaviors } from './shared';

// RN's iOS default spinner colour (`ActivityIndicator.js:25`, GRAY).
const IOS_DEFAULT_COLOR = '#999999';

export function registerActivityIndicatorBehavior(): void {
  registerActivityIndicatorBehaviors({
    defaultColor: IOS_DEFAULT_COLOR,
    nativeExtras: {},
  });
}
