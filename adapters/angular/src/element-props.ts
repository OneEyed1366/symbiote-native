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
// `style` IS declared, reversing what this comment said until 2026-09-11. Leaving it to Angular's
// styling engine was not the conservative choice it reads as: an array decomposes into
// numeric-index keys there and a press-state CALLBACK throws out of `toStylingKeyValueArray`,
// aborting the enclosing template update — which is what an app writes, and what every deleted
// wrapper component accepted. The claim that a directive can reclaim it "solely by executing a
// linked AOT artifact" was answered rather than assumed: `elements.test.ts` compiles the binding
// through real ngtsc and runs the LINKED output. See `SymbioteElement.style`.
//
// `symbioteStyle` stays as an alias — it is public API and the renderer still folds it.
import type {
  IAccessibilityProps,
  IAriaProps,
  IPressState,
  IRectOffset,
  IResponderProps,
} from '@symbiote-native/components';
import type {
  ISymbioteEvent,
  IStyleProp,
  ITextStyle,
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
  /**
   * RN's own spelling. The press-state callback is in the union because a subclass cannot widen an
   * inherited property and `<pressable>`/`<touchable-*>` are the tags that take one; on every other
   * tag the engine resolves it at `pressed: false`.
   */
  style?:
    IStyleProp<IViewStyle> | ((state: IPressState) => IStyleProp<IViewStyle>);
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
  /** Narrows the shared `style` so `fontSize` / `fontWeight` type-check on a `<text>`. */
  style?: IStyleProp<ITextStyle>;
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
