// The prop surface of `<image-background>`, for Svelte.
//
// No component left to type — the element IS the tag; the composition lives in the engine behavior
// (`core/components/src/behaviors/image-background.ts`). This stays exported because an app that
// wraps the tag in its own component types the bag it forwards against something.
//
// PER-ADAPTER, not shared: `style` here means the WRAPPER's style rather than the inner Image's,
// and `children` is a Snippet, never forwarded to the bag
// (<prop_types_split_agnostic_vs_per_adapter>).
import type { Snippet } from 'svelte';
import type { IStyleProp, IViewStyle } from '@symbiote-native/engine';
import type { IImageProps } from '@symbiote-native/components';
import type { ISvelteClassValue } from '../class-value';

export interface IImageBackgroundProps extends Omit<IImageProps, 'style'> {
  // Wrapper View style; its width/height are reapplied to the inner Image.
  style?: IStyleProp<IViewStyle>;
  // Style merged onto the inner absolute-fill Image, after the proxied dimensions. A bare string
  // resolves through the shared style registry, like `class` below.
  imageStyle?: IStyleProp<IViewStyle> | string;
  class?: ISvelteClassValue;
  children?: Snippet;
}
