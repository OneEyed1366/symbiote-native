// `Image` is no longer a component — the primitive is the `<image>` tag, and its whole prop fold
// (source resolution, width/height, resizeMode + tintColor into the style, alt -> accessibility)
// runs in the engine from `core/components/src/behaviors/image.ts`, which `../../register` wires up.
//
// What survives under this name is RN's STATIC surface: `Image.getSize`, `prefetch`, `queryCache`,
// `abortPrefetch`, `resolveAssetSource`. RN hangs those off the component value; with no component
// left they hang off the namespace directly, which is the same call site an app already writes.
// Shared verbatim via `imageStatics`, the same source React's and Vue's Image use.
import { imageStatics, type IImageStatics } from '@symbiote-native/components';

export type { IImageProps } from './image-props';
export type { IImageStatics } from '@symbiote-native/components';

export const Image: IImageStatics = imageStatics;
