// The prop surface of `<image-background>`, for Vue.
//
// No component left to type — the element IS the tag; the composition lives in the engine behavior
// (`core/components/src/behaviors/image-background.ts`). This stays exported because an app that
// wraps the tag in its own component types the bag it forwards against something.
//
// PER-ADAPTER, not shared: Vue takes children via slots and spells the class prop `class`
// (<prop_types_split_agnostic_vs_per_adapter>).
import type { IImageProps } from '@symbiote-native/components';
import type {
  IClassNameValue,
  IStyleProp,
  IViewStyle,
} from '@symbiote-native/engine';

export interface IImageBackgroundProps extends Omit<IImageProps, 'style'> {
  // The wrapper View's style; its width/height are reapplied to the inner Image so the image fills
  // the box rather than collapsing to its source's intrinsic size.
  style?: IStyleProp<IViewStyle>;
  // Style merged onto the inner absolute-fill Image, after the proxied dimensions. A bare string
  // is a class name and resolves through the shared style registry, like `class` below.
  imageStyle?: IStyleProp<IViewStyle> | string;
  // Applies to the wrapper View, mirroring `style` — never to the inner image.
  class?: IClassNameValue;
}
