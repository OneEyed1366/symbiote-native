// RN's Image STATICS — `getSize`, `prefetch`, `queryCache`, `abortPrefetch`, `resolveAssetSource`.
//
// IN `modules/`, NOT `components/`. The primitive is the `<image>` tag and its fold runs in the
// engine (`behaviors/image.ts`); what is left under the name `Image` is an imperative API with no
// view, which is what this bucket is for. Sitting in `components/` made a statics object read as a
// component.
//
// A NAMESPACE OBJECT rather than five bare functions, deliberately: `Alert`, `Share`, `Linking`
// and `Vibration` are all `export const X = {…}`, and an app porting from RN writes
// `Image.getSize(...)` verbatim. Shared verbatim via `imageStatics`, the same source every other
// adapter's Image uses.
import { imageStatics, type IImageStatics } from '@symbiote-native/components';

export type { IImageStatics };

export const Image: IImageStatics = imageStatics;
