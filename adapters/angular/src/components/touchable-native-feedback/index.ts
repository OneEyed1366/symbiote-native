// TouchableNativeFeedback: the Angular lifecycle half. Android's ripple / state-drawable
// touchable, built on Pressable like the rest of the family. RN realizes its feedback by cloning
// the child into an RCTView carrying native ripple props; we instead nest the child under a
// feedback <symbiote-view> that carries those props (nativeBackgroundAndroid /
// nativeForegroundAndroid), inside a <Pressable> that owns the press wiring. The native props are
// read by Android's ReactViewManager; on iOS they are inert, so the child still renders with
// working press wiring. The static factories + background mapping are shared in
// @symbiote-native/components and reused verbatim. One Fabric path both platforms, so this stays
// a flat single file, mirroring React/Vue.
//
// This component's own press/hover events are real @Output() EventEmitters too, matching
// Pressable (which it wraps) — `(press)="press.emit($event)"`, never `[onPress]="onPress"`. The
// a11y identity bag + the four a11y events live on the feedback view — the one host intrinsic here
// — folded through the shared resolveAccessibilityProps and routed through emit() on the (event)
// channel (Angular blocks [onX] property bindings on host elements). disabled folds into the a11y
// state via resolveDisabledAccessibilityState, exactly as Pressable does for its own host.

import {
  CUSTOM_ELEMENTS_SCHEMA,
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  EventEmitter,
  computed,
  inject,
  Input,
  Output,
  signal,
  type DoCheck,
  type OnChanges,
} from '@angular/core';
import {
  backgroundProps,
  canUseNativeForeground,
  resolveAccessibilityProps,
  resolveDisabledAccessibilityState,
  rippleBackground,
  selectableBackground,
  selectableBackgroundBorderless,
  type IAccessibilityProps,
  type IAccessibilityStateValue,
  type IAriaProps,
  type INativeFeedbackBackground,
  type IPressableAndroidRippleConfig,
  type IRectOffset,
} from '@symbiote-native/components';
import {
  dlog,
  isSymbioteEvent,
  type ISymbioteEvent,
} from '@symbiote-native/engine';
import {
  anchorHostStyle,
  SymbioteHostPropsDirective,
  ViewHost,
} from '../../primitives';
import { Pressable, type IAngularPressableInputs } from '../pressable';

export type {
  INativeFeedbackBackground,
  IThemeAttrBackground,
  IRippleBackground,
} from '@symbiote-native/components';

// Mirrors React's ITouchableNativeFeedbackProps (Omit<IPressableProps, 'style'> + the native
// feedback config) minus children (Angular takes children via <ng-content>) and minus the press/
// hover events (declared as this component's OWN @Output()s below). Declared per-adapter over the
// shared Pressable INPUT surface.
export type IAngularTouchableNativeFeedbackProps = Omit<
  IAngularPressableInputs,
  'style'
> & {
  background?: INativeFeedbackBackground;
  useForeground?: boolean;
};

@Component({
  selector: 'TouchableNativeFeedback',
  standalone: true,
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
  imports: [Pressable, ViewHost, SymbioteHostPropsDirective],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <Pressable
      (press)="press.emit($event)"
      (pressIn)="pressIn.emit($event)"
      (pressOut)="pressOut.emit($event)"
      (pressMove)="pressMove.emit($event)"
      (longPress)="longPress.emit($event)"
      (hoverIn)="hoverIn.emit($event)"
      (hoverOut)="hoverOut.emit($event)"
      [delayLongPress]="delayLongPress"
      [delayHoverIn]="delayHoverIn"
      [delayHoverOut]="delayHoverOut"
      [disabled]="disabled"
      [cancelable]="cancelable"
      [hitSlop]="hitSlop"
      [pressRetentionOffset]="pressRetentionOffset"
      [unstable_pressDelay]="unstable_pressDelay"
      [android_ripple]="android_ripple"
      [android_disableSound]="android_disableSound"
    >
      <symbiote-view
        [symbioteHostProps]="hostProps()"
        (accessibilityAction)="emit(accessibilityAction, $event)"
        (accessibilityTap)="emit(accessibilityTap, $event)"
        (magicTap)="emit(magicTap, $event)"
        (accessibilityEscape)="emit(accessibilityEscape, $event)"
      >
        <ng-content></ng-content>
      </symbiote-view>
    </Pressable>
  `,
})
export class TouchableNativeFeedback
  implements IAngularTouchableNativeFeedbackProps, OnChanges, DoCheck
{
  // The static helpers are pure config-dict producers; they live as members on the component class
  // so callers reach them as `TouchableNativeFeedback.Ripple(...)`, exactly like RN.
  static readonly SelectableBackground = selectableBackground;
  static readonly SelectableBackgroundBorderless =
    selectableBackgroundBorderless;
  static readonly Ripple = rippleBackground;
  static readonly canUseNativeForeground = canUseNativeForeground;

  @Output() readonly press = new EventEmitter<ISymbioteEvent>();
  @Output() readonly pressIn = new EventEmitter<ISymbioteEvent>();
  @Output() readonly pressOut = new EventEmitter<ISymbioteEvent>();
  @Output() readonly pressMove = new EventEmitter<ISymbioteEvent>();
  @Output() readonly longPress = new EventEmitter<ISymbioteEvent>();
  @Output() readonly hoverIn = new EventEmitter<ISymbioteEvent>();
  @Output() readonly hoverOut = new EventEmitter<ISymbioteEvent>();
  @Output() readonly accessibilityAction = new EventEmitter<ISymbioteEvent>();
  @Output() readonly accessibilityTap = new EventEmitter<ISymbioteEvent>();
  @Output() readonly magicTap = new EventEmitter<ISymbioteEvent>();
  @Output() readonly accessibilityEscape = new EventEmitter<ISymbioteEvent>();
  @Input() background?: INativeFeedbackBackground;
  @Input() useForeground?: boolean;
  @Input() delayLongPress?: number;
  @Input() delayHoverIn?: number;
  @Input() delayHoverOut?: number;
  @Input() disabled?: boolean;
  @Input() cancelable?: boolean;
  @Input() hitSlop?: IRectOffset;
  @Input() pressRetentionOffset?: IRectOffset;
  @Input() unstable_pressDelay?: number;
  @Input() android_ripple?: IPressableAndroidRippleConfig;
  @Input() android_disableSound?: boolean;
  @Input() testID?: string;
  @Input() nativeID?: string;
  @Input() accessible?: boolean;
  @Input() accessibilityLabel?: string;
  @Input() accessibilityHint?: string;
  @Input() accessibilityRole?: IAccessibilityProps['accessibilityRole'];
  @Input() accessibilityState?: IAccessibilityStateValue;
  @Input() accessibilityValue?: IAccessibilityProps['accessibilityValue'];
  @Input() accessibilityActions?: IAccessibilityProps['accessibilityActions'];
  @Input() accessibilityLabelledBy?: string | string[];
  @Input()
  importantForAccessibility?: IAccessibilityProps['importantForAccessibility'];
  @Input()
  accessibilityLiveRegion?: IAccessibilityProps['accessibilityLiveRegion'];
  @Input() screenReaderFocusable?: boolean;
  @Input() accessibilityViewIsModal?: boolean;
  @Input() accessibilityElementsHidden?: boolean;
  @Input() accessibilityIgnoresInvertColors?: boolean;
  @Input() accessibilityLanguage?: string;
  @Input() accessibilityRespondsToUserInteraction?: boolean;
  @Input() accessibilityShowsLargeContentViewer?: boolean;
  @Input() accessibilityLargeContentTitle?: string;
  @Input() role?: IAriaProps['role'];
  @Input('aria-label') ariaLabel?: string;
  @Input('aria-labelledby') ariaLabelledBy?: string;
  @Input('aria-live') ariaLive?: IAriaProps['aria-live'];
  @Input('aria-hidden') ariaHidden?: boolean;
  @Input('aria-busy') ariaBusy?: boolean;
  @Input('aria-checked') ariaChecked?: boolean | 'mixed';
  @Input('aria-disabled') ariaDisabled?: boolean;
  @Input('aria-expanded') ariaExpanded?: boolean;
  @Input('aria-selected') ariaSelected?: boolean;
  @Input('aria-modal') ariaModal?: boolean;
  @Input('aria-valuemax') ariaValueMax?: number;
  @Input('aria-valuemin') ariaValueMin?: number;
  @Input('aria-valuenow') ariaValueNow?: number;
  @Input('aria-valuetext') ariaValueText?: string;

  // This component's OWN host — the non-painting anchor `class="..."` at the use site resolves
  // onto (see anchorHostStyle's doc comment) — NOT the feedback <symbiote-view> one level down.
  // TouchableNativeFeedback has no explicit `style`/`class`-forwarding @Input() of its own (RN's
  // TouchableNativeFeedback takes none either — style/class always came from the child), so the
  // anchor's class-derived style is the ONLY style source for hostProps.style below.
  private readonly elementRef = inject(ElementRef);

  // Bridges the non-reactive @Input fields above into the reactive graph, so the computed() bag
  // below can memoize a value derived from them. Signal inputs would make this unnecessary, but
  // `input()` is visible only to the AOT compiler and this package's unit suite runs on JIT - see
  // the `angular-adapter-change-detection` skill, §6. Mirrors ScrollView's identical bridge
  // (components/scroll-view/shared.ts), including its constraint: ONLY safe for a bag whose every
  // dependency is an @Input or carries its own signal, never for plain internal mutable state.
  private readonly inputsRevision = signal(0);

  // The anchor's class-derived style is hostProps' one dependency that is NOT an @Input:
  // `class="..."`/`[class.x]`/`[ngClass]` at the use site resolves through the renderer's
  // addClass/removeClass onto the anchor node (anchorHostStyle's doc comment), so it never appears
  // in SimpleChanges and ngOnChanges cannot cover it. The engine's commitClassStyle allocates a
  // fresh [classStyle, explicitStyle] array on exactly the passes where a class token actually
  // moved, so signal.set's own Object.is check makes an unchanged poll a no-op that dirties nothing.
  private readonly anchorStyle = signal<unknown>(undefined);

  // ngDoCheck is the only hook that observes the anchor AFTER the parent wrote it. Angular flushes
  // a node's pre-order hooks at the next `advance` PAST it (hooks.ts callHooks runs "until that
  // node index exclusive") or in refreshView's post-template flush - both strictly after the
  // parent's classProp on this element, and strictly before this component's own view refreshes.
  // Angular also nulls the active consumer around lifecycle hooks (render3/hooks.ts), so this
  // write registers no dependency on the caller's view and cannot throw NG0600.
  ngDoCheck(): void {
    this.anchorStyle.set(anchorHostStyle(this.elementRef));
  }

  ngOnChanges(): void {
    // Tells the computed bag below that an @Input moved - plain class fields are not reactive on
    // their own. Must stay in ngOnChanges: that is the single moment Angular has finished writing
    // every changed input for this pass.
    this.inputsRevision.update(revision => revision + 1);
    dlog(
      `TouchableNativeFeedback render ${this.resolvedBackground.type} useForeground ${this.useForeground === true}`,
    );
  }

  // RN defaults a missing background to SelectableBackground() so the touchable always shows
  // feedback; mirror that here.
  private get resolvedBackground(): INativeFeedbackBackground {
    return this.background ?? selectableBackground();
  }

  // backgroundProps picks the foreground slot only where the platform supports it, else the
  // background slot (canUseNativeForeground) — shared with React/Vue. One side is always undefined.
  get feedback(): Record<string, INativeFeedbackBackground> {
    return backgroundProps(
      this.resolvedBackground,
      this.useForeground === true,
    );
  }

  // Assembles the SAME resolved values the template used to bind one-by-one into a single
  // flat bag for `[symbioteHostProps]` (Renderer2.setProperty per key) — see primitives/shared.ts.
  //
  // MEASURED 2026-08-16: as a getter this rebuilt the bag on every refresh of this view, and a
  // press dirties this very view (SymbioteHostPropsDirective wraps each flat-bag onX with
  // markForCheck), so `[symbioteHostProps]`'s reference check failed every time and re-pushed
  // every key through Renderer2.setProperty -> routeProp for an identical bag. Memoized, an
  // unchanged bag costs one reference compare. Every dependency below is either an @Input (covered
  // by inputsRevision) or the anchor style (covered by its own signal) - nothing here reads plain
  // internal mutable state, which is what makes memoizing this one safe.
  readonly hostProps = computed<Record<string, unknown>>(() => {
    this.inputsRevision();
    return {
      nativeBackgroundAndroid: this.feedback['nativeBackgroundAndroid'],
      nativeForegroundAndroid: this.feedback['nativeForegroundAndroid'],
      style: this.anchorStyle(),
      testID: this.testID,
      nativeID: this.nativeID,
      accessible: this.accessible,
      ...this.folded,
    };
  });

  // Forward an engine event to the matching @Output(), narrowing the template's untyped $event.
  emit(emitter: EventEmitter<ISymbioteEvent>, event: unknown): void {
    if (isSymbioteEvent(event)) emitter.emit(event);
  }

  // Fold the web aria-*/role aliases into the canonical accessibility* props once per render, so the
  // host never sees an aria-* key (native ignores them), and merge `disabled` into the a11y state
  // (resolveDisabledAccessibilityState) the same way Pressable does for its own host.
  get folded(): Partial<IAngularTouchableNativeFeedbackProps> {
    return resolveAccessibilityProps({
      accessibilityLabel: this.accessibilityLabel,
      accessibilityHint: this.accessibilityHint,
      accessibilityRole: this.accessibilityRole,
      accessibilityState: resolveDisabledAccessibilityState(
        this.accessibilityState,
        this.disabled,
      ),
      accessibilityValue: this.accessibilityValue,
      accessibilityActions: this.accessibilityActions,
      accessibilityLabelledBy: this.accessibilityLabelledBy,
      importantForAccessibility: this.importantForAccessibility,
      accessibilityLiveRegion: this.accessibilityLiveRegion,
      screenReaderFocusable: this.screenReaderFocusable,
      accessibilityViewIsModal: this.accessibilityViewIsModal,
      accessibilityElementsHidden: this.accessibilityElementsHidden,
      accessibilityIgnoresInvertColors: this.accessibilityIgnoresInvertColors,
      accessibilityLanguage: this.accessibilityLanguage,
      accessibilityRespondsToUserInteraction:
        this.accessibilityRespondsToUserInteraction,
      accessibilityShowsLargeContentViewer:
        this.accessibilityShowsLargeContentViewer,
      accessibilityLargeContentTitle: this.accessibilityLargeContentTitle,
      role: this.role,
      'aria-label': this.ariaLabel,
      'aria-labelledby': this.ariaLabelledBy,
      'aria-live': this.ariaLive,
      'aria-hidden': this.ariaHidden,
      'aria-busy': this.ariaBusy,
      'aria-checked': this.ariaChecked,
      'aria-disabled': this.ariaDisabled,
      'aria-expanded': this.ariaExpanded,
      'aria-selected': this.ariaSelected,
      'aria-modal': this.ariaModal,
      'aria-valuemax': this.ariaValueMax,
      'aria-valuemin': this.ariaValueMin,
      'aria-valuenow': this.ariaValueNow,
      'aria-valuetext': this.ariaValueText,
    });
  }
}
