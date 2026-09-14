// The public PROP TYPES for the two strict intrinsics, and nothing else. There is no component and
// no capitalized alias: an app writes `<view>` / `<text>`, React commits a host element directly,
// and `JSX.IntrinsicElements` (jsx-runtime.ts) is what supplies these types to it. The reconciler
// maps the tag through `descriptorFor` to a Fabric view name at commit.

import type { Ref, ReactNode } from 'react';
import type { ISymbioteEvent } from '@symbiote-native/engine';
import type { IHostInstance } from './host-instance';
import type {
  IAccessibilityProps,
  IAriaProps,
} from '@symbiote-native/components';
import type { IResponderProps } from './utils/responder-props';
import type { IStyleProp, ITextStyle, IViewStyle } from './utils/styles';

export interface IViewProps
  extends IAccessibilityProps, IAriaProps, IResponderProps {
  style?: IStyleProp<IViewStyle>;
  // React's own web idiom for a registered class name (RN has no DOM/CSS classes to match
  // against). Resolved through the shared style registry by routeProp's centralized
  // class+style merge (core/engine/src/node.ts) — the same registry a `<style>`/`<style
  // module>` compiled Vue SFC block or a `*.module.css` import registers into, so a class
  // authored anywhere is usable from any adapter. Explicit `style` always wins over a
  // className-derived one, regardless of prop declaration order.
  className?: string;
  onPress?: (event: ISymbioteEvent) => void;
  // Touch lifecycle around a press, synthesized from the touch stream (events.ts),
  // mirroring RN's Pressability: onPressIn fires on touch-down, onPressOut on release.
  onPressIn?: (event: ISymbioteEvent) => void;
  onPressOut?: (event: ISymbioteEvent) => void;
  // The most-used View event: fires with the measured frame once Fabric lays the view
  // out. A listener also raises the onLayout flag prop so native actually measures.
  onLayout?: (event: ISymbioteEvent) => void;
  // Bubbling focus/blur (RN's FocusEventProps), declared on the base View, so any
  // view emits them; registered in shared's view-config BASE_EVENTS.
  onFocus?: (event: ISymbioteEvent) => void;
  onBlur?: (event: ISymbioteEvent) => void;
  // Gate touch handling without changing layout: 'none' lets touches fall through,
  // 'box-none' makes the view itself transparent to touches but not its children.
  pointerEvents?: 'auto' | 'none' | 'box-none' | 'box-only';
  // Enlarge the touch target past the view's visual bounds without affecting layout.
  hitSlop?:
    number | { top?: number; left?: number; bottom?: number; right?: number };
  // testID / nativeID are inherited from IAccessibilityProps (the shared host-anchor base).
  // RN's modern W3C alias for nativeID. Folded into nativeID before commit (id wins
  // when both are set, matching RN's View.js), never sent to Fabric raw.
  id?: string;
  focusable?: boolean;
  // Yoga collapses a non-interactive view into its parent unless this is false.
  collapsable?: boolean;
  removeClippedSubviews?: boolean;
  renderToHardwareTextureAndroid?: boolean;
  shouldRasterizeIOS?: boolean;
  needsOffscreenAlphaCompositing?: boolean;
  // A host ref hands back the public instance (measure / setNativeProps / focus).
  ref?: Ref<IHostInstance>;
  children?: ReactNode;
}

export interface ITextProps extends IAccessibilityProps, IAriaProps {
  style?: IStyleProp<ITextStyle>;
  // See IViewProps.className — same registry, same merge precedence.
  className?: string;
  onPress?: (event: ISymbioteEvent) => void;
  // Synthesized from a long touch hold by shared/events.ts (a hold timer armed on
  // touch start, fired after 500ms, suppressing the tap on release), like RN's Text.
  onLongPress?: (event: ISymbioteEvent) => void;
  // Touch lifecycle around a press (RN's ITextProps), synthesized from the touch stream.
  onPressIn?: (event: ISymbioteEvent) => void;
  onPressOut?: (event: ISymbioteEvent) => void;
  // The view-frame layout event (RN's ITextProps onLayout), distinct from onTextLayout's
  // per-glyph frames; a listener raises the onLayout flag prop so native measures.
  onLayout?: (event: ISymbioteEvent) => void;
  // Fires after glyph layout with per-line frames, wired as a direct event (RCTText).
  onTextLayout?: (event: ISymbioteEvent) => void;
  numberOfLines?: number;
  ellipsizeMode?: 'head' | 'middle' | 'tail' | 'clip';
  selectable?: boolean;
  // RN's Text carries it (Text.js) and Button hands it to the label so a screen reader announces
  // the text as disabled along with the button holding it (Button.js:388).
  disabled?: boolean;
  adjustsFontSizeToFit?: boolean;
  minimumFontScale?: number;
  allowFontScaling?: boolean;
  maxFontSizeMultiplier?: number | null;
  // A color prop: the shared commit layer already runs `selectionColor` through the
  // platform color processor (commit.ts COLOR_PROPS), so it reaches Fabric correctly.
  selectionColor?: string;
  // testID / nativeID inherited from IAccessibilityProps (shared host-anchor base).
  ref?: Ref<IHostInstance>;
  children?: ReactNode;
}
