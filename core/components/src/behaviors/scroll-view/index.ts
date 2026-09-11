// The base of the folder-as-module group: Metro picks `index.ios` / `index.android` per platform,
// and everything else (tsx, vitest, headless) lands here. iOS is the default for the same reason
// `render-scroll-view`'s own `Platform.select` defaults to it.
export { registerScrollViewBehavior } from './index.ios';
export {
  HORIZONTAL_SCROLL_VIEW_TAG,
  REFRESH_CONTROL,
  SCROLL_VIEW_TAG,
} from './shared';
