// `IViewProps`'s canonical home. Split out of `View.svelte` because plain `tsc --build`
// resolves an import of a `.svelte` file through svelte's own ambient `declare module
// '*.svelte'` fallback (a bare default export only, per its shipped `types/index.d.ts`) —
// it never parses the real `<script module>` block, so a NAMED type re-exported from a
// `.svelte` file is invisible to `tsc` (only `svelte-check`/the language server resolve
// that). `View.svelte` imports and re-declares this type for its own `$props()` typing;
// this file is the one `components/index.ts` re-exports from, so the public `.d.ts` build
// output is correct.
import type { Snippet } from 'svelte';
import type {
  ISymbioteEvent,
  IClassNameValue,
  IStyleProp,
  IViewStyle,
} from '@symbiote-native/engine';
import type { IAccessibilityProps, IAriaProps, IResponderProps } from '@symbiote-native/components';
import type { ISvelteClassValue } from '../class-value';

export interface IViewProps extends IAccessibilityProps, IAriaProps, IResponderProps {
  style?: IStyleProp<IViewStyle>;
  class?: ISvelteClassValue;
  onPress?: (event: ISymbioteEvent) => void;
  onPressIn?: (event: ISymbioteEvent) => void;
  onPressOut?: (event: ISymbioteEvent) => void;
  onLayout?: (event: ISymbioteEvent) => void;
  onFocus?: (event: ISymbioteEvent) => void;
  onBlur?: (event: ISymbioteEvent) => void;
  pointerEvents?: 'auto' | 'none' | 'box-none' | 'box-only';
  hitSlop?: number | { top?: number; left?: number; bottom?: number; right?: number };
  id?: string;
  focusable?: boolean;
  collapsable?: boolean;
  removeClippedSubviews?: boolean;
  renderToHardwareTextureAndroid?: boolean;
  shouldRasterizeIOS?: boolean;
  needsOffscreenAlphaCompositing?: boolean;
  children?: Snippet;
}
