// The prop surface of `<image>`, for React.
//
// No component left to type — the element IS the tag, and the whole source/style translation
// (`renderImage`'s `normalizeSource`, the width/height fold, resizeMode/tintColor-from-style, the
// `alt` -> accessibilityLabel fold) runs on the tag as the engine behavior
// `core/components/src/behaviors/image.ts`, wired by `../../register`. The STATICS kept the name
// `Image` and moved to `modules/image` — an imperative API with no view.
//
// The base is fully agnostic, so it lives ONCE in @symbiote-native/components
// (<prop_types_split_agnostic_vs_per_adapter>). Only the class-styling field is per-adapter, and
// React spells it `className`.
import type { IImageProps as IImageBaseProps } from '@symbiote-native/components';

export type IImageProps = IImageBaseProps & { className?: string };
