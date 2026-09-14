// The prop surface of `<image-background>`, for Angular.
//
// No component left to type — the element IS the tag; the composition lives in the engine behavior
// (`core/components/src/behaviors/image-background.ts`). This stays exported because an app that
// wraps the tag in its own component types the bag it forwards against something, and because
// `elements.ts` indexes the element directive's input types off it.
//
// PER-ADAPTER, not shared: Angular takes children via `<ng-content>` and its class binding is the
// framework's own (<prop_types_split_agnostic_vs_per_adapter>).
import type { IImageProps } from '@symbiote-native/components';
import type { IStyleProp, IViewStyle } from '@symbiote-native/engine';

export interface IAngularImageBackgroundProps extends Omit<
  IImageProps,
  'style'
> {
  // The wrapper View's style; its width/height are reapplied to the inner Image so the image fills
  // the box rather than collapsing to its source's intrinsic size. Bound through Angular's own
  // styling engine, so `elements.ts` excludes it from the directive's inputs like every other tag.
  style?: IStyleProp<IViewStyle>;
  // Style merged onto the inner absolute-fill Image, after the proxied dimensions. A bare string
  // is a class name and resolves through the shared style registry.
  imageStyle?: IStyleProp<IViewStyle> | string;
}
