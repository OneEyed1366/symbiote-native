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
// way an `@Input` consumes a prop. Measured both halves — see `elements.test.ts`. The cost is that
// `$event` types as the DOM `Event` there, since ngtsc falls back to the DOM schema for an event no
// directive claims; the typed spelling of the same handler is the flat-bag `@Input` beside it
// (`[onPressMove]="fn"`, where `fn` keeps its `ISymbioteEvent` parameter).
//
// `valueChange` is the ONE exception, and it is forced rather than chosen: see ValueChangeElement.
import { Directive, Input } from '@angular/core';
import { SymbioteCallbackHost } from './callback-host';
import { withholdFromRuntimeMatching } from './runtime-matching';
import { ReadBackElement, SymbioteElement } from './element-base';
import {
  MultilineTextInputElement,
  SwitchElement,
  SwitchValueAccessor,
  TextInputElement,
  TextInputValueAccessor,
} from './elements-controlled';
import {
  ButtonElement,
  PressableElement,
  TouchableHighlightElement,
  TouchableNativeFeedbackElement,
  TouchableOpacityElement,
  TouchableWithoutFeedbackElement,
} from './elements-touchable';
import {
  HorizontalScrollContentElement,
  HorizontalScrollViewElement,
  ScrollContentElement,
  ScrollViewElement,
} from './elements-scroll';
import type {
  IActivityIndicatorProps,
  IImageProps,
  IInputAccessoryViewViewProps,
  ILayoutConformanceMode,
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
import type { IAngularPressableProps } from './components/pressable-props';
import type {
  IAngularTouchableHighlightProps,
  IAngularTouchableOpacityProps,
} from './components/touchable-props';
// Type-only, so none of these components enters the bundle of an app that writes bare tags.
import type { IAngularRefreshControlProps } from './components/refresh-control-props';
import type { IAngularScrollViewProps } from './components/scroll-view-props';

// Defined in sibling files for size, re-exported so this stays the one place an app imports from
export {
  ButtonElement,
  HorizontalScrollContentElement,
  HorizontalScrollViewElement,
  MultilineTextInputElement,
  PressableElement,
  ScrollContentElement,
  ScrollViewElement,
  SwitchElement,
  SwitchValueAccessor,
  SymbioteElement,
  TextInputElement,
  TextInputValueAccessor,
  TouchableHighlightElement,
  TouchableNativeFeedbackElement,
  TouchableOpacityElement,
  TouchableWithoutFeedbackElement,
};

// BOTH SPELLINGS ON THE SEVEN DASHLESS TAGS, and it is a correctness fix rather than a convenience.
//
// The renderer has always mapped `symbiote-view` onto `view` (`PRIMITIVE_SELECTOR_ALIAS`), because
// `CUSTOM_ELEMENTS_SCHEMA` admits an unknown element only when the name carries a hyphen — so the
// hyphenated form is the spelling an app WITHOUT these directives has to use. It is the same tag and
// commits the same node.
//
// It was not the same tag HERE. A selector of `view` alone meant an app that imports
// `SYMBIOTE_ELEMENTS` and writes `<symbiote-view>` matched nothing: no type check on its props, no
// declared inputs, none of `SymbioteElement`'s forwarding or callback wrapping — silently, with the
// tree still looking right. Measured, that shape also ran ~8.6 us per element FASTER, which is what
// made it look like an optimization instead of a hole (`angular-directive-cost.itest.ts`).
//
// Only the seven dashless tags need it: `hyphenatedIntrinsicAliases` skips any tag that already
// carries a dash, so `symbiote-scroll-view` resolves nowhere on either side and the two halves agree
// already.
@Directive({ selector: 'view, symbiote-view', standalone: true })
export class ViewElement extends SymbioteElement {}

@Directive({ selector: 'text, symbiote-text', standalone: true })
export class TextElement extends SymbioteElement {
  // Narrows the inherited input to a TEXT style so `fontSize`/`fontWeight` type-check here. The
  // initializer is what TS2612 asks for to accept a redeclaration as deliberate; `declare` would
  // be the other answer and cannot carry a decorator.
  @Input() override style?: ITextElementProps['style'] = undefined;
  @Input() override styleProp?: ITextElementProps['styleProp'] = undefined;
  @Input() numberOfLines?: ITextElementProps['numberOfLines'];
  @Input() ellipsizeMode?: ITextElementProps['ellipsizeMode'];
  @Input() selectable?: ITextElementProps['selectable'];
  @Input() adjustsFontSizeToFit?: ITextElementProps['adjustsFontSizeToFit'];
  @Input() minimumFontScale?: ITextElementProps['minimumFontScale'];
  @Input() allowFontScaling?: ITextElementProps['allowFontScaling'];
  @Input() maxFontSizeMultiplier?: ITextElementProps['maxFontSizeMultiplier'];
  @Input() selectionColor?: ITextElementProps['selectionColor'];
  @Input() disabled?: ITextElementProps['disabled'];
  @Input() dynamicTypeRamp?: ITextElementProps['dynamicTypeRamp'];
  @Input() lineBreakStrategyIOS?: ITextElementProps['lineBreakStrategyIOS'];
  @Input() lineBreakMode?: ITextElementProps['lineBreakMode'];
  @Input() textBreakStrategy?: ITextElementProps['textBreakStrategy'];
  @Input() dataDetectorType?: ITextElementProps['dataDetectorType'];
  @Input()
  android_hyphenationFrequency?: ITextElementProps['android_hyphenationFrequency'];
}

@Directive({ selector: 'image, symbiote-image', standalone: true })
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

// RN's `experimental_LayoutConformance`: the tag paints as `display: contents` through its fold
@Directive({ selector: 'layout-conformance', standalone: true })
export class LayoutConformanceElement extends SymbioteElement {
  @Input() mode?: ILayoutConformanceMode;
}

@Directive({ selector: 'modal, symbiote-modal', standalone: true })
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
export class RefreshControlElement extends ReadBackElement {
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
  SwitchElement,
  ActivityIndicatorElement,
  ActivityIndicatorSpinnerElement,
  SafeAreaViewElement,
  LayoutConformanceElement,
  ModalElement,
  RefreshControlElement,
  StickyHeaderElement,
  InputAccessoryViewElement,
  // Not tags — the `[(ngModel)]` / `formControl*` accessors for the two controlled ones. They ride
  // this list so an app that already imports it keeps the forms integration the deleted wrappers
  // provided, and `elements.test.ts` subtracts them from its tag-coverage check by name.
  TextInputValueAccessor,
  SwitchValueAccessor,
  // Also not a tag: it matches on the callback ATTRIBUTES, so it lands only on the elements that
  // bind one and carries the `ChangeDetectorRef` their wrapper needs. It rides this list for the same
  // reason the accessors do, and `elements.test.ts` subtracts it from the tag-coverage check by name.
  SymbioteCallbackHost,
] as const;

// THE DIRECTIVES THAT GO ON MATCHING, and the list is the exceptions rather than the rule.
//
// EVERY TAG DIRECTIVE IS WITHHELD. Each is `@Input()` declarations over one inherited `ngOnChanges`
// forwarding to the renderer (the call `ɵɵproperty` makes directly on an unclaimed element), so the
// instance bought a compile-time check at ~8 us of run time per element.
//
// The read-back tags (text-input, text-input-multiline, switch, refresh-control) need a synchronous
// view flush; the renderer marks them at creation and the flush finds their view lazily
// (`change-detection-flush.ts`). `[(value)]` reaches the renderer's `listen('valueChange')` bridge.
//
// `[style]`/`[class]` stay unclaimed as on a DOM element (see `SymbioteElement.style`). What still
// matches is selected on an ATTRIBUTE an app writes: the two form accessors and
// `SymbioteCallbackHost`.
withholdFromRuntimeMatching(
  SYMBIOTE_ELEMENTS.filter(
    directive =>
      directive !== TextInputValueAccessor &&
      directive !== SwitchValueAccessor &&
      directive !== SymbioteCallbackHost,
  ),
);

// A prop this file forgets is not a silent gap — it is `Can't bind to 'x'` in the app that tries
// it, which is the failure mode a hand-written list produces here. So the lists are checked
// against the prop TYPES rather than trusted: each assertion below resolves to `true` only when
// the directive declares every key of its interface, and otherwise fails with the missing NAMES in
// the message. It runs under `tsc --build`, which is what makes it a guard rather than a comment.
//
// `style` used to be excluded from every row; it is checked like any other prop now that the base
// declares it. `passthrough` and `StickyHeaderComponent` are internal render inputs of a composed
// component, never props of a native view.
type IMissingInputs<TProps, TDirective, TIgnored extends PropertyKey = never> =
  Exclude<keyof TProps, keyof TDirective | TIgnored> extends never
    ? true
    : Exclude<keyof TProps, keyof TDirective | TIgnored>;

const DECLARES_EVERY_PROP: {
  view: IMissingInputs<IElementProps, ViewElement>;
  pressable: IMissingInputs<IAngularPressableProps, PressableElement>;
  // The two touchables inherit `PressableElement`, so the rows above would pass whatever these
  // declared — what they pin is the per-touchable surface (`activeOpacity`, `underlayColor`, the
  // three timing knobs).
  touchableOpacity: IMissingInputs<
    IAngularTouchableOpacityProps,
    TouchableOpacityElement
  >;
  touchableHighlight: IMissingInputs<
    IAngularTouchableHighlightProps,
    TouchableHighlightElement
  >;
  text: IMissingInputs<ITextElementProps, TextElement>;
  image: IMissingInputs<IImageProps, ImageElement>;
  imageBackground: IMissingInputs<
    IAngularImageBackgroundProps,
    ImageBackgroundElement
  >;
  scrollView: IMissingInputs<
    IAngularScrollViewProps,
    ScrollViewElement,
    'StickyHeaderComponent'
  >;
  textInput: IMissingInputs<ITextInputProps, TextInputElement>;
  switch: IMissingInputs<ISwitchProps, SwitchElement>;
  activityIndicator: IMissingInputs<
    IActivityIndicatorProps,
    ActivityIndicatorElement
  >;
  modal: IMissingInputs<IModalViewProps, ModalElement, 'passthrough'>;
  refreshControl: IMissingInputs<
    IAngularRefreshControlProps,
    RefreshControlElement
  >;
  stickyHeader: IMissingInputs<IStickyHeaderElementProps, StickyHeaderElement>;
  inputAccessoryView: IMissingInputs<
    IInputAccessoryViewViewProps,
    InputAccessoryViewElement,
    'passthrough'
  >;
} = {
  view: true,
  pressable: true,
  touchableOpacity: true,
  touchableHighlight: true,
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
