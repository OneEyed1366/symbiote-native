// The prop surface of `<image-background>`, for React.
//
// No component left to type — the element IS the tag. RN's ImageBackground is a View holding an
// absolutely-filled Image with the app's children beside it (ImageBackground.js:74-103), which the
// engine behavior now builds (`core/components/src/behaviors/image-background.ts`). This stays
// exported because an app that wraps the tag in its own component types the bag it forwards
// against something, the same reason `button-props.ts` survived that move.
//
// PER-ADAPTER, not shared: `children` is a `ReactNode` here, a Snippet on Svelte and slots on Vue
// (<prop_types_split_agnostic_vs_per_adapter>).
import type { ReactNode } from 'react';
import type { IImageProps } from '@symbiote-native/components';
import type { IStyleProp, IViewStyle } from '../utils/styles';

// Inherits every forwarding Image prop (source, defaultSource, loadingIndicatorSource, resizeMode,
// resizeMethod, tintColor, blurRadius, capInsets, fadeDuration, the load events); they flow onto
// the inner Image, which is where RN's own `...props` spread puts them.
export interface IImageBackgroundProps extends Omit<IImageProps, 'style'> {
  // The wrapper View's style; its width/height are reapplied to the inner Image so the image fills
  // the box rather than collapsing to its source's intrinsic size.
  style?: IStyleProp<IViewStyle>;
  // Style merged onto the inner absolute-fill Image, after the proxied dimensions. A bare string
  // is a class name and resolves through the shared style registry, like `className` below.
  imageStyle?: IStyleProp<IViewStyle> | string;
  // Applies to the wrapper View, mirroring `style` — never to the inner image.
  className?: string;
  children?: ReactNode;
}
