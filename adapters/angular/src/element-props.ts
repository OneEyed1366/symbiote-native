// The prop surface EVERY intrinsic tag accepts, and the type the element directives declare their
// shared inputs from.
//
// It is not a new contract: it is the agnostic base every adapter's own `IViewProps` is built on
// (`IAccessibilityProps` + `IAriaProps` + `IResponderProps`) plus RN's own View extras. Angular
// declares its own rather than importing another adapter's, per
// `<prop_types_split_agnostic_vs_per_adapter>` — and the fields below are the ones that genuinely
// differ, since a bare tag takes children from the template and a handle from `#ref`, so neither
// `children` nor `ref` appears here.
//
// `style` is deliberately ABSENT. Angular reserves `[style]` for its styling engine and a matching
// directive can only reclaim it at runtime, which is provable solely by executing a linked AOT
// artifact (`.claude/rules/test-harness-false-greens.md` §21/§21a). Declaring it would silently
// change what `[style]` means on every bare tag, so the supported spellings stay exactly what
// `bare-intrinsic-tag.test.ts` already pins: a plain object through `[style]`, an RN StyleProp
// array through `[symbioteStyle]`.
import type {
  IAccessibilityProps,
  IAriaProps,
  IRectOffset,
  IResponderProps,
} from '@symbiote-native/components';
import type {
  ISymbioteEvent,
  IStyleProp,
  IViewStyle,
} from '@symbiote-native/engine';

type IEventHandler = (event: ISymbioteEvent) => void;

export interface IElementProps
  extends IAccessibilityProps, IAriaProps, IResponderProps {
  /** RN's modern W3C-named alias for `nativeID`; the renderer folds it (`PROP_ALIASES`). */
  id?: string;
  pointerEvents?: 'auto' | 'none' | 'box-none' | 'box-only';
  hitSlop?: IRectOffset | number;
  focusable?: boolean;
  collapsable?: boolean;
  removeClippedSubviews?: boolean;
  renderToHardwareTextureAndroid?: boolean;
  shouldRasterizeIOS?: boolean;
  needsOffscreenAlphaCompositing?: boolean;
  /** The array-capable `[style]`, aliased to `style` in the renderer. */
  symbioteStyle?: IStyleProp<IViewStyle>;
  onPress?: IEventHandler;
  onPressIn?: IEventHandler;
  onPressOut?: IEventHandler;
  onPressMove?: IEventHandler;
  onLongPress?: IEventHandler;
  onLayout?: IEventHandler;
  onFocus?: IEventHandler;
  onBlur?: IEventHandler;
}

/** Text's own surface on top of the shared one. `onTextLayout` is an event, so it is not here. */
export interface ITextElementProps {
  numberOfLines?: number;
  ellipsizeMode?: 'head' | 'middle' | 'tail' | 'clip';
  selectable?: boolean;
  adjustsFontSizeToFit?: boolean;
  minimumFontScale?: number;
  allowFontScaling?: boolean;
  maxFontSizeMultiplier?: number | null;
  selectionColor?: string;
  // RN's Text carries it (Text.js) and Button hands it to the label so a screen reader announces
  // the text as disabled along with the button holding it (Button.js:388).
  disabled?: boolean;
}

/** The sticky-header wrapper RN builds in JS (ScrollViewStickyHeader.js). */
export interface IStickyHeaderElementProps {
  inverted?: boolean;
  nextHeaderLayoutY?: number | null;
  scrollAnimatedValue?: unknown;
  scrollViewHeight?: number | null;
}
