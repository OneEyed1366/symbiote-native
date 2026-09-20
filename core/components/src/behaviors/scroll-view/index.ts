// The base of the folder-as-module group: Metro picks `index.ios` / `index.android` per platform,
// and everything else (tsx, vitest, headless) lands here. iOS is the default for the same reason
// `render-scroll-view`'s own `Platform.select` defaults to it.
export { registerScrollViewBehavior } from './index.ios';
export {
  HORIZONTAL_SCROLL_VIEW_TAG,
  REFRESH_CONTROL,
  SCROLL_VIEW_TAG,
} from './shared';
// The tag, so a test can locate a committed sticky wrapper by what the engine was TOLD rather than
// by a key its tag rule writes — see `ILiveNode.tagName`.
export { STICKY_HEADER_TAG } from './sticky';
