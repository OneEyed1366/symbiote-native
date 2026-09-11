// RN's Image STATICS — `getSize`, `prefetch`, `queryCache`, `abortPrefetch`, `resolveAssetSource`.
//
// IN `modules/`, NOT `components/`. The primitive is the `<image>` tag and its fold runs in the
// engine (`behaviors/image.ts`); what is left under the name `Image` is an imperative API with no
// view, which is what this bucket is for — `<adapter_src_follows_framework_idioms>` names it.
// Sitting in `components/` was what made a statics object read as a component.
//
// A NAMESPACE OBJECT rather than five bare functions, deliberately. `Alert`, `Share`, `Linking`,
// `Vibration` and `AppState` are all `export const X = {…}`, an app porting from RN writes
// `Image.getSize(...)` verbatim (P0, `<adapters_reach_full_feature_parity>`), and the bundle-size
// argument for splitting them is void: Metro does no tree shaking (facebook/metro#227).
//
// Shared verbatim via `imageStatics`, the same source React's and Vue's Image use.
import { imageStatics, type IImageStatics } from '@symbiote-native/components';

export type { IImageStatics };

export const Image: IImageStatics = imageStatics;
