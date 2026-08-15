// Image statics (getSize / prefetch / queryCache / abortPrefetch / resolveAssetSource) attach onto
// the component value, mirroring RN's `Image.getSize` static surface — shared verbatim via
// @symbiote-native/engine's imageStatics, the same source React's and Vue's Image use. A `.svelte`
// file's own module type resolves through svelte's ambient `declare module '*.svelte'` fallback (a
// bare value export, not props-parameterized — see view-props.ts's header comment for the general
// reason), so the statics are attached here in a plain sibling `.ts` file rather than inside
// `index.svelte` itself.
import ImageComponent from './index.svelte';
import { imageStatics } from '@symbiote-native/components';

export type { IImageProps } from './image-props';
export type { IImageStatics } from '@symbiote-native/components';

export const Image = Object.assign(ImageComponent, imageStatics);
