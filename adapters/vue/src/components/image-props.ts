// The `<image>` tag's prop surface. The wrapper is gone: the whole source/src/srcSet resolution,
// the width/height -> style fold and `alt` -> accessibility now run in `registerImageBehavior`, on
// the tag itself. The Image STATICS moved to `modules/image` — an imperative API with no view,
// which living beside a component made read as one.

import type { IImageProps as IImageBaseProps } from '@symbiote-native/components';
import type { IClassNameValue } from '@symbiote-native/engine';

// Vue's own idiom for a registered class name (mirrors IViewProps.class) — a per-adapter field
// per <prop_types_split_agnostic_vs_per_adapter>, not part of the shared agnostic base.
export type IImageProps = IImageBaseProps & { class?: IClassNameValue };
