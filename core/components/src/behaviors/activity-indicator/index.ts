// The base of the folder-as-module group: Metro picks `index.ios` / `index.android` per platform,
// and everything else (tsx, vitest, headless) lands here. iOS is the default, matching every other
// platform-split module in this tree.
export { registerActivityIndicatorBehavior } from './index.ios';
export {
  ACTIVITY_INDICATOR_SPINNER_TAG,
  ACTIVITY_INDICATOR_TAG,
} from './shared';
export type { IActivityIndicatorProps, IActivityIndicatorSize } from './shared';
