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
// `style` and `styleProp` are TWO bindings. `[style]` is Angular's styling binding: an object or CSS
// string, as on a DOM element, unclaimed because a claim is a directive instance per element. An RN
// array or press-state callback throws in that engine, so it travels as `[styleProp]`.
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

/**
 * What `[style]` carries on a tag: Angular's own styling binding, decomposed key by key into
 * `Renderer2.setStyle` exactly as on a DOM element. A style OBJECT or a CSS string - never an array
 * or a function, which that engine cannot represent. Those are `[styleProp]`.
 */
export type IAngularStyleBinding<TStyle> = TStyle | string | null | undefined;

/** RN's full StyleProp, press-state callback included: the `[styleProp]` binding. */
export type IElementStyleProp =
  IStyleProp<IViewStyle> | ((state: IPressState) => IStyleProp<IViewStyle>);

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
  style?: IAngularStyleBinding<IViewStyle>;
  /**
   * An RN StyleProp as ONE property binding: arrays, falsy entries, and the press-state callback.
   * The callback is in the union because a subclass cannot widen an inherited property and
   * `<pressable>`/`<touchable-*>` are the tags that take one; on every other tag the engine resolves
   * it at `pressed: false`.
   */
  styleProp?: IElementStyleProp;
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
  style?: IAngularStyleBinding<ITextStyle>;
  styleProp?: IStyleProp<ITextStyle>;
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
