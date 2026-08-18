// `IImageBackgroundProps`'s canonical home. Inherits every forwarding Image field (reused
// verbatim from @symbiote-native/components' agnostic IImageProps base) but `style` here means the
// WRAPPER's style, not the inner Image's, and `children` is a Svelte-specific field (a Snippet,
// never forwarded to the bag) — both reasons this type stays per-adapter rather than shared, per
// CLAUDE.md's <prop_types_split_agnostic_vs_per_adapter>, mirroring React's own
// `Omit<IImageProps, 'style'> & {...}` declaration.
import type { Snippet } from 'svelte';
import type {
  IClassNameValue,
  IStyleProp,
  IViewStyle,
} from '@symbiote-native/engine';
import type { IImageProps } from '@symbiote-native/components';
import type { ISvelteClassValue } from '../../class-value';

export interface IImageBackgroundProps extends Omit<IImageProps, 'style'> {
  // Wrapper View style; its width/height are reapplied to the inner Image.
  style?: IStyleProp<IViewStyle>;
  // Style merged onto the inner absolute-fill Image, after the proxied dimensions. A bare string
  // resolves through the shared style registry, like `class` below.
  imageStyle?: IStyleProp<IViewStyle> | string;
  class?: ISvelteClassValue;
  children?: Snippet;
}
