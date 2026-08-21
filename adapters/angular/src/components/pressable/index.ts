import {
  CUSTOM_ELEMENTS_SCHEMA,
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  ElementRef,
  EventEmitter,
  computed,
  inject,
  Input,
  Output,
  signal,
  ViewChild,
  type DoCheck,
  type OnChanges,
} from '@angular/core';
import {
  createPressHandlers,
  createPressRuntime,
  DEFAULT_DELAY_LONG_PRESS_MS,
  isTerminationAllowed,
  resolveAccessibilityProps,
  resolveDisabledAccessibilityState,
  rippleProps,
  shouldClaimResponder,
  shouldSuppressPress,
  type IAccessibilityProps,
  type IAccessibilityStateValue,
  type IAriaProps,
  type IPressableAndroidRippleConfig,
  type IPressHandler,
  type IPressHost,
  type IPressMachineConfig,
  type IPressRuntime,
  type IPressState,
  type IRectOffset,
} from '@symbiote-native/components';
import {
  dlog,
  isSymbioteNode,
  measure,
  type ISymbioteEvent,
  type ISymbioteNode,
  type IStyleProp,
  type IViewStyle,
} from '@symbiote-native/engine';
import {
  anchorHostStyle,
  SymbioteHostPropsDirective,
  SymbioteStyleInputDirective,
  ViewHost,
} from '../../primitives';

export type {
  IPressState,
  IPressableAndroidRippleConfig,
} from '@symbiote-native/components';

// The full logical Pressable surface, callback-shaped press/hover events included. Touchable* and
// TouchableNativeFeedback still take their OWN onPress/onPressIn/... as @Input() callbacks (that is
// a separate, not-yet-converted decision) and derive their public prop types from this - so it keeps
// the callback fields even though the Pressable component below no longer implements them directly.
export interface IAngularPressableProps
  extends IAccessibilityProps, IAriaProps {
  onPress?: IPressHandler;
  onPressIn?: IPressHandler;
  onPressOut?: IPressHandler;
  onPressMove?: IPressHandler;
  onLongPress?: IPressHandler;
  delayLongPress?: number;
  disabled?: boolean;
  cancelable?: boolean;
  hitSlop?: IRectOffset;
  pressRetentionOffset?: IRectOffset;
  unstable_pressDelay?: number;
  android_ripple?: IPressableAndroidRippleConfig;
  android_disableSound?: boolean;
  onHoverIn?: IPressHandler;
  onHoverOut?: IPressHandler;
  delayHoverIn?: number;
  delayHoverOut?: number;
  testID?: string;
  nativeID?: string;
  hasTVPreferredFocus?: boolean;
  nextFocusDown?: number;
  nextFocusForward?: number;
  nextFocusLeft?: number;
  nextFocusRight?: number;
  nextFocusUp?: number;
  style?:
    IStyleProp<IViewStyle> | ((state: IPressState) => IStyleProp<IViewStyle>);
}

// What the Pressable component itself takes as plain @Input()s: the full surface minus the press/
// hover events and the four accessibility callbacks, all of which it exposes as real @Output()
// EventEmitters instead (see the class below) - the one place in the family where the
// callback-vs-EventEmitter tradeoff is actually fixed.
export type IAngularPressableInputs = Omit<
  IAngularPressableProps,
  | 'onPress'
  | 'onPressIn'
  | 'onPressOut'
  | 'onPressMove'
  | 'onLongPress'
  | 'onHoverIn'
  | 'onHoverOut'
  | 'onAccessibilityAction'
  | 'onAccessibilityTap'
  | 'onMagicTap'
  | 'onAccessibilityEscape'
>;

function isStyleFn(
  value: unknown,
): value is (state: IPressState) => IStyleProp<IViewStyle> {
  return typeof value === 'function';
}

function asSymbioteEvent(event: unknown): ISymbioteEvent | undefined {
  return typeof event === 'object' && event !== null && 'nativeEvent' in event
    ? (event as ISymbioteEvent)
    : undefined;
}

@Component({
  selector: 'Pressable, symbiote-pressable',
  standalone: true,
  hostDirectives: [
    { directive: SymbioteStyleInputDirective, inputs: ['style'] },
  ],
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
  imports: [ViewHost, SymbioteHostPropsDirective],
  template: `
    <symbiote-view
      #host
      [symbioteHostProps]="hostProps()"
      (accessibilityAction)="emit(accessibilityAction, $event)"
      (accessibilityTap)="emit(accessibilityTap, $event)"
      (magicTap)="emit(magicTap, $event)"
      (accessibilityEscape)="emit(accessibilityEscape, $event)"
      (press)="handlePress($event)"
      (pressIn)="handlePressIn($event)"
      (pressOut)="handlePressOut($event)"
      (responderMove)="handleResponderMove($event)"
      (startShouldSetResponder)="claimResponder()"
      (responderTerminationRequest)="allowTermination()"
    >
      <ng-content></ng-content>
    </symbiote-view>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Pressable implements IAngularPressableInputs, OnChanges, DoCheck {
  // The press/hover lifecycle as real Angular events: `(press)="onTap($event)"`, not
  // `[onPress]="onTap"`. createPressHandlers still wants plain IPressHandler callbacks, so
  // emitterHandler() below adapts each EventEmitter into one - only while something is actually
  // subscribed (`.observed`), so an unbound onLongPress still skips arming the timer, exactly as
  // the old @Input()-absent case did.
  @Output() readonly press = new EventEmitter<ISymbioteEvent>();
  @Output() readonly pressIn = new EventEmitter<ISymbioteEvent>();
  @Output() readonly pressOut = new EventEmitter<ISymbioteEvent>();
  @Output() readonly pressMove = new EventEmitter<ISymbioteEvent>();
  @Output() readonly longPress = new EventEmitter<ISymbioteEvent>();
  @Output() readonly hoverIn = new EventEmitter<ISymbioteEvent>();
  @Output() readonly hoverOut = new EventEmitter<ISymbioteEvent>();
  // The four accessibility callbacks as real Angular events too, same tradeoff as press/hover
  // above: `(accessibilityAction)="emit(accessibilityAction, $event)"`, not
  // `[onAccessibilityAction]="onAccessibilityAction"`.
  @Output() readonly accessibilityAction = new EventEmitter<ISymbioteEvent>();
  @Output() readonly accessibilityTap = new EventEmitter<ISymbioteEvent>();
  @Output() readonly magicTap = new EventEmitter<ISymbioteEvent>();
  @Output() readonly accessibilityEscape = new EventEmitter<ISymbioteEvent>();
  @Input() delayLongPress?: number;
  @Input() disabled?: boolean;
  @Input() cancelable?: boolean;
  @Input() hitSlop?: IRectOffset;
  @Input() pressRetentionOffset?: IRectOffset;
  @Input() unstable_pressDelay?: number;
  @Input() android_ripple?: IPressableAndroidRippleConfig;
  @Input() android_disableSound?: boolean;
  @Input() delayHoverIn?: number;
  @Input() delayHoverOut?: number;
  @Input() testID?: string;
  @Input() nativeID?: string;
  @Input() hasTVPreferredFocus?: boolean;
  @Input() nextFocusDown?: number;
  @Input() nextFocusForward?: number;
  @Input() nextFocusLeft?: number;
  @Input() nextFocusRight?: number;
  @Input() nextFocusUp?: number;
  @Input() style?: IAngularPressableProps['style'];
  @Input() accessible?: boolean;
  @Input() accessibilityLabel?: string;
  @Input() accessibilityHint?: string;
  @Input() accessibilityRole?: IAngularPressableProps['accessibilityRole'];
  @Input() accessibilityState?: IAccessibilityStateValue;
  @Input() accessibilityValue?: IAngularPressableProps['accessibilityValue'];
  @Input()
  accessibilityActions?: IAngularPressableProps['accessibilityActions'];
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
  @Input() ariaLabel?: string;
  @Input() ariaBusy?: boolean;
  @Input() ariaChecked?: boolean | 'mixed';
  @Input() ariaDisabled?: boolean;
  @Input() ariaExpanded?: boolean;
  @Input() ariaHidden?: boolean;
  @Input() ariaLabelledBy?: string;
  @Input() ariaLive?: IAriaProps['aria-live'];
  @Input() ariaSelected?: boolean;
  @Input() ariaModal?: boolean;
  @Input() ariaValueMax?: number;
  @Input() ariaValueMin?: number;
  @Input() ariaValueNow?: number;
  @Input() ariaValueText?: string;
  @Input() id?: string;
  @Input() role?: IAngularPressableProps['role'];

  @ViewChild('host', { read: ElementRef })
  private hostElement?: ElementRef<unknown>;

  // INTERNAL mutable state, driven by the press machine rather than by an @Input, so ngOnChanges
  // can never cover it - it carries its OWN signal, which is what lets the memoized bag below stay
  // correct across a press. Exposed as a plain boolean getter so a use site's `#ref.pressed` keeps
  // reading a boolean and the public surface is unchanged.
  private readonly pressedState = signal(false);

  get pressed(): boolean {
    return this.pressedState();
  }

  private readonly runtime: IPressRuntime = createPressRuntime();
  private readonly host: IPressHost = {
    setPressed: pressed => {
      this.pressedState.set(pressed);
      this.changeDetector.detectChanges();
    },
    getMeasureFn: () => {
      const node = this.hostNode;
      if (node === undefined) return undefined;
      return callback => measure(node, callback);
    },
    schedule: (callback, ms) => {
      const id = setTimeout(callback, ms);
      return () => clearTimeout(id);
    },
  };

  private readonly changeDetector = inject(ChangeDetectorRef);
  // This component's OWN host - the non-painting anchor `class="..."` at the use site resolves
  // onto (see anchorHostStyle's doc comment) - NOT `hostElement` above, which targets the real
  // inner `symbiote-view` one level down.
  private readonly elementRef = inject(ElementRef);

  // Bridges the non-reactive @Input fields above into the reactive graph, so the computed() bag
  // below can memoize a value derived from them. Signal inputs would make this unnecessary, but
  // `input()` is visible only to the AOT compiler and this package's unit suite runs on JIT - see
  // the `angular-adapter-change-detection` skill, §6. Mirrors ScrollView's identical bridge
  // (components/scroll-view/shared.ts), including its constraint: ONLY safe for a bag whose every
  // dependency is an @Input or carries its own signal, never for plain internal mutable state.
  private readonly inputsRevision = signal(0);

  // The anchor's class-derived style is the one hostProps dependency that is NOT an @Input:
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
  }

  get resolvedStyle(): IStyleProp<IViewStyle> | undefined {
    const state: IPressState = { pressed: this.pressed };
    return isStyleFn(this.style) ? this.style(state) : this.style;
  }

  get foldedAccessibility(): Partial<IAngularPressableProps> {
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
      'aria-label': this.ariaLabel,
      'aria-busy': this.ariaBusy,
      'aria-checked': this.ariaChecked,
      'aria-disabled': this.ariaDisabled,
      'aria-expanded': this.ariaExpanded,
      'aria-hidden': this.ariaHidden,
      'aria-labelledby': this.ariaLabelledBy,
      'aria-live': this.ariaLive,
      'aria-selected': this.ariaSelected,
      'aria-modal': this.ariaModal,
      'aria-valuemax': this.ariaValueMax,
      'aria-valuemin': this.ariaValueMin,
      'aria-valuenow': this.ariaValueNow,
      'aria-valuetext': this.ariaValueText,
      id: this.id,
      role: this.role,
    });
  }

  get resolvedRippleProps(): Record<string, unknown> | undefined {
    return this.android_ripple === undefined
      ? undefined
      : rippleProps(this.android_ripple);
  }

  // Flat bag for `[symbioteHostProps]` (Renderer2.setProperty per key) - see primitives/shared.ts.
  //
  // MEASURED 2026-08-16: as a getter this rebuilt the bag on every refresh of this view, and a
  // press dirties this very view (SymbioteHostPropsDirective wraps each flat-bag onX with
  // markForCheck, and setPressed calls detectChanges outright), so `[symbioteHostProps]`'s
  // reference check failed every time and re-pushed every key through Renderer2.setProperty ->
  // routeProp for an identical bag. Memoized, an unchanged bag costs one reference compare.
  readonly hostProps = computed<Record<string, unknown>>(() => {
    this.inputsRevision();
    return {
      testID: this.testID,
      nativeID: this.nativeID,
      hasTVPreferredFocus: this.hasTVPreferredFocus,
      nextFocusDown: this.nextFocusDown,
      nextFocusForward: this.nextFocusForward,
      nextFocusLeft: this.nextFocusLeft,
      nextFocusRight: this.nextFocusRight,
      nextFocusUp: this.nextFocusUp,
      style: [this.anchorStyle(), this.resolvedStyle],
      accessible: this.accessible,
      ...this.foldedAccessibility,
      android_disableSound: this.android_disableSound,
      nativeBackgroundAndroid:
        this.resolvedRippleProps?.nativeBackgroundAndroid,
      nativeForegroundAndroid:
        this.resolvedRippleProps?.nativeForegroundAndroid,
    };
  });

  handlePressIn(event: unknown): void {
    const symbioteEvent = asSymbioteEvent(event);
    if (shouldSuppressPress(this.disabled) || symbioteEvent === undefined)
      return;
    this.handlers.handlePressIn(symbioteEvent);
  }

  handlePressOut(event: unknown): void {
    const symbioteEvent = asSymbioteEvent(event);
    if (shouldSuppressPress(this.disabled) || symbioteEvent === undefined)
      return;
    this.handlers.handlePressOut(symbioteEvent);
  }

  handlePress(event: unknown): void {
    const symbioteEvent = asSymbioteEvent(event);
    if (shouldSuppressPress(this.disabled) || symbioteEvent === undefined)
      return;
    this.handlers.handlePress(symbioteEvent);
  }

  handleResponderMove(event: unknown): void {
    const symbioteEvent = asSymbioteEvent(event);
    if (shouldSuppressPress(this.disabled) || symbioteEvent === undefined)
      return;
    this.handlers.handleResponderMove(symbioteEvent);
  }

  claimResponder(): boolean {
    return shouldClaimResponder(this.disabled);
  }

  allowTermination(): boolean {
    return isTerminationAllowed(this.cancelable);
  }

  emit(emitter: EventEmitter<ISymbioteEvent>, event: unknown): void {
    const symbioteEvent = asSymbioteEvent(event);
    if (symbioteEvent !== undefined) emitter.emit(symbioteEvent);
  }

  // Hover has no event on a touch host (no pointer-enter/leave); this only records that someone
  // is listening anyway, mirroring core's noteHoverNoop but off `.observed` instead of an @Input.
  private noteHoverNoop(): void {
    if (this.hoverIn.observed || this.hoverOut.observed) {
      dlog(
        'Pressable hover is a no-op on this host (no pointer-enter/leave event)',
      );
    }
  }

  // Wraps an @Output() as an IPressHandler only while it has a subscriber, so an unbound
  // (longPress) still skips arming the timer, matching createPressHandlers' "undefined means
  // nobody cares" contract.
  private emitterHandler(
    emitter: EventEmitter<ISymbioteEvent>,
  ): IPressHandler | undefined {
    return emitter.observed ? event => emitter.emit(event) : undefined;
  }

  private get handlers() {
    this.noteHoverNoop();
    const config: IPressMachineConfig = {
      onPress: this.emitterHandler(this.press),
      onPressIn: this.emitterHandler(this.pressIn),
      onPressOut: this.emitterHandler(this.pressOut),
      onPressMove: this.emitterHandler(this.pressMove),
      onLongPress: this.emitterHandler(this.longPress),
      delayLongPress: this.delayLongPress ?? DEFAULT_DELAY_LONG_PRESS_MS,
      unstable_pressDelay: this.unstable_pressDelay ?? 0,
      hitSlop: this.hitSlop,
      pressRetentionOffset: this.pressRetentionOffset,
    };
    return createPressHandlers(config, this.runtime, this.host);
  }

  private get hostNode(): ISymbioteNode | undefined {
    const native = this.hostElement?.nativeElement;
    return isSymbioteNode(native) ? native : undefined;
  }
}
