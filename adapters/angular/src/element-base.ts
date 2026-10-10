import {
  ChangeDetectorRef,
  Directive,
  ElementRef,
  ErrorHandler,
  Input,
  Renderer2,
  inject,
} from '@angular/core';
import type {
  OnChanges,
  OnDestroy,
  OnInit,
  SimpleChanges,
} from '@angular/core';
import { VALUE_CHANGE_EVENT } from './renderer/value-change';
import {
  registerViewFlush,
  unregisterViewFlush,
} from './change-detection-flush';
import type { IElementProps } from './element-props';

/**
 * The shared half of every element directive: the prop surface all tags accept, and the ONE
 * generic forward that puts a claimed binding back on the engine node.
 *
 * The forward is the deciding fact of this whole route. A binding claimed by a directive input
 * never reaches `Renderer2.setProperty` on its own — Angular writes it to the directive instance
 * — so without this loop a bare tag commits nothing at all. It stays generic on purpose: per-prop
 * forwarding code is a component wrapper by another name, which is what this migration removes.
 * `renderer.setProperty` lands in the adapter's own renderer, which routes the value through the
 * engine's `routeProp` and applies the `id` -> `nativeID` alias.
 */
@Directive()
export abstract class SymbioteElement implements OnChanges {
  private readonly renderer = inject(Renderer2);
  protected readonly host = inject(ElementRef);

  // NO `ChangeDetectorRef` HERE, and its absence is the point. This class is instantiated once per
  // ELEMENT, so injecting one cost ~1.0-2.4 us on every tag of a screen to serve the few that carry
  // an `on*` prop — ten thousand `ViewRef`s on a thousand-row create, read by none of them
  // (`core/engine/cpp/tests/js/angular-directive-cost.itest.ts`). `SymbioteCallbackHost` owns one and
  // MATCHES on the callback attributes instead, registering it against the node; `markViewFor` is how
  // the wrapper reaches it. The inputs did not move, so nothing about this file's public surface did.

  // No `on*` wrapper here: `SymbioteRenderer.setProperty` handles it. Most directives are withheld
  // from runtime matching (`./runtime-matching`), so a binding reaches the renderer through
  // `ɵɵproperty` without passing through any directive — the renderer is reached by every path.

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
  @Input()
  experimental_accessibilityOrder?: IElementProps['experimental_accessibilityOrder'];
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
  @Input() onTouchStart?: IElementProps['onTouchStart'];
  @Input() onTouchStartCapture?: IElementProps['onTouchStartCapture'];
  @Input() onTouchMove?: IElementProps['onTouchMove'];
  @Input() onTouchMoveCapture?: IElementProps['onTouchMoveCapture'];
  @Input() onTouchEnd?: IElementProps['onTouchEnd'];
  @Input() onTouchEndCapture?: IElementProps['onTouchEndCapture'];
  @Input() onTouchCancel?: IElementProps['onTouchCancel'];
  @Input() onTouchCancelCapture?: IElementProps['onTouchCancelCapture'];
  @Input() onFocusCapture?: IElementProps['onFocusCapture'];
  @Input() onBlurCapture?: IElementProps['onBlurCapture'];
  @Input() onClickCapture?: IElementProps['onClickCapture'];
  @Input() onKeyDown?: IElementProps['onKeyDown'];
  @Input() onKeyDownCapture?: IElementProps['onKeyDownCapture'];
  @Input() onKeyUp?: IElementProps['onKeyUp'];
  @Input() onKeyUpCapture?: IElementProps['onKeyUpCapture'];

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
  // `[style]` and `[class]` are declared for the TYPE CHECK only. Withheld from run-time matching, no
  // input claims them, so Angular's own styling engine decomposes them into `setStyle`/`addClass`
  // exactly as on a DOM element - which is why `style` is typed as the object/string that engine can
  // hold. An RN style ARRAY or press-state FUNCTION throws in there ("indexOf is not a function",
  // "Unsupported styling type: function"), so it is `[styleProp]`: an ordinary property binding the
  // renderer routes to `style` whole. A claim would cost a directive instance per element.
  //
  // The press-state callback rides the BASE type rather than `PressableElement` alone: a subclass
  // cannot widen an inherited property, and only the pressables have a `pressed` to read — so on
  // any other tag the engine resolves it at `pressed: false`.
  @Input() style?: IElementProps['style'];
  @Input() styleProp?: IElementProps['styleProp'];

  // `ɵɵclassMap` hands over a string after joining any static `class=` prefix; `[class.foo]` and
  // `[ngClass]` arrive as `addClass`. The renderer unions both sources (`classStringFor`).
  @Input() class?: string;

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
        // Unwrapped on purpose: `SymbioteRenderer.setProperty` is where an `on*` value is wrapped
        // now, and it is the call this line makes.
        changes[name]?.currentValue,
      );
    }
  }
}

/**
 * The base for a tag whose app callback an engine behavior READS BACK inside the same microtask
 * turn — `<text-input>`, `<switch>`, `<refresh-control>`. Zoneless change detection is a macrotask,
 * so without this the behavior sees the PRE-event value and undoes the user; the full mechanism,
 * and why this is `detectChanges()` on one view rather than `ApplicationRef.tick()`, is in
 * `./change-detection-flush`.
 *
 * The directive is the only thing in the adapter that owns a `ChangeDetectorRef` for the view
 * holding the binding, so it hands one to the renderer keyed on its own node.
 */
@Directive()
export abstract class ReadBackElement
  extends SymbioteElement
  implements OnDestroy
{
  // ITS OWN, now that the base has none. Three tags reach this class, so the injection is paid where
  // it is read instead of on every element of a screen.
  private readonly detector = inject(ChangeDetectorRef);
  private readonly errorHandler = inject(ErrorHandler);

  constructor() {
    super();
    const node: unknown = this.host.nativeElement;
    if (typeof node === 'object' && node !== null) {
      registerViewFlush(node, () => this.flush());
    }
  }

  // REPORTED, NOT RETHROWN — Angular's own contract. Every other change detection runs inside
  // `ApplicationRef.tick()`, caught by `ErrorHandler` (`SymbioteErrorHandler`); this flush instead
  // runs from a native event dispatch, where an uncaught throw has nowhere to go but `RCTFatal`.
  private flush(): void {
    try {
      this.detector.detectChanges();
    } catch (error: unknown) {
      this.errorHandler.handleError(error);
    }
  }

  ngOnDestroy(): void {
    const node: unknown = this.host.nativeElement;
    if (typeof node === 'object' && node !== null) unregisterViewFlush(node);
  }
}

/**
 * The `[(value)]` half of a controlled tag — `<switch>` and `<text-input>`.
 *
 * The one `@Output` in this file, and it is FORCED rather than chosen. `[(value)]` desugars to
 * `[value]` + `(valueChange)`, and ngtsc requires both halves to resolve to the SAME target: a
 * declared `value` input beside an event no directive claims is NG8007, "the property and event
 * halves are not bound to the same target". So the sugar this adapter documents cannot work without
 * the output existing, whatever the file header says about events in general.
 *
 * The bridge below is NOT what makes the binding work today, and the comment says so because the
 * obvious reading is wrong: the file header's "an `@Output` CONSUMES the binding" holds for a
 * COMPONENT, and an element is the other case — Angular attaches the renderer listener for the
 * event as well, so `Renderer2.listen` still runs and the engine still hears the change. Measured
 * under JIT by deleting this whole hook: every case in `renderer/two-way-value.test.ts` stayed
 * green, delivery included, and exactly ONCE (nothing double-fires when both paths exist).
 *
 * It is kept because the measurement is JIT-only and this adapter has a recorded case of JIT and
 * AOT resolving a binding differently (`test-harness-false-greens.md` §21). If AOT routes the event
 * exclusively to the output, this hook is the only thing keeping `[(value)]` alive; if it routes to
 * both, it is one extra listener on a control an app explicitly bound. Delete it once something
 * executes the LINKED artifact and shows the renderer listener is attached there too.
 *
 * Opened only when something is SUBSCRIBED: the prop's PRESENCE is what a behavior reads to decide
 * it is controlled, so a `<switch>` given a handler nobody asked for changes how it snaps back.
 * `.observed` is readable from `ngOnInit` because Angular subscribes outputs in the creation pass,
 * before the update pass runs the hook — observed directly (true for the two bound tags, false for
 * an unbound one), not assumed.
 */
@Directive()
export abstract class ValueChangeElement
  extends ReadBackElement
  implements OnInit, OnDestroy
{
  private readonly valueRenderer = inject(Renderer2);
  private readonly valueHost = inject(ElementRef);
  private unlistenValue?: () => void;

  /** `this.valueChange.observed` — the subclass owns the emitter so its payload type stays exact. */
  protected abstract hasValueSubscriber(): boolean;

  /** Narrows the engine's unwrapped value to the type THIS tag emits, then emits it. */
  protected abstract emitValue(value: unknown): void;

  ngOnInit(): void {
    if (!this.hasValueSubscriber()) return;
    this.unlistenValue = this.valueRenderer.listen(
      this.valueHost.nativeElement,
      VALUE_CHANGE_EVENT,
      (value: unknown) => {
        this.emitValue(value);
      },
    );
  }

  override ngOnDestroy(): void {
    super.ngOnDestroy();
    this.unlistenValue?.();
  }
}
