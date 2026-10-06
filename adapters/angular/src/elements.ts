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
import { SymbioteCallbackHost } from './callback-host';
import { withholdFromRuntimeMatching } from './runtime-matching';
import type {
  IActivityIndicatorProps,
  IImageProps,
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
import type { ICheckboxProps } from './components/checkbox-props';
import type { IAngularImageBackgroundProps } from './components/image-background-props';
import type { IAngularPressableProps } from './components/pressable-props';
import type {
  IAngularTouchableHighlightProps,
  IAngularTouchableOpacityProps,
} from './components/touchable-props';
// Type-only, so none of these components enters the bundle of an app that writes bare tags.
import type { IAngularRefreshControlProps } from './components/refresh-control-props';
import type { IAngularScrollViewProps } from './components/scroll-view-props';
import { SymbioteElement } from './element-base';
import {
  ButtonElement,
  CheckboxElement,
  PressableElement,
  TextElement,
  TouchableHighlightElement,
  TouchableNativeFeedbackElement,
  TouchableOpacityElement,
  TouchableWithoutFeedbackElement,
  ViewElement,
} from './elements-press';
import {
  HorizontalScrollContentElement,
  HorizontalScrollViewElement,
  ImageBackgroundElement,
  ImageElement,
  ScrollContentElement,
  ScrollViewElement,
} from './elements-layout';
import {
  ActivityIndicatorElement,
  ActivityIndicatorSpinnerElement,
  InputAccessoryViewElement,
  ModalElement,
  MultilineTextInputElement,
  RefreshControlElement,
  SafeAreaViewElement,
  StickyHeaderElement,
  SwitchElement,
  SwitchValueAccessor,
  TextInputElement,
  TextInputValueAccessor,
} from './elements-controls';

// Классы живут в соседних модулях по ответственности, этот файл остаётся их единой точкой входа
export {
  ActivityIndicatorElement,
  ActivityIndicatorSpinnerElement,
  ButtonElement,
  CheckboxElement,
  HorizontalScrollContentElement,
  HorizontalScrollViewElement,
  ImageBackgroundElement,
  ImageElement,
  InputAccessoryViewElement,
  ModalElement,
  MultilineTextInputElement,
  PressableElement,
  RefreshControlElement,
  SafeAreaViewElement,
  ScrollContentElement,
  ScrollViewElement,
  StickyHeaderElement,
  SwitchElement,
  SwitchValueAccessor,
  SymbioteElement,
  TextElement,
  TextInputElement,
  TextInputValueAccessor,
  TouchableHighlightElement,
  TouchableNativeFeedbackElement,
  TouchableOpacityElement,
  TouchableWithoutFeedbackElement,
  ViewElement,
};

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
  CheckboxElement,
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
  checkbox: IMissingInputs<
    ICheckboxProps,
    CheckboxElement,
    keyof IElementProps
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
  checkbox: true,
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
