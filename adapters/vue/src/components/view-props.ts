// The `<view>` tag's prop surface. There is no `View` component: it was a functional wrapper whose
// whole body was `h('view', normalizeVueAttrs(attrs))`, and that fold moved to the renderer's
// `patchProp` (kebab->camel per key, then `id -> nativeID`) — which covers a hand-written `h('view')`
// and both compiled paths alike, where a wrapper covered only the call sites that named it.

import type {
  IClassNameValue,
  IStyleProp,
  ISymbioteEvent,
  IViewStyle,
} from '@symbiote-native/engine';
import type {
  IAccessibilityProps,
  IAriaProps,
  IResponderProps,
} from '@symbiote-native/components';
import type { VNodeRef } from '@vue/runtime-core';

export interface IViewProps
  extends IAccessibilityProps, IAriaProps, IResponderProps {
  style?: IStyleProp<IViewStyle>;
  // Resolved through the shared style registry by routeProp's centralized class+style merge
  // (core/engine/src/node.ts).
  class?: IClassNameValue;
  onPress?: (event: ISymbioteEvent) => void;
  onPressIn?: (event: ISymbioteEvent) => void;
  onPressOut?: (event: ISymbioteEvent) => void;
  onLayout?: (event: ISymbioteEvent) => void;
  onFocus?: (event: ISymbioteEvent) => void;
  onBlur?: (event: ISymbioteEvent) => void;
  pointerEvents?: 'auto' | 'none' | 'box-none' | 'box-only';
  hitSlop?:
    number | { top?: number; left?: number; bottom?: number; right?: number };
  id?: string;
  focusable?: boolean;
  collapsable?: boolean;
  removeClippedSubviews?: boolean;
  renderToHardwareTextureAndroid?: boolean;
  shouldRasterizeIOS?: boolean;
  needsOffscreenAlphaCompositing?: boolean;
  ref?: VNodeRef;
  key?: string | number | symbol;
}
