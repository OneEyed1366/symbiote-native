// The `<image>` tag's prop surface. `renderImage`'s whole fold — the source / src / srcSet
// resolution, the width+height fold into style, resizeMode and tintColor read back off the style,
// alt -> accessibilityLabel, the array shape native expects — runs in the tag's own behavior
// (`registerImageBehavior`, wired by `../register`), so the wrapper that used to call it is gone.
// The Image STATICS moved to `../modules/image`: an imperative API with no view.

import type { IImageProps as IImageBaseProps } from '@symbiote-native/components';
import type { IClassNameValue } from '@symbiote-native/engine';

// The agnostic base carries every field of RN's Image surface and is reused rather than
// redeclared. Only the class-styling field is per-adapter, and Solid's idiom is `class` — the
// spelling an author already writes on a raw host intrinsic. React's is `className`
// (<prop_types_split_agnostic_vs_per_adapter>).
export type IImageProps = IImageBaseProps & { class?: IClassNameValue };
