// One `@Directive` per intrinsic tag, so an app can hand-write `<view>` / `<text>` /
// `<text-input>` in an ordinary Angular template and have ngtsc check it.
//
// WHY A DIRECTIVE AND NOT A SCHEMA. `CUSTOM_ELEMENTS_SCHEMA` admits an unknown element only when
// the name is a valid CUSTOM ELEMENT name, and the HTML spec requires a HYPHEN — so half our tag
// alphabet (`view`, `text`, `image`, `switch`, `modal`, `pressable`) is NG8001 under it.
// `NO_ERRORS_SCHEMA` compiles them at the cost of every element and property check in the app.
// A matching directive makes the element known with NO schema, and gives strictly MORE than either
// schema ever could: both schemas return `true` for every property on a tag they admit
// (`dom_element_schema_registry.ts:407`, "we don't know which properties a custom element will
// get"), while a declared input has a TYPE. Measured in `bare-intrinsic-tag-aot.test.ts`.
//
// WHY EVERY BOUND PROP MUST BE DECLARED HERE. Matching a directive turns every binding on the tag
// into an input lookup, so a prop this file does not declare is `Can't bind to 'x'` — the cost of
// the route, and the reason the surface below is exhaustive rather than convenient.
//
// WHY THE PROPS ARE FIELDS AND NOT A DERIVED NAME LIST. `@Directive({ inputs: [...SHARED] })`
// compiles fine against a shared const array (measured; `@Directive.inputs` is a mutable-array
// type, so a `readonly`/`as const` array must be spread), and it would have made this file
// nineteen one-liners. It also makes every such input UNTYPED: ngtsc reads an input's type from a
// real class-member declaration node, and a merged `interface X extends IProps {}` — which does
// put the property on the class's TYPE — leaves `<view [testID]="42">` compiling clean. Since the
// type check is the whole reason to prefer this route over `NO_ERRORS_SCHEMA`, the names are
// fields. What is derived is each field's TYPE, indexed off the shared prop interface, so a type
// that changes upstream cannot drift here.
//
// EVENTS ARE NOT DECLARED. `(press)` / `(layout)` on a tag a directive matches still compiles and
// still reaches `Renderer2.listen` -> the engine; an `@Output` would CONSUME the binding the same
// way an `@Input` consumes a prop. Measured both halves — see `elements.test.ts`.
import { Directive, ElementRef, Input, Renderer2, inject } from '@angular/core';
import type { OnChanges, SimpleChanges } from '@angular/core';
import type {
  IActivityIndicatorProps,
  IImageProps,
  INativeFeedbackBackground,
  IInputAccessoryViewViewProps,
  IModalViewProps,
  ISwitchProps,
  ITextInputProps,
} from '@symbiote-native/components';
import type {
  IElementProps,
  IStickyHeaderElementProps,
  ITextElementProps,
} from './element-props';
import type { IAngularImageBackgroundProps } from './components/image-background-props';
// Type-only, so none of these components enters the bundle of an app that writes bare tags.
import type { IAngularPressableProps } from './components/pressable';
import type { IAngularRefreshControlProps } from './components/refresh-control';
import type { IAngularScrollViewProps } from './components/scroll-view';

/**
 * The shared half of every element directive: the prop surface all tags accept, and the ONE
 * generic forward that puts a claimed binding back on the engine node.
 *
 * The forward is the deciding fact of this whole route. A binding claimed by a directive input
 * never reaches `Renderer2.setProperty` on its own — Angular writes it to the directive instance
 * — so without this loop a bare tag commits nothing at all. It stays generic on purpose: per-prop
 * forwarding code is a component wrapper by another name, which is what this migration removes.
 * `renderer.setProperty` lands in the adapter's own renderer, which routes the value through the
 * engine's `routeProp` and applies the `id` -> `nativeID` and `symbioteStyle` -> `style` aliases.
 */
@Directive()
export abstract class SymbioteElement implements OnChanges {
  private readonly renderer = inject(Renderer2);
  private readonly host = inject(ElementRef);

  @Input() testID?: IElementProps['testID'];
  @Input() nativeID?: IElementProps['nativeID'];
  @Input() id?: IElementProps['id'];
  @Input() accessible?: IElementProps['accessible'];
  @Input() accessibilityLabel?: IElementProps['accessibilityLabel'];
  @Input() accessibilityHint?: IElementProps['accessibilityHint'];
  @Input() accessibilityRole?: IElementProps['accessibilityRole'];
  @Input() accessibilityState?: IElementProps['accessibilityState'];
  @Input() accessibilityValue?: IElementProps['accessibilityValue'];
  @Input() accessibilityActions?: IElementProps['accessibilityActions'];
  @Input() accessibilityLabelledBy?: IElementProps['accessibilityLabelledBy'];
  @Input()
  importantForAccessibility?: IElementProps['importantForAccessibility'];
  @Input() accessibilityLiveRegion?: IElementProps['accessibilityLiveRegion'];
  @Input() screenReaderFocusable?: IElementProps['screenReaderFocusable'];
  @Input() accessibilityViewIsModal?: IElementProps['accessibilityViewIsModal'];
  @Input()
  accessibilityElementsHidden?: IElementProps['accessibilityElementsHidden'];
  @Input()
  accessibilityIgnoresInvertColors?: IElementProps['accessibilityIgnoresInvertColors'];
  @Input() accessibilityLanguage?: IElementProps['accessibilityLanguage'];
  @Input()
  accessibilityRespondsToUserInteraction?: IElementProps['accessibilityRespondsToUserInteraction'];
  @Input()
  accessibilityShowsLargeContentViewer?: IElementProps['accessibilityShowsLargeContentViewer'];
  @Input()
  accessibilityLargeContentTitle?: IElementProps['accessibilityLargeContentTitle'];
  @Input() onAccessibilityAction?: IElementProps['onAccessibilityAction'];
  @Input() onAccessibilityTap?: IElementProps['onAccessibilityTap'];
  @Input() onMagicTap?: IElementProps['onMagicTap'];
  @Input() onAccessibilityEscape?: IElementProps['onAccessibilityEscape'];

  // The web aliases. Native reads only `accessibility*`; the engine folds these on the way in.
  @Input() role?: IElementProps['role'];
  @Input() 'aria-label'?: IElementProps['aria-label'];
  @Input() 'aria-labelledby'?: IElementProps['aria-labelledby'];
  @Input() 'aria-live'?: IElementProps['aria-live'];
  @Input() 'aria-hidden'?: IElementProps['aria-hidden'];
  @Input() 'aria-busy'?: IElementProps['aria-busy'];
  @Input() 'aria-checked'?: IElementProps['aria-checked'];
  @Input() 'aria-disabled'?: IElementProps['aria-disabled'];
  @Input() 'aria-expanded'?: IElementProps['aria-expanded'];
  @Input() 'aria-selected'?: IElementProps['aria-selected'];
  @Input() 'aria-modal'?: IElementProps['aria-modal'];
  @Input() 'aria-valuemax'?: IElementProps['aria-valuemax'];
  @Input() 'aria-valuemin'?: IElementProps['aria-valuemin'];
  @Input() 'aria-valuenow'?: IElementProps['aria-valuenow'];
  @Input() 'aria-valuetext'?: IElementProps['aria-valuetext'];

  // The responder gates return a boolean, which an Angular `(event)` binding cannot carry back to
  // the caller — so the whole family is inputs, never outputs.
  @Input()
  onStartShouldSetResponder?: IElementProps['onStartShouldSetResponder'];
  @Input()
  onStartShouldSetResponderCapture?: IElementProps['onStartShouldSetResponderCapture'];
  @Input() onMoveShouldSetResponder?: IElementProps['onMoveShouldSetResponder'];
  @Input()
  onMoveShouldSetResponderCapture?: IElementProps['onMoveShouldSetResponderCapture'];
  @Input() onResponderGrant?: IElementProps['onResponderGrant'];
  @Input() onResponderReject?: IElementProps['onResponderReject'];
  @Input() onResponderStart?: IElementProps['onResponderStart'];
  @Input() onResponderMove?: IElementProps['onResponderMove'];
  @Input() onResponderEnd?: IElementProps['onResponderEnd'];
  @Input() onResponderRelease?: IElementProps['onResponderRelease'];
  @Input() onResponderTerminate?: IElementProps['onResponderTerminate'];
  @Input()
  onResponderTerminationRequest?: IElementProps['onResponderTerminationRequest'];

  @Input() pointerEvents?: IElementProps['pointerEvents'];
  @Input() hitSlop?: IElementProps['hitSlop'];
  @Input() focusable?: IElementProps['focusable'];
  @Input() collapsable?: IElementProps['collapsable'];
  @Input() removeClippedSubviews?: IElementProps['removeClippedSubviews'];
  @Input()
  renderToHardwareTextureAndroid?: IElementProps['renderToHardwareTextureAndroid'];
  @Input() shouldRasterizeIOS?: IElementProps['shouldRasterizeIOS'];
  @Input()
  needsOffscreenAlphaCompositing?: IElementProps['needsOffscreenAlphaCompositing'];
  @Input() symbioteStyle?: IElementProps['symbioteStyle'];

  // The flat-bag spelling of the events below. `(press)` and `[onPress]` are both supported and
  // land in the same place; an app that already holds a handler bag binds the props.
  @Input() onPress?: IElementProps['onPress'];
  @Input() onPressIn?: IElementProps['onPressIn'];
  @Input() onPressOut?: IElementProps['onPressOut'];
  @Input() onPressMove?: IElementProps['onPressMove'];
  @Input() onLongPress?: IElementProps['onLongPress'];
  @Input() onLayout?: IElementProps['onLayout'];
  @Input() onFocus?: IElementProps['onFocus'];
  @Input() onBlur?: IElementProps['onBlur'];

  ngOnChanges(changes: SimpleChanges): void {
    for (const name of Object.keys(changes)) {
      this.renderer.setProperty(
        this.host.nativeElement,
        name,
        changes[name]?.currentValue,
      );
    }
  }
}

@Directive({ selector: 'view', standalone: true })
export class ViewElement extends SymbioteElement {}

@Directive({ selector: 'pressable', standalone: true })
export class PressableElement extends SymbioteElement {
  @Input() disabled?: IAngularPressableProps['disabled'];
  @Input() cancelable?: IAngularPressableProps['cancelable'];
  @Input() delayLongPress?: IAngularPressableProps['delayLongPress'];
  @Input() delayHoverIn?: IAngularPressableProps['delayHoverIn'];
  @Input() delayHoverOut?: IAngularPressableProps['delayHoverOut'];
  @Input() onHoverIn?: IAngularPressableProps['onHoverIn'];
  @Input() onHoverOut?: IAngularPressableProps['onHoverOut'];
  @Input()
  pressRetentionOffset?: IAngularPressableProps['pressRetentionOffset'];
  @Input() unstable_pressDelay?: IAngularPressableProps['unstable_pressDelay'];
  @Input() android_ripple?: IAngularPressableProps['android_ripple'];
  @Input()
  android_disableSound?: IAngularPressableProps['android_disableSound'];
  @Input() hasTVPreferredFocus?: IAngularPressableProps['hasTVPreferredFocus'];
  @Input() nextFocusDown?: IAngularPressableProps['nextFocusDown'];
  @Input() nextFocusForward?: IAngularPressableProps['nextFocusForward'];
  @Input() nextFocusLeft?: IAngularPressableProps['nextFocusLeft'];
  @Input() nextFocusRight?: IAngularPressableProps['nextFocusRight'];
  @Input() nextFocusUp?: IAngularPressableProps['nextFocusUp'];
}

// RN's TouchableOpacity is a Pressable that also fades, and both halves are on the engine node —
// so it takes the same inputs and adds only the fade's own knob.
@Directive({ selector: 'touchable-opacity', standalone: true })
export class TouchableOpacityElement extends PressableElement {
  @Input() activeOpacity?: number;
  @Input() delayPressIn?: number;
  @Input() delayPressOut?: number;
  @Input() minPressDuration?: number;
}

// RN's TouchableHighlight is a Pressable that swaps its own background while pressed
// (TouchableHighlight.js), and the underlay machine runs on the engine node — so the tag takes the
// press surface plus the two knobs that describe the underlay. `onShowUnderlay`/`onHideUnderlay`
// need no @Input: they are events, bound as `(showUnderlay)` through the renderer's own listen.
@Directive({ selector: 'touchable-highlight', standalone: true })
export class TouchableHighlightElement extends PressableElement {
  @Input() activeOpacity?: number;
  @Input() underlayColor?: string;
  @Input() delayPressIn?: number;
  @Input() delayPressOut?: number;
  @Input() minPressDuration?: number;
}

// RN's TouchableNativeFeedback is a Pressable that CLONES onto its single child instead of
// rendering anything (TouchableNativeFeedback.js:339) — so the tag takes the press surface plus the
// two props that pick the Android ripple drawable. The tag itself commits no native view; the
// behavior configures the child, which is why `elements.test.ts` reads it as an anchor.
@Directive({ selector: 'touchable-native-feedback', standalone: true })
export class TouchableNativeFeedbackElement extends PressableElement {
  @Input() background?: INativeFeedbackBackground;
  @Input() useForeground?: boolean;
}

// RN's TouchableWithoutFeedback clones onto its single child the same way
// (TouchableWithoutFeedback.js:286) and installs no drawable, so it takes the press surface plus the
// three timing knobs it forwards to Pressability (:186-190) and nothing else. Like the tag above it
// commits no native view; `elements.test.ts` reads it as an anchor.
@Directive({ selector: 'touchable-without-feedback', standalone: true })
export class TouchableWithoutFeedbackElement extends PressableElement {
  @Input() delayPressIn?: number;
  @Input() delayPressOut?: number;
  @Input() minPressDuration?: number;
}

// RN's Button IS a TouchableOpacity (Button.js:384), and the behavior builds the view and the
// label under it — so the tag takes the touchable's surface plus the four props Button owns. There
// is no `style`: RN's Button has no such prop, and the label/background come from `color`.
@Directive({ selector: 'button', standalone: true })
export class ButtonElement extends TouchableOpacityElement {
  @Input() title?: string;
  @Input() color?: string;
  @Input() touchSoundDisabled?: boolean;
}

@Directive({ selector: 'text', standalone: true })
export class TextElement extends SymbioteElement {
  @Input() numberOfLines?: ITextElementProps['numberOfLines'];
  @Input() ellipsizeMode?: ITextElementProps['ellipsizeMode'];
  @Input() selectable?: ITextElementProps['selectable'];
  @Input() adjustsFontSizeToFit?: ITextElementProps['adjustsFontSizeToFit'];
  @Input() minimumFontScale?: ITextElementProps['minimumFontScale'];
  @Input() allowFontScaling?: ITextElementProps['allowFontScaling'];
  @Input() maxFontSizeMultiplier?: ITextElementProps['maxFontSizeMultiplier'];
  @Input() selectionColor?: ITextElementProps['selectionColor'];
  @Input() disabled?: ITextElementProps['disabled'];
}

@Directive({ selector: 'image', standalone: true })
export class ImageElement extends SymbioteElement {
  @Input() source?: IImageProps['source'];
  @Input() src?: IImageProps['src'];
  @Input() srcSet?: IImageProps['srcSet'];
  @Input() alt?: IImageProps['alt'];
  @Input() width?: IImageProps['width'];
  @Input() height?: IImageProps['height'];
  @Input() resizeMode?: IImageProps['resizeMode'];
  @Input() resizeMethod?: IImageProps['resizeMethod'];
  @Input() defaultSource?: IImageProps['defaultSource'];
  @Input() loadingIndicatorSource?: IImageProps['loadingIndicatorSource'];
  @Input() blurRadius?: IImageProps['blurRadius'];
  @Input() capInsets?: IImageProps['capInsets'];
  @Input() crossOrigin?: IImageProps['crossOrigin'];
  @Input() referrerPolicy?: IImageProps['referrerPolicy'];
  @Input() fadeDuration?: IImageProps['fadeDuration'];
  @Input()
  progressiveRenderingEnabled?: IImageProps['progressiveRenderingEnabled'];
  @Input() tintColor?: IImageProps['tintColor'];
  @Input() onLoad?: IImageProps['onLoad'];
  @Input() onLoadStart?: IImageProps['onLoadStart'];
  @Input() onLoadEnd?: IImageProps['onLoadEnd'];
  @Input() onError?: IImageProps['onError'];
  @Input() onProgress?: IImageProps['onProgress'];
  @Input() onPartialLoad?: IImageProps['onPartialLoad'];
}

// The box, not the image. Every Image prop below rides the engine's `slotPropsExcept` redirect onto
// the absolutely-filled image the behavior builds, exactly as RN's own `...props` spread does
// (ImageBackground.js:81) — so this directive declares them to make the BINDING legal, and the
// engine decides which node each lands on.
@Directive({ selector: 'image-background', standalone: true })
export class ImageBackgroundElement extends SymbioteElement {
  @Input() imageStyle?: IAngularImageBackgroundProps['imageStyle'];
  @Input() source?: IImageProps['source'];
  @Input() src?: IImageProps['src'];
  @Input() srcSet?: IImageProps['srcSet'];
  @Input() alt?: IImageProps['alt'];
  @Input() width?: IImageProps['width'];
  @Input() height?: IImageProps['height'];
  @Input() resizeMode?: IImageProps['resizeMode'];
  @Input() resizeMethod?: IImageProps['resizeMethod'];
  @Input() defaultSource?: IImageProps['defaultSource'];
  @Input() loadingIndicatorSource?: IImageProps['loadingIndicatorSource'];
  @Input() blurRadius?: IImageProps['blurRadius'];
  @Input() capInsets?: IImageProps['capInsets'];
  @Input() crossOrigin?: IImageProps['crossOrigin'];
  @Input() referrerPolicy?: IImageProps['referrerPolicy'];
  @Input() fadeDuration?: IImageProps['fadeDuration'];
  @Input()
  progressiveRenderingEnabled?: IImageProps['progressiveRenderingEnabled'];
  @Input() tintColor?: IImageProps['tintColor'];
  @Input() onLoad?: IImageProps['onLoad'];
  @Input() onLoadStart?: IImageProps['onLoadStart'];
  @Input() onLoadEnd?: IImageProps['onLoadEnd'];
  @Input() onError?: IImageProps['onError'];
  @Input() onProgress?: IImageProps['onProgress'];
  @Input() onPartialLoad?: IImageProps['onPartialLoad'];
}

@Directive({ selector: 'scroll-view', standalone: true })
export class ScrollViewElement extends SymbioteElement {
  @Input() horizontal?: IAngularScrollViewProps['horizontal'];
  @Input() scrollEnabled?: IAngularScrollViewProps['scrollEnabled'];
  @Input() scrollEventThrottle?: IAngularScrollViewProps['scrollEventThrottle'];
  @Input()
  contentContainerStyle?: IAngularScrollViewProps['contentContainerStyle'];
  @Input() contentInset?: IAngularScrollViewProps['contentInset'];
  @Input()
  contentInsetAdjustmentBehavior?: IAngularScrollViewProps['contentInsetAdjustmentBehavior'];
  @Input() contentOffset?: IAngularScrollViewProps['contentOffset'];
  @Input()
  scrollIndicatorInsets?: IAngularScrollViewProps['scrollIndicatorInsets'];
  @Input()
  showsHorizontalScrollIndicator?: IAngularScrollViewProps['showsHorizontalScrollIndicator'];
  @Input()
  showsVerticalScrollIndicator?: IAngularScrollViewProps['showsVerticalScrollIndicator'];
  @Input()
  alwaysBounceHorizontal?: IAngularScrollViewProps['alwaysBounceHorizontal'];
  @Input()
  alwaysBounceVertical?: IAngularScrollViewProps['alwaysBounceVertical'];
  @Input() bounces?: IAngularScrollViewProps['bounces'];
  @Input() bouncesZoom?: IAngularScrollViewProps['bouncesZoom'];
  @Input() centerContent?: IAngularScrollViewProps['centerContent'];
  @Input() decelerationRate?: IAngularScrollViewProps['decelerationRate'];
  @Input()
  directionalLockEnabled?: IAngularScrollViewProps['directionalLockEnabled'];
  @Input()
  disableIntervalMomentum?: IAngularScrollViewProps['disableIntervalMomentum'];
  @Input() endFillColor?: IAngularScrollViewProps['endFillColor'];
  @Input() fadingEdgeLength?: IAngularScrollViewProps['fadingEdgeLength'];
  @Input() indicatorStyle?: IAngularScrollViewProps['indicatorStyle'];
  @Input() invertStickyHeaders?: IAngularScrollViewProps['invertStickyHeaders'];
  @Input() keyboardDismissMode?: IAngularScrollViewProps['keyboardDismissMode'];
  @Input()
  keyboardShouldPersistTaps?: IAngularScrollViewProps['keyboardShouldPersistTaps'];
  @Input()
  automaticallyAdjustKeyboardInsets?: IAngularScrollViewProps['automaticallyAdjustKeyboardInsets'];
  @Input()
  maintainVisibleContentPosition?: IAngularScrollViewProps['maintainVisibleContentPosition'];
  @Input() maximumZoomScale?: IAngularScrollViewProps['maximumZoomScale'];
  @Input() minimumZoomScale?: IAngularScrollViewProps['minimumZoomScale'];
  @Input() zoomScale?: IAngularScrollViewProps['zoomScale'];
  @Input() nestedScrollEnabled?: IAngularScrollViewProps['nestedScrollEnabled'];
  @Input() overScrollMode?: IAngularScrollViewProps['overScrollMode'];
  @Input() pagingEnabled?: IAngularScrollViewProps['pagingEnabled'];
  @Input() persistentScrollbar?: IAngularScrollViewProps['persistentScrollbar'];
  @Input() pinchGestureEnabled?: IAngularScrollViewProps['pinchGestureEnabled'];
  @Input() snapToAlignment?: IAngularScrollViewProps['snapToAlignment'];
  @Input() snapToEnd?: IAngularScrollViewProps['snapToEnd'];
  @Input() snapToInterval?: IAngularScrollViewProps['snapToInterval'];
  @Input() snapToOffsets?: IAngularScrollViewProps['snapToOffsets'];
  @Input() snapToStart?: IAngularScrollViewProps['snapToStart'];
  @Input() stickyHeaderIndices?: IAngularScrollViewProps['stickyHeaderIndices'];
  @Input() onScroll?: IAngularScrollViewProps['onScroll'];
  @Input() onScrollBeginDrag?: IAngularScrollViewProps['onScrollBeginDrag'];
  @Input() onScrollEndDrag?: IAngularScrollViewProps['onScrollEndDrag'];
  @Input()
  onMomentumScrollBegin?: IAngularScrollViewProps['onMomentumScrollBegin'];
  @Input() onMomentumScrollEnd?: IAngularScrollViewProps['onMomentumScrollEnd'];
  @Input() onScrollToTop?: IAngularScrollViewProps['onScrollToTop'];
  @Input() onContentSizeChange?: IAngularScrollViewProps['onContentSizeChange'];
}

@Directive({ selector: 'horizontal-scroll-view', standalone: true })
export class HorizontalScrollViewElement extends ScrollViewElement {}

@Directive({ selector: 'scroll-content', standalone: true })
export class ScrollContentElement extends SymbioteElement {}

@Directive({ selector: 'horizontal-scroll-content', standalone: true })
export class HorizontalScrollContentElement extends SymbioteElement {}

@Directive({ selector: 'text-input', standalone: true })
export class TextInputElement extends SymbioteElement {
  @Input() value?: ITextInputProps['value'];
  @Input() defaultValue?: ITextInputProps['defaultValue'];
  @Input() placeholder?: ITextInputProps['placeholder'];
  @Input() placeholderTextColor?: ITextInputProps['placeholderTextColor'];
  @Input() multiline?: ITextInputProps['multiline'];
  @Input() numberOfLines?: ITextInputProps['numberOfLines'];
  @Input() maxLength?: ITextInputProps['maxLength'];
  @Input() editable?: ITextInputProps['editable'];
  @Input() readOnly?: ITextInputProps['readOnly'];
  @Input() autoFocus?: ITextInputProps['autoFocus'];
  @Input() autoCapitalize?: ITextInputProps['autoCapitalize'];
  @Input() autoComplete?: ITextInputProps['autoComplete'];
  @Input() autoCorrect?: ITextInputProps['autoCorrect'];
  @Input() blurOnSubmit?: ITextInputProps['blurOnSubmit'];
  @Input() submitBehavior?: ITextInputProps['submitBehavior'];
  @Input() cursorColor?: ITextInputProps['cursorColor'];
  @Input() enterKeyHint?: ITextInputProps['enterKeyHint'];
  @Input() returnKeyType?: ITextInputProps['returnKeyType'];
  @Input() inputMode?: ITextInputProps['inputMode'];
  @Input() keyboardType?: ITextInputProps['keyboardType'];
  @Input() inputAccessoryViewID?: ITextInputProps['inputAccessoryViewID'];
  @Input() scrollEnabled?: ITextInputProps['scrollEnabled'];
  @Input() secureTextEntry?: ITextInputProps['secureTextEntry'];
  @Input() selectTextOnFocus?: ITextInputProps['selectTextOnFocus'];
  @Input() selection?: ITextInputProps['selection'];
  @Input() selectionColor?: ITextInputProps['selectionColor'];
  @Input() selectionHandleColor?: ITextInputProps['selectionHandleColor'];
  @Input() showSoftInputOnFocus?: ITextInputProps['showSoftInputOnFocus'];
  @Input() textAlign?: ITextInputProps['textAlign'];
  @Input() textContentType?: ITextInputProps['textContentType'];
  @Input() underlineColorAndroid?: ITextInputProps['underlineColorAndroid'];
  @Input() onValueChange?: ITextInputProps['onValueChange'];
  @Input() onContentSizeChange?: ITextInputProps['onContentSizeChange'];
  @Input() onEndEditing?: ITextInputProps['onEndEditing'];
  @Input() onKeyPress?: ITextInputProps['onKeyPress'];
  @Input() onSelectionChange?: ITextInputProps['onSelectionChange'];
  @Input() onSubmitEditing?: ITextInputProps['onSubmitEditing'];
}

@Directive({ selector: 'text-input-multiline', standalone: true })
export class MultilineTextInputElement extends TextInputElement {}

// The COMPONENT path's spelling of the pair above — same native views, a tag the behavior registry
// deliberately does not carry (`component-names/shared.ts`). Declared so the tag alphabet is
// complete; an app writes the plain name.
@Directive({ selector: 'text-input-managed', standalone: true })
export class ManagedTextInputElement extends TextInputElement {}

@Directive({ selector: 'text-input-multiline-managed', standalone: true })
export class ManagedMultilineTextInputElement extends TextInputElement {}

@Directive({ selector: 'switch', standalone: true })
export class SwitchElement extends SymbioteElement {
  @Input() value?: ISwitchProps['value'];
  @Input() disabled?: ISwitchProps['disabled'];
  @Input() trackColor?: ISwitchProps['trackColor'];
  @Input() thumbColor?: ISwitchProps['thumbColor'];
  @Input() ios_backgroundColor?: ISwitchProps['ios_backgroundColor'];
  @Input() onValueChange?: ISwitchProps['onValueChange'];
}

@Directive({ selector: 'switch-managed', standalone: true })
export class ManagedSwitchElement extends SwitchElement {}

// The HOST — RN's centering RCTView (ActivityIndicator.js:112), which is the tag an app writes.
// The four spinner props are declared here because that is where the app writes them; the engine's
// behavior redirects them onto the spinner it builds underneath (`slotProps`).
@Directive({ selector: 'activity-indicator', standalone: true })
export class ActivityIndicatorElement extends SymbioteElement {
  @Input() animating?: IActivityIndicatorProps['animating'];
  @Input() color?: IActivityIndicatorProps['color'];
  @Input() size?: IActivityIndicatorProps['size'];
  @Input() hidesWhenStopped?: IActivityIndicatorProps['hidesWhenStopped'];
}

// The native spinner. Built by the behavior's `buildStructure` and by the wrapper's render fn, never
// written in an app template — declared only so the tag alphabet stays covered, the same as
// `scroll-content`.
@Directive({ selector: 'activity-indicator-spinner', standalone: true })
export class ActivityIndicatorSpinnerElement extends ActivityIndicatorElement {}

@Directive({ selector: 'safe-area-view', standalone: true })
export class SafeAreaViewElement extends SymbioteElement {}

@Directive({ selector: 'modal', standalone: true })
export class ModalElement extends SymbioteElement {
  @Input() visible?: IModalViewProps['visible'];
  @Input() transparent?: IModalViewProps['transparent'];
  @Input() animationType?: IModalViewProps['animationType'];
  @Input() presentationStyle?: IModalViewProps['presentationStyle'];
  @Input() supportedOrientations?: IModalViewProps['supportedOrientations'];
  @Input() hardwareAccelerated?: IModalViewProps['hardwareAccelerated'];
  @Input() statusBarTranslucent?: IModalViewProps['statusBarTranslucent'];
  @Input()
  navigationBarTranslucent?: IModalViewProps['navigationBarTranslucent'];
  @Input() allowSwipeDismissal?: IModalViewProps['allowSwipeDismissal'];
  @Input() backdropColor?: IModalViewProps['backdropColor'];
}

@Directive({ selector: 'refresh-control', standalone: true })
export class RefreshControlElement extends SymbioteElement {
  @Input() refreshing?: IAngularRefreshControlProps['refreshing'];
  @Input() enabled?: IAngularRefreshControlProps['enabled'];
  @Input() colors?: IAngularRefreshControlProps['colors'];
  @Input() tintColor?: IAngularRefreshControlProps['tintColor'];
  @Input() title?: IAngularRefreshControlProps['title'];
  @Input() titleColor?: IAngularRefreshControlProps['titleColor'];
  @Input() size?: IAngularRefreshControlProps['size'];
  @Input()
  progressBackgroundColor?: IAngularRefreshControlProps['progressBackgroundColor'];
  @Input()
  progressViewOffset?: IAngularRefreshControlProps['progressViewOffset'];
  @Input() onRefresh?: IAngularRefreshControlProps['onRefresh'];
}

@Directive({ selector: 'sticky-header', standalone: true })
export class StickyHeaderElement extends SymbioteElement {
  @Input() inverted?: IStickyHeaderElementProps['inverted'];
  @Input() nextHeaderLayoutY?: IStickyHeaderElementProps['nextHeaderLayoutY'];
  @Input()
  scrollAnimatedValue?: IStickyHeaderElementProps['scrollAnimatedValue'];
  @Input() scrollViewHeight?: IStickyHeaderElementProps['scrollViewHeight'];
}

@Directive({ selector: 'input-accessory-view', standalone: true })
export class InputAccessoryViewElement extends SymbioteElement {
  @Input() backgroundColor?: IInputAccessoryViewViewProps['backgroundColor'];
}

/**
 * Every element directive, as ONE symbol an app puts in `imports`. Angular flattens a nested array
 * there, so the line does not grow as the tag alphabet does — and a per-component `imports` line is
 * the floor for standalone components whatever we ship (there is no global-import mechanism, by
 * design: angular/angular#43784).
 *
 * `elements.test.ts` asserts this covers every key of `COMPONENT_DESCRIPTORS`, derived from that
 * table, so a future primitive joins by existing rather than by someone remembering.
 */
export const SYMBIOTE_ELEMENTS = [
  ViewElement,
  PressableElement,
  TouchableOpacityElement,
  TouchableHighlightElement,
  TouchableNativeFeedbackElement,
  TouchableWithoutFeedbackElement,
  ButtonElement,
  TextElement,
  ImageElement,
  ImageBackgroundElement,
  ScrollViewElement,
  HorizontalScrollViewElement,
  ScrollContentElement,
  HorizontalScrollContentElement,
  TextInputElement,
  MultilineTextInputElement,
  ManagedTextInputElement,
  ManagedMultilineTextInputElement,
  SwitchElement,
  ManagedSwitchElement,
  ActivityIndicatorElement,
  ActivityIndicatorSpinnerElement,
  SafeAreaViewElement,
  ModalElement,
  RefreshControlElement,
  StickyHeaderElement,
  InputAccessoryViewElement,
] as const;

// A prop this file forgets is not a silent gap — it is `Can't bind to 'x'` in the app that tries
// it, which is the failure mode a hand-written list produces here. So the lists are checked
// against the prop TYPES rather than trusted: each assertion below resolves to `true` only when
// the directive declares every key of its interface, and otherwise fails with the missing NAMES in
// the message. It runs under `tsc --build`, which is what makes it a guard rather than a comment.
//
// `style` is excluded everywhere on purpose (see `element-props.ts` for why `[style]` stays with
// Angular's styling engine); `passthrough` and `StickyHeaderComponent` are internal render inputs
// of a composed component, never props of a native view.
type IMissingInputs<TProps, TDirective, TIgnored extends PropertyKey = never> =
  Exclude<keyof TProps, keyof TDirective | TIgnored> extends never
    ? true
    : Exclude<keyof TProps, keyof TDirective | TIgnored>;

const DECLARES_EVERY_PROP: {
  view: IMissingInputs<IElementProps, ViewElement>;
  pressable: IMissingInputs<IAngularPressableProps, PressableElement, 'style'>;
  text: IMissingInputs<ITextElementProps, TextElement>;
  image: IMissingInputs<IImageProps, ImageElement, 'style'>;
  imageBackground: IMissingInputs<
    IAngularImageBackgroundProps,
    ImageBackgroundElement,
    'style'
  >;
  scrollView: IMissingInputs<
    IAngularScrollViewProps,
    ScrollViewElement,
    'style' | 'StickyHeaderComponent'
  >;
  textInput: IMissingInputs<ITextInputProps, TextInputElement, 'style'>;
  switch: IMissingInputs<ISwitchProps, SwitchElement, 'style'>;
  activityIndicator: IMissingInputs<
    IActivityIndicatorProps,
    ActivityIndicatorElement,
    'style'
  >;
  modal: IMissingInputs<IModalViewProps, ModalElement, 'style' | 'passthrough'>;
  refreshControl: IMissingInputs<
    IAngularRefreshControlProps,
    RefreshControlElement,
    'style'
  >;
  stickyHeader: IMissingInputs<IStickyHeaderElementProps, StickyHeaderElement>;
  inputAccessoryView: IMissingInputs<
    IInputAccessoryViewViewProps,
    InputAccessoryViewElement,
    'style' | 'passthrough'
  >;
} = {
  view: true,
  pressable: true,
  text: true,
  image: true,
  imageBackground: true,
  scrollView: true,
  textInput: true,
  switch: true,
  activityIndicator: true,
  modal: true,
  refreshControl: true,
  stickyHeader: true,
  inputAccessoryView: true,
};
void DECLARES_EVERY_PROP;
