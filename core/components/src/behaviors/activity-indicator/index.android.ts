// ActivityIndicator's behavior on Android, where the spinner is `AndroidProgressBar` and needs two
// props RN's iOS branch never sends (`ActivityIndicator.js:106`, spread only at `:118`):
//
//   styleAttr      drives ProgressBar.setStyle(); without it the view throws "setStyle() not called"
//   indeterminate  the spinner has no determinate mode here
//
// and where the default colour is the THEME — expressed as null so the fold omits the key entirely
// rather than handing Fabric's colour parser a null it rejects.

import { registerActivityIndicatorBehaviors } from './shared';

const ANDROID_STYLE_ATTR = 'Normal';

export function registerActivityIndicatorBehavior(): void {
  registerActivityIndicatorBehaviors({
    defaultColor: null,
    nativeExtras: { styleAttr: ANDROID_STYLE_ATTR, indeterminate: true },
  });
}
