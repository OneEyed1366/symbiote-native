// The Touchable* family for Angular, all built on Pressable (the Angular twin of the React/Vue
// adapter). The press-timing constants and the deactivation-floor math are shared with every
// adapter (@symbiote-native/components/state/touchable); here Angular owns only the Animated wiring + the
// press scheduling state:
//   TouchableOpacity:   animate an Animated.Value opacity toward activeOpacity on press-in and back
//     to 1 on press-out, driven from Pressable's onPressIn/onPressOut. The opacity Value is held by
//     IDENTITY as a plain field (an engine object, never an @Input / reactive wrap) and the
//     <symbiote-animated-view> leaf commits it every frame.
//   TouchableHighlight: paint underlayColor + lower child opacity while the underlay is SHOWN.
//     RN drives that from onPressIn/onPress/onPressOut and holds it past the tap for delayPressOut,
//     NOT from Pressable's pressed flag — a tap too fast to see is already un-pressed by then.
//   TouchableWithoutFeedback: no visual change, but RN still runs the full press-timing machine.
//
// Every Touchable's own press/hover/accessibility events are now real @Output() EventEmitters too,
// matching Pressable (which they wrap) — `(press)="handler($event)"`, never `[onPress]="handler"`.
// Non-event config (delayLongPress, hitSlop, ...) still rides down as plain @Input() bindings.
// Accessibility EVENTS forward straight through to Pressable's own outputs
// (`(accessibilityAction)="accessibilityAction.emit($event)"`); accessibility STATE folds the web
// aria-*/role aliases and merges `disabled` into the a11y state on Pressable's own host — no re-fold
// here (the a11y host is Pressable's view, mirroring React's `...rest` -> Pressable). No JS-side
// platform branch, so this stays a flat single file, mirroring React/Vue. Each Touchable
// forwards the Angular Pressable surface verbatim; parity is against that surface, exactly as
// React's Touchable parity is against
// the React Pressable surface.

import {
  CUSTOM_ELEMENTS_SCHEMA,
  ChangeDetectionStrategy,
  Component,
  computed,
  type DoCheck,
  ElementRef,
  EventEmitter,
  inject,
  Input,
  type OnChanges,
  type OnDestroy,
  Output,
  signal,
} from '@angular/core';
import {
  createHighlightUnderlayHandlers,
  createHighlightUnderlayRuntime,
  createTouchableFeedbackHandlers,
  createTouchableFeedbackRuntime,
  hasTouchablePressHandler,
  resolveHighlightExtraStyles,
  restingOpacityFromStyle,
  DEFAULT_ACTIVE_OPACITY,
  OPACITY_ACTIVE_GRANT_DURATION_MS,
  OPACITY_INACTIVE_DURATION_MS,
  RESTING_OPACITY,
  TOUCHABLE_MIN_PRESS_DURATION_MS,
  type IAccessibilityProps,
  type IAccessibilityStateValue,
  type IAriaProps,
  type IHighlightUnderlayHandlers,
  type IPressableAndroidRippleConfig,
  type IPressTimingProps,
  type IRectOffset,
  type ITouchableFeedbackHandlers,
} from '@symbiote-native/components';
import {
  type ISymbioteEvent,
  type IStyleProp,
  type IViewStyle,
} from '@symbiote-native/engine';
import {
  anchorHostStyle,
  anchorStyleProp,
  SymbioteStyleInputDirective,
} from '../../primitives';
import { Pressable, type IAngularPressableInputs } from '../pressable';
import { Animated, AnimatedView } from '../../modules/animated';
import {
  gateWanted,
  injectGateDemandAbove,
  provideGateDemand,
  type IGateDemand,
  type IGatedAccessibilityEvent,
} from '../../gate-demand';

// The shared field base for all three: the Pressable INPUT surface (minus style, which each
// Touchable routes differently, and minus the press/hover events, which each Touchable declares as
// its OWN @Output()s below) + RN's press-timing config + the public style. Mirrors React/Vue's
// ITouchableBaseProps. Declared per-adapter over the Angular Pressable surface, since children
// ride <ng-content> here rather than a field, unlike React/Vue's element-returning props.
type IAngularTouchableBaseProps = Omit<IAngularPressableInputs, 'style'> &
  IPressTimingProps & {
    style?: IStyleProp<IViewStyle>;
  };

export type IAngularTouchableOpacityProps = IAngularTouchableBaseProps & {
  activeOpacity?: number;
};

export type IAngularTouchableHighlightProps = IAngularTouchableBaseProps & {
  activeOpacity?: number;
  underlayColor?: string;
};

export type IAngularTouchableWithoutFeedbackProps = IAngularTouchableBaseProps;

// The real timers both shared machines schedule on — core/components carries no timer globals, so
// scheduling is the adapter's half. Every canceller is retained so ngOnDestroy cancels what is
// still in flight: a deferred press-out or a held underlay firing after teardown would emit from a
// destroyed component and write a signal on a destroyed view.
interface ITimerScheduler {
  schedule: (callback: () => void, ms: number) => () => void;
  cancelAll: () => void;
}

function createTimerScheduler(): ITimerScheduler {
  const pending = new Set<() => void>();
  return {
    schedule(callback: () => void, ms: number): () => void {
      const id = setTimeout(() => {
        pending.delete(cancel);
        callback();
      }, ms);
      const cancel = (): void => {
        clearTimeout(id);
        pending.delete(cancel);
      };
      pending.add(cancel);
      return cancel;
    },
    cancelAll(): void {
      for (const cancel of [...pending]) cancel();
      pending.clear();
    },
  };
}

@Component({
  selector: 'TouchableOpacity',
  standalone: true,
  viewProviders: [provideGateDemand(() => TouchableOpacity)],
  hostDirectives: [
    { directive: SymbioteStyleInputDirective, inputs: ['style'] },
  ],
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
  imports: [Pressable, AnimatedView],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <Pressable
      [__minPressDuration]="0"
      (press)="press.emit($event)"
      (pressIn)="handlePressIn($event)"
      (pressOut)="handlePressOut($event)"
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
      [testID]="testID"
      [nativeID]="nativeID"
      [hasTVPreferredFocus]="hasTVPreferredFocus"
      [nextFocusDown]="nextFocusDown"
      [nextFocusForward]="nextFocusForward"
      [nextFocusLeft]="nextFocusLeft"
      [nextFocusRight]="nextFocusRight"
      [nextFocusUp]="nextFocusUp"
      [accessible]="accessible"
      [accessibilityLabel]="accessibilityLabel"
      [accessibilityHint]="accessibilityHint"
      [accessibilityRole]="accessibilityRole"
      [accessibilityState]="accessibilityState"
      [accessibilityValue]="accessibilityValue"
      [accessibilityActions]="accessibilityActions"
      [accessibilityLabelledBy]="accessibilityLabelledBy"
      [importantForAccessibility]="importantForAccessibility"
      [accessibilityLiveRegion]="accessibilityLiveRegion"
      [screenReaderFocusable]="screenReaderFocusable"
      [accessibilityViewIsModal]="accessibilityViewIsModal"
      [accessibilityElementsHidden]="accessibilityElementsHidden"
      [accessibilityIgnoresInvertColors]="accessibilityIgnoresInvertColors"
      [accessibilityLanguage]="accessibilityLanguage"
      [accessibilityRespondsToUserInteraction]="
        accessibilityRespondsToUserInteraction
      "
      [accessibilityShowsLargeContentViewer]="
        accessibilityShowsLargeContentViewer
      "
      [accessibilityLargeContentTitle]="accessibilityLargeContentTitle"
      (accessibilityAction)="accessibilityAction.emit($event)"
      (accessibilityTap)="accessibilityTap.emit($event)"
      (magicTap)="magicTap.emit($event)"
      (accessibilityEscape)="accessibilityEscape.emit($event)"
      [ariaLabel]="ariaLabel"
      [ariaBusy]="ariaBusy"
      [ariaChecked]="ariaChecked"
      [ariaDisabled]="ariaDisabled"
      [ariaExpanded]="ariaExpanded"
      [ariaHidden]="ariaHidden"
      [ariaLabelledBy]="ariaLabelledBy"
      [ariaLive]="ariaLive"
      [ariaSelected]="ariaSelected"
      [ariaModal]="ariaModal"
      [ariaValueMax]="ariaValueMax"
      [ariaValueMin]="ariaValueMin"
      [ariaValueNow]="ariaValueNow"
      [ariaValueText]="ariaValueText"
      [id]="id"
      [role]="role"
    >
      <symbiote-animated-view [style]="animatedStyle">
        <ng-content></ng-content>
      </symbiote-animated-view>
    </Pressable>
  `,
})
export class TouchableOpacity
  implements IAngularTouchableOpacityProps, OnChanges, OnDestroy, DoCheck
{
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

  // This wrapper binds the four gated accessibility events on the component it renders, which
  // Angular forces to be unconditional and which would light that component's gates on every
  // instance. It answers for them instead — see `gate-demand.ts`.
  private readonly gateDemandAbove = injectGateDemandAbove();

  wantsGate(name: IGatedAccessibilityEvent): boolean {
    return gateWanted(this.gateDemandAbove, name, this[name]);
  }

  @Input() activeOpacity?: number;
  @Input() delayPressIn?: number;
  @Input() delayPressOut?: number;
  @Input() minPressDuration?: number;
  @Input() style?: IStyleProp<IViewStyle>;
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
  @Input() hasTVPreferredFocus?: boolean;
  @Input() nextFocusDown?: number;
  @Input() nextFocusForward?: number;
  @Input() nextFocusLeft?: number;
  @Input() nextFocusRight?: number;
  @Input() nextFocusUp?: number;
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
  @Input() role?: IAriaProps['role'];

  // One Animated.Value per mount. Held by IDENTITY as a plain field (an engine object, never an
  // @Input / reactive wrap); the <symbiote-animated-view> leaf rasterizes it for the first paint
  // and drives it through setNativeProps every frame.
  //
  // RN seeds it from _getChildStyleOpacityWithDefault(props.style). Angular writes @Input()s AFTER
  // the field initializers run, so `style` is still undefined here — the real resting value is
  // seeded by the first ngOnChanges below, which still precedes the first template pass.
  private readonly opacity = new Animated.Value(RESTING_OPACITY);
  // The shared press-scheduling cell (delayPressIn timer + activation clock), persisted on the
  // instance; the machine's handlers are rebuilt per event over live @Input()s.
  private readonly runtime = createTouchableFeedbackRuntime();
  private readonly timers = createTimerScheduler();
  // What the last settle ran for. Undefined until the first ngOnChanges, which is the MOUNT.
  private settled:
    { disabled: boolean | undefined; resting: number } | undefined;
  // This component's OWN host — the non-painting anchor `class="..."` at the use site resolves
  // onto (see anchorHostStyle's doc comment) — NOT the <symbiote-animated-view> leaf one level down.
  private readonly elementRef = inject(ElementRef);

  // The (possibly animated) style the leaf reduces: the anchor's class-derived style first, then
  // the user's explicit style, then the live opacity layered on top (last wins via the style array
  // the commit layer flattens). `unknown` because the array mixes a plain style with an
  // AnimatedNode, exactly the bag AnimatedView's `style` input accepts.
  get animatedStyle(): unknown {
    return [this.anchorStyle(), this.style, { opacity: this.opacity }];
  }

  // The anchor's class-derived style is written by the renderer's addClass/removeClass at the USE
  // SITE - it never appears in SimpleChanges, and nothing about it dirties THIS component's view.
  // A `class=` present at creation therefore worked, while one toggled later did not: the parent
  // refreshed, the class landed on the anchor, and this component's own view was never refreshed,
  // so whatever merged the anchor style in was never re-evaluated. Polling it into a signal from
  // ngDoCheck fixes both halves: ngDoCheck runs during the PARENT's refresh even when this view is
  // skipped, and the signal write is what then marks this view for refresh. `signal.set`'s own
  // Object.is makes an unchanged poll a no-op, so there is no loop.
  private readonly anchorStyle = signal<unknown>(undefined);

  ngDoCheck(): void {
    this.anchorStyle.set(anchorHostStyle(this.elementRef));
  }

  // RN's componentDidUpdate: a changed `disabled` or a changed style opacity re-settles the view,
  // so a Touchable disabled mid-press does not stay stuck at its active opacity. The FIRST call is
  // the mount (ngOnChanges runs before ngOnInit and before the first template pass), so it seeds
  // the Value instead of animating — RN does this on update only, and a fade at mount would animate
  // away from the value the leaf is about to paint. A use site with no bindings gets no ngOnChanges
  // at all, and there the RESTING_OPACITY seed is already the right answer.
  ngOnChanges(): void {
    const settled = { disabled: this.disabled, resting: this.restingOpacity() };
    if (this.settled === undefined) {
      this.opacity.setValue(settled.resting);
    } else if (
      this.settled.disabled !== settled.disabled ||
      this.settled.resting !== settled.resting
    ) {
      this.setOpacityTo(settled.resting, OPACITY_INACTIVE_DURATION_MS);
    }
    this.settled = settled;
  }

  // RN's componentWillUnmount: stop the animation so a teardown mid-fade leaves no driver running
  // against a node that is gone, and drop any press-out still deferred behind a timer.
  ngOnDestroy(): void {
    this.timers.cancelAll();
    this.opacity.resetAnimation();
  }

  // RN's _getChildStyleOpacityWithDefault: the fade settles at the opacity the CALLER's style asks
  // for, not at a hard 1 — a Touchable styled `opacity: 0.6` must come back to 0.6.
  private restingOpacity(): number {
    return restingOpacityFromStyle(this.style);
  }

  private setOpacityTo(toValue: number, duration: number): void {
    Animated.timing(this.opacity, {
      toValue,
      duration,
      easing: Animated.Easing.inOut(Animated.Easing.quad),
      // RN's own (TouchableOpacity.js:242). opacity is natively drivable, so the fade survives a
      // busy JS thread — which is the entire point of press feedback.
      useNativeDriver: true,
    }).start();
  }

  // Built per event so the machine reads live @Input()s (delay/opacity); the runtime persists across
  // calls. The shared machine owns the scheduling — the adapter supplies only the native seam: the
  // Animated opacity fade + the @Output() emit, as activate/deactivate.
  private feedbackHandlers(): ITouchableFeedbackHandlers {
    return createTouchableFeedbackHandlers(
      {
        delayPressIn: this.delayPressIn ?? 0,
        delayPressOut: this.delayPressOut ?? 0,
        // RN's Touchables override Pressability's own 130ms floor with 0; what holds the active
        // visual there is the fade's own duration, not a press-duration floor.
        minPressDuration:
          this.minPressDuration ?? TOUCHABLE_MIN_PRESS_DURATION_MS,
        schedule: this.timers.schedule,
        now: Date.now,
      },
      this.runtime,
      {
        activate: (event: ISymbioteEvent): void => {
          this.setOpacityTo(
            this.activeOpacity ?? DEFAULT_ACTIVE_OPACITY,
            OPACITY_ACTIVE_GRANT_DURATION_MS,
          );
          this.pressIn.emit(event);
        },
        deactivate: (event: ISymbioteEvent): void => {
          this.setOpacityTo(
            this.restingOpacity(),
            OPACITY_INACTIVE_DURATION_MS,
          );
          this.pressOut.emit(event);
        },
      },
    );
  }

  // Arrow fields (stable identity for OnPush, `this` intact when Pressable's `(pressIn)` invokes
  // them). The delayPressIn defer + minPressDuration/delayPressOut hold live in the shared machine.
  handlePressIn = (event: ISymbioteEvent): void => {
    this.feedbackHandlers().handlePressIn(event);
  };

  handlePressOut = (event: ISymbioteEvent): void => {
    this.feedbackHandlers().handlePressOut(event);
  };
}

@Component({
  selector: 'TouchableHighlight',
  standalone: true,
  viewProviders: [provideGateDemand(() => TouchableHighlight)],
  hostDirectives: [
    { directive: SymbioteStyleInputDirective, inputs: ['style'] },
  ],
  imports: [Pressable],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <Pressable
      [__minPressDuration]="0"
      [style]="containerStyle()"
      (press)="handlePress($event)"
      (pressIn)="handlePressIn($event)"
      (pressOut)="handlePressOut($event)"
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
      [testID]="testID"
      [nativeID]="nativeID"
      [hasTVPreferredFocus]="hasTVPreferredFocus"
      [nextFocusDown]="nextFocusDown"
      [nextFocusForward]="nextFocusForward"
      [nextFocusLeft]="nextFocusLeft"
      [nextFocusRight]="nextFocusRight"
      [nextFocusUp]="nextFocusUp"
      [accessible]="accessible"
      [accessibilityLabel]="accessibilityLabel"
      [accessibilityHint]="accessibilityHint"
      [accessibilityRole]="accessibilityRole"
      [accessibilityState]="accessibilityState"
      [accessibilityValue]="accessibilityValue"
      [accessibilityActions]="accessibilityActions"
      [accessibilityLabelledBy]="accessibilityLabelledBy"
      [importantForAccessibility]="importantForAccessibility"
      [accessibilityLiveRegion]="accessibilityLiveRegion"
      [screenReaderFocusable]="screenReaderFocusable"
      [accessibilityViewIsModal]="accessibilityViewIsModal"
      [accessibilityElementsHidden]="accessibilityElementsHidden"
      [accessibilityIgnoresInvertColors]="accessibilityIgnoresInvertColors"
      [accessibilityLanguage]="accessibilityLanguage"
      [accessibilityRespondsToUserInteraction]="
        accessibilityRespondsToUserInteraction
      "
      [accessibilityShowsLargeContentViewer]="
        accessibilityShowsLargeContentViewer
      "
      [accessibilityLargeContentTitle]="accessibilityLargeContentTitle"
      (accessibilityAction)="accessibilityAction.emit($event)"
      (accessibilityTap)="accessibilityTap.emit($event)"
      (magicTap)="magicTap.emit($event)"
      (accessibilityEscape)="accessibilityEscape.emit($event)"
      [ariaLabel]="ariaLabel"
      [ariaBusy]="ariaBusy"
      [ariaChecked]="ariaChecked"
      [ariaDisabled]="ariaDisabled"
      [ariaExpanded]="ariaExpanded"
      [ariaHidden]="ariaHidden"
      [ariaLabelledBy]="ariaLabelledBy"
      [ariaLive]="ariaLive"
      [ariaSelected]="ariaSelected"
      [ariaModal]="ariaModal"
      [ariaValueMax]="ariaValueMax"
      [ariaValueMin]="ariaValueMin"
      [ariaValueNow]="ariaValueNow"
      [ariaValueText]="ariaValueText"
      [id]="id"
      [role]="role"
    >
      <ng-content></ng-content>
    </Pressable>
  `,
})
export class TouchableHighlight
  implements IAngularTouchableHighlightProps, OnChanges, OnDestroy, DoCheck
{
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

  // This wrapper binds the four gated accessibility events on the component it renders, which
  // Angular forces to be unconditional and which would light that component's gates on every
  // instance. It answers for them instead — see `gate-demand.ts`.
  private readonly gateDemandAbove = injectGateDemandAbove();

  wantsGate(name: IGatedAccessibilityEvent): boolean {
    return gateWanted(this.gateDemandAbove, name, this[name]);
  }

  // RN's onShowUnderlay / onHideUnderlay — fired on a real transition only, never on a repeat.
  @Output() readonly showUnderlay = new EventEmitter<void>();
  @Output() readonly hideUnderlay = new EventEmitter<void>();
  @Input() activeOpacity?: number;
  @Input() underlayColor?: string;
  @Input() delayPressIn?: number;
  @Input() delayPressOut?: number;
  @Input() minPressDuration?: number;
  @Input() style?: IStyleProp<IViewStyle>;
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
  @Input() hasTVPreferredFocus?: boolean;
  @Input() nextFocusDown?: number;
  @Input() nextFocusForward?: number;
  @Input() nextFocusLeft?: number;
  @Input() nextFocusRight?: number;
  @Input() nextFocusUp?: number;
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
  @Input() role?: IAriaProps['role'];

  // This component's OWN host — the non-painting anchor `class="..."` at the use site resolves
  // onto (see anchorHostStyle's doc comment) — NOT the Pressable one level down.
  private readonly elementRef = inject(ElementRef);

  // `shown` is NOT Pressable's `pressed`. RN holds the underlay for delayPressOut past the tap so a
  // press too fast to see still flashes, and the pressed flag is already false by then. A SIGNAL,
  // because the hide fires from a timer — outside any Angular listener, so under zoneless CD
  // nothing else would mark this view. A signal write both notifies the change-detection scheduler
  // (markAncestorsForTraversal) and dirties this template's own reactive consumer, which is the one
  // thing honored in Targeted mode; markForCheck from a plain field would not be reachable here.
  private readonly shown = signal(false);
  private readonly underlayRuntime = createHighlightUnderlayRuntime();
  private readonly timers = createTimerScheduler();

  // The container style Pressable paints.
  //
  // POINT-7 DECISION — both halves stay on the CONTAINER, deliberately. RN's _createExtraStyles
  // keeps them apart: `underlay` (the backgroundColor) on the container, `child` (the lowered
  // opacity) cloned onto the single child. Angular has no cloneElement and no way to reach a
  // projected <ng-content> node, so the only path to the child is a permanent wrapper View — which
  // inserts a node into the flex chain and silently re-parents any `flex` a child declares. The
  // fake Fabric runs no Yoga, so no headless test can measure that damage, only assert the extra
  // node exists; shipping an unmeasurable layout change is worse than the visual approximation.
  // Same call, same reason, as the Solid adapter. resolveHighlightExtraStyles keeps the two styles
  // SEPARATE regardless, so a layout-safe fix (which needs a device check, not a test) stays open.
  //
  // Returns a NEW ARRAY whenever a dependency moves: Pressable's `style` @Input then reports an
  // ordinary change. A stable reference was the earlier bug — Pressable's view never refreshed, so
  // a class or [style] toggled after mount never reached the committed view.
  readonly containerStyle = computed<IStyleProp<IViewStyle>>(() => {
    this.inputsRevision();
    const base: IStyleProp<IViewStyle> = [this.anchorStyle(), this.style];
    const extra = resolveHighlightExtraStyles({
      shown: this.shown(),
      hasPressHandler: this.hasPressHandler(),
      underlayColor: this.underlayColor,
      activeOpacity: this.activeOpacity,
    });
    return extra === undefined ? base : [base, extra.underlay, extra.child];
  });

  // RN's _hasPressHandler: a Touchable that handles no press paints no underlay. Angular exposes
  // the press lifecycle as @Output()s, so "a handler is present" is "something is subscribed" — the
  // same `.observed` test Pressable uses to decide whether to arm its long-press timer at all.
  private hasPressHandler(): boolean {
    return hasTouchablePressHandler({
      onPress: this.press.observed ? this.press : undefined,
      onPressIn: this.pressIn.observed ? this.pressIn : undefined,
      onPressOut: this.pressOut.observed ? this.pressOut : undefined,
      onLongPress: this.longPress.observed ? this.longPress : undefined,
    });
  }

  // Built per event so the machine reads live @Input()s (delayPressOut, the has-handler gate); the
  // runtime persists across calls, which is what lets handlePressOut see the timer handlePress set.
  private underlayHandlers(): IHighlightUnderlayHandlers {
    return createHighlightUnderlayHandlers(
      {
        delayPressOut: this.delayPressOut ?? 0,
        hasPressHandler: this.hasPressHandler(),
        schedule: this.timers.schedule,
      },
      this.underlayRuntime,
      {
        setShown: (shown: boolean): void => this.shown.set(shown),
        onShowUnderlay: (): void => this.showUnderlay.emit(),
        onHideUnderlay: (): void => this.hideUnderlay.emit(),
      },
    );
  }

  // Visual first, then the caller's own event — RN's order in _createPressabilityConfig.
  // onLongPress is deliberately NOT intercepted (Pressable emits it straight through); it is only
  // READ, by the has-press-handler gate above.
  handlePressIn(event: ISymbioteEvent): void {
    this.underlayHandlers().handlePressIn(event);
    this.pressIn.emit(event);
  }

  handlePress(event: ISymbioteEvent): void {
    this.underlayHandlers().handlePress(event);
    this.press.emit(event);
  }

  handlePressOut(event: ISymbioteEvent): void {
    this.underlayHandlers().handlePressOut(event);
    this.pressOut.emit(event);
  }

  ngOnDestroy(): void {
    this.timers.cancelAll();
  }

  // `style`, `underlayColor` and `activeOpacity` are read untracked inside containerStyle, so the
  // bump is what tells it they moved. See the ngDoCheck note below for the anchor half, which
  // ngOnChanges cannot cover.
  private readonly inputsRevision = signal(0);
  private readonly anchorStyle = signal<IStyleProp<IViewStyle> | undefined>(
    undefined,
  );

  ngOnChanges(): void {
    this.inputsRevision.update(revision => revision + 1);
  }

  // The anchor's class-derived style is written by the renderer's addClass/removeClass at the USE
  // SITE - it never appears in SimpleChanges, and nothing about it dirties THIS component's view.
  // ngDoCheck runs during the PARENT's refresh even when this view is skipped, and the signal
  // write is what then marks this view for refresh. `signal.set`'s own Object.is makes an
  // unchanged poll a no-op, so there is no loop.
  ngDoCheck(): void {
    this.anchorStyle.set(anchorStyleProp<IViewStyle>(this.elementRef));
  }
}

@Component({
  selector: 'TouchableWithoutFeedback',
  standalone: true,
  viewProviders: [provideGateDemand(() => TouchableWithoutFeedback)],
  hostDirectives: [
    { directive: SymbioteStyleInputDirective, inputs: ['style'] },
  ],
  imports: [Pressable],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <Pressable
      [__minPressDuration]="0"
      [style]="mergedStyle"
      (press)="press.emit($event)"
      (pressIn)="handlePressIn($event)"
      (pressOut)="handlePressOut($event)"
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
      [testID]="testID"
      [nativeID]="nativeID"
      [hasTVPreferredFocus]="hasTVPreferredFocus"
      [nextFocusDown]="nextFocusDown"
      [nextFocusForward]="nextFocusForward"
      [nextFocusLeft]="nextFocusLeft"
      [nextFocusRight]="nextFocusRight"
      [nextFocusUp]="nextFocusUp"
      [accessible]="accessible"
      [accessibilityLabel]="accessibilityLabel"
      [accessibilityHint]="accessibilityHint"
      [accessibilityRole]="accessibilityRole"
      [accessibilityState]="accessibilityState"
      [accessibilityValue]="accessibilityValue"
      [accessibilityActions]="accessibilityActions"
      [accessibilityLabelledBy]="accessibilityLabelledBy"
      [importantForAccessibility]="importantForAccessibility"
      [accessibilityLiveRegion]="accessibilityLiveRegion"
      [screenReaderFocusable]="screenReaderFocusable"
      [accessibilityViewIsModal]="accessibilityViewIsModal"
      [accessibilityElementsHidden]="accessibilityElementsHidden"
      [accessibilityIgnoresInvertColors]="accessibilityIgnoresInvertColors"
      [accessibilityLanguage]="accessibilityLanguage"
      [accessibilityRespondsToUserInteraction]="
        accessibilityRespondsToUserInteraction
      "
      [accessibilityShowsLargeContentViewer]="
        accessibilityShowsLargeContentViewer
      "
      [accessibilityLargeContentTitle]="accessibilityLargeContentTitle"
      (accessibilityAction)="accessibilityAction.emit($event)"
      (accessibilityTap)="accessibilityTap.emit($event)"
      (magicTap)="magicTap.emit($event)"
      (accessibilityEscape)="accessibilityEscape.emit($event)"
      [ariaLabel]="ariaLabel"
      [ariaBusy]="ariaBusy"
      [ariaChecked]="ariaChecked"
      [ariaDisabled]="ariaDisabled"
      [ariaExpanded]="ariaExpanded"
      [ariaHidden]="ariaHidden"
      [ariaLabelledBy]="ariaLabelledBy"
      [ariaLive]="ariaLive"
      [ariaSelected]="ariaSelected"
      [ariaModal]="ariaModal"
      [ariaValueMax]="ariaValueMax"
      [ariaValueMin]="ariaValueMin"
      [ariaValueNow]="ariaValueNow"
      [ariaValueText]="ariaValueText"
      [id]="id"
      [role]="role"
    >
      <ng-content></ng-content>
    </Pressable>
  `,
})
export class TouchableWithoutFeedback
  implements DoCheck, OnDestroy, IAngularTouchableWithoutFeedbackProps
{
  // RN's TouchableWithoutFeedback builds a FULL Pressability config with delayPressIn /
  // delayPressOut / minPressDuration: 0 — "without feedback" means no VISUAL, not no timing. So the
  // same shared machine TouchableOpacity uses runs here, with the visual half left empty: the
  // pressIn/pressOut EMIT is what gets deferred and floored.
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

  // This wrapper binds the four gated accessibility events on the component it renders, which
  // Angular forces to be unconditional and which would light that component's gates on every
  // instance. It answers for them instead — see `gate-demand.ts`.
  private readonly gateDemandAbove = injectGateDemandAbove();

  wantsGate(name: IGatedAccessibilityEvent): boolean {
    return gateWanted(this.gateDemandAbove, name, this[name]);
  }

  @Input() delayPressIn?: number;
  @Input() delayPressOut?: number;
  @Input() minPressDuration?: number;
  @Input() style?: IStyleProp<IViewStyle>;
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
  @Input() hasTVPreferredFocus?: boolean;
  @Input() nextFocusDown?: number;
  @Input() nextFocusForward?: number;
  @Input() nextFocusLeft?: number;
  @Input() nextFocusRight?: number;
  @Input() nextFocusUp?: number;
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
  @Input() role?: IAriaProps['role'];

  // This component's OWN host — the non-painting anchor `class="..."` at the use site resolves
  // onto (see anchorHostStyle's doc comment) — NOT the Pressable one level down.
  private readonly elementRef = inject(ElementRef);

  // The shared press-scheduling cell (delayPressIn timer + activation clock), persisted on the
  // instance; the machine's handlers are rebuilt per event over live @Input()s.
  private readonly runtime = createTouchableFeedbackRuntime();
  private readonly timers = createTimerScheduler();

  // The anchor's class-derived style goes first, then the explicit style, so an explicit [style]
  // still beats the ambient class.
  get mergedStyle(): IStyleProp<IViewStyle> {
    return [this.anchorStyle(), this.style];
  }

  private feedbackHandlers(): ITouchableFeedbackHandlers {
    return createTouchableFeedbackHandlers(
      {
        delayPressIn: this.delayPressIn ?? 0,
        delayPressOut: this.delayPressOut ?? 0,
        minPressDuration:
          this.minPressDuration ?? TOUCHABLE_MIN_PRESS_DURATION_MS,
        schedule: this.timers.schedule,
        now: Date.now,
      },
      this.runtime,
      {
        activate: (event: ISymbioteEvent): void => this.pressIn.emit(event),
        deactivate: (event: ISymbioteEvent): void => this.pressOut.emit(event),
      },
    );
  }

  handlePressIn(event: ISymbioteEvent): void {
    this.feedbackHandlers().handlePressIn(event);
  }

  handlePressOut(event: ISymbioteEvent): void {
    this.feedbackHandlers().handlePressOut(event);
  }

  ngOnDestroy(): void {
    this.timers.cancelAll();
  }

  // The anchor's class-derived style is written by the renderer's addClass/removeClass at the USE
  // SITE - it never appears in SimpleChanges, and nothing about it dirties THIS component's view.
  // A `class=` present at creation therefore worked, while one toggled later did not: the parent
  // refreshed, the class landed on the anchor, and this component's own view was never refreshed,
  // so whatever merged the anchor style in was never re-evaluated. Polling it into a signal from
  // ngDoCheck fixes both halves: ngDoCheck runs during the PARENT's refresh even when this view is
  // skipped, and the signal write is what then marks this view for refresh. `signal.set`'s own
  // Object.is makes an unchanged poll a no-op, so there is no loop.
  private readonly anchorStyle = signal<IStyleProp<IViewStyle> | undefined>(
    undefined,
  );

  ngDoCheck(): void {
    this.anchorStyle.set(anchorStyleProp<IViewStyle>(this.elementRef));
  }
}
