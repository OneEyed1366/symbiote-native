// KeyboardAvoidingView: the Angular lifecycle half. A plain View that shifts out of the
// keyboard's way as it shows/hides. The inset math + the behavior → style/structure decision
// live framework-agnostic in @symbiote-native/components (render-keyboard-avoiding-view), shared verbatim
// with React/Vue; Angular supplies only the lifecycle: a plain inset field, ngOnInit subscribes to
// the core Keyboard module (the host's show / hide pair) and markForCheck pulls the OnPush view (the
// Angular twin of React's setState / Vue's reactive ref), ngOnDestroy tears the subscriptions down,
// and the wrapper's onLayout measures the frame that feeds the next event's inset. The user
// children nest under the wrapper (or, for 'position', an inner View) via <ng-content>. No native
// host of its own — it wraps view — so this stays a flat single file.
//
// Full parity: behavior 'height'|'position'|'padding', enabled, keyboardVerticalOffset,
// contentContainerStyle, onLayout, plus the full a11y/aria surface every View carries.

import {
  CUSTOM_ELEMENTS_SCHEMA,
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  ElementRef,
  EventEmitter,
  inject,
  Input,
  Output,
  type OnDestroy,
  type OnInit,
} from '@angular/core';
import {
  createKeyboardAvoidingModel,
  keyboardAvoidingEventNamesFor,
  readPrefersCrossFadeTransitions,
  resolveAccessibilityProps,
  resolveKeyboardAvoidingLayout,
  DEFAULT_VERTICAL_OFFSET,
  type IAccessibilityProps,
  type IAriaProps,
  type IKeyboardAvoidingBehavior,
  type IKeyboardAvoidingLayout,
} from '@symbiote-native/components';
import {
  Keyboard,
  Platform,
  isSymbioteEvent,
  type IEventSubscription,
  type IStyleProp,
  type ISymbioteEvent,
  type IViewStyle,
} from '@symbiote-native/engine';
import { AccessibilityEventsBase } from '../../accessibility-events';
import {
  anchorHostStyle,
  SymbioteHostPropsDirective,
  SymbioteStyleInputDirective,
  ViewHost,
} from '../../primitives';

export type { IKeyboardAvoidingBehavior } from '@symbiote-native/components';

// Mirrors React's IKeyboardAvoidingViewProps minus children (Angular takes children via
// <ng-content>), declared per-adapter over the shared accessibility base since a framework-specific
// children field keeps it from being fully shared across adapters.
export type IAngularKeyboardAvoidingViewProps = IAccessibilityProps &
  IAriaProps & {
    behavior?: IKeyboardAvoidingBehavior;
    enabled?: boolean;
    keyboardVerticalOffset?: number;
    contentContainerStyle?: IStyleProp<IViewStyle>;
    style?: IStyleProp<IViewStyle>;
    onLayout?: (event: ISymbioteEvent) => void;
  };

// What the component itself takes as plain @Input()s: the full surface minus onLayout and the
// accessibility callbacks, which it exposes as real @Output() EventEmitters instead (see the
// class below), mirroring Pressable's IAngularPressableInputs split.
export type IAngularKeyboardAvoidingViewInputs = Omit<
  IAngularKeyboardAvoidingViewProps,
  | 'onLayout'
  | 'onAccessibilityAction'
  | 'onAccessibilityTap'
  | 'onMagicTap'
  | 'onAccessibilityEscape'
>;

@Component({
  selector: 'KeyboardAvoidingView',
  standalone: true,
  hostDirectives: [
    { directive: SymbioteStyleInputDirective, inputs: ['style'] },
  ],
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
  imports: [ViewHost, SymbioteHostPropsDirective],
  changeDetection: ChangeDetectionStrategy.OnPush,
  // The wrapper carries a11y + onLayout; 'position' ('nested') pushes the children in an inner
  // View by `bottom: inset`, the wrapper modes adjust the single wrapper directly. Only one @if
  // branch is instantiated, so each branch's <ng-content> projects the children unambiguously.
  // `layout` stays a plain, unconditional template binding: unlike the four accessibility events
  // below, this component READS its own onLayout internally (handleLayout measures the frame that
  // feeds the next keyboard event's inset math — see keyboard-avoiding-view-rn-contract.md), so the
  // gate must stay lit regardless of whether the app subscribes to the `layout` @Output(). Gating it
  // on `.observed` would silently break the inset fixpoint correction the moment an app didn't
  // listen to `layout`.
  template: `
    <view [symbioteHostProps]="hostProps" (layout)="handleLayout($event)">
      @if (isNested) {
        <view [style]="innerStyle">
          <ng-content></ng-content>
        </view>
      } @else {
        <ng-content></ng-content>
      }
    </view>
  `,
})
export class KeyboardAvoidingView
  extends AccessibilityEventsBase
  implements IAngularKeyboardAvoidingViewInputs, OnInit, OnDestroy
{
  @Input() behavior?: IKeyboardAvoidingBehavior;
  @Input() enabled?: boolean;
  @Input() keyboardVerticalOffset?: number;
  @Input() contentContainerStyle?: IStyleProp<IViewStyle>;
  @Input() style?: IStyleProp<IViewStyle>;
  // The wrapper's onLayout is a real @Output(): `(layout)="…"`, not `[onLayout]="…"`. Safe to
  // name it the same as the native `layout` event fired inside this component's own template
  // (see the class's `handleLayout`) — the engine's bubble() treats ANCHOR_HOST_COMPONENTS as
  // transparent to listener lookup, so there is no double-fire.
  @Output() readonly layout = new EventEmitter<ISymbioteEvent>();
  @Input() testID?: string;
  @Input() nativeID?: string;

  // Plain field, the model sets it and `markForCheck` pulls the OnPush view
  private inset = 0;
  // A device setting that cannot change mid-session, learning it must not repaint
  private prefersCrossFadeTransitions = false;
  private subscriptions: IEventSubscription[] = [];

  private readonly changeDetector = inject(ChangeDetectorRef);
  // This component's own host, the anchor that `class` at the use site resolves onto
  private readonly elementRef = inject(ElementRef);

  // Options are read at event time, т.к. an `@Input` can change under a live subscription
  private readonly model = createKeyboardAvoidingModel({
    options: () => ({
      behavior: this.behavior,
      enabled: this.enabled !== false,
      keyboardVerticalOffset:
        this.keyboardVerticalOffset ?? DEFAULT_VERTICAL_OFFSET,
    }),
    setInset: value => {
      this.inset = value;
      this.changeDetector.markForCheck();
    },
    prefersCrossFade: () => this.prefersCrossFadeTransitions,
  });

  ngOnInit(): void {
    // iOS takes the `will*` pair so the view rides up with the keyboard, Android the `did*` pair
    const events = keyboardAvoidingEventNamesFor(Platform.OS);
    this.subscriptions = [
      Keyboard.addListener(events.show, payload => {
        this.model.keyboardShown(payload);
        // An unchanged inset skips `setInset`, the event still has to carry a new `@Input` down
        this.changeDetector.markForCheck();
      }),
      Keyboard.addListener(events.hide, this.model.keyboardHidden),
    ];
    // The core wrapper, not AccessibilityInfo directly: the engine's iOS getter REJECTS on a
    // native error (RN parity), and nobody awaits this read, so an unwrapped call would surface
    // as an unhandled rejection. The wrapper answers false on a failed read.
    void readPrefersCrossFadeTransitions().then(enabled => {
      this.prefersCrossFadeTransitions = enabled;
    });
  }

  ngOnDestroy(): void {
    for (const subscription of this.subscriptions) subscription.remove();
    this.subscriptions = [];
  }

  // Measured before the caller's `layout` output fires
  handleLayout(event: unknown): void {
    if (!isSymbioteEvent(event)) return;
    this.model.laidOut(event.nativeEvent.layout);
    this.layout.emit(event);
  }

  // RN gates every inset on `enabled ?? true`; only an explicit `false` disables, forcing the inset
  // to 0 so every behavior mode renders the view untouched.
  private get effectiveInset(): number {
    return this.enabled === false ? 0 : this.inset;
  }

  // Not `layout`, that name is the `onLayout` output
  private get resolvedLayout(): IKeyboardAvoidingLayout {
    return resolveKeyboardAvoidingLayout({
      behavior: this.behavior,
      effectiveInset: this.effectiveInset,
      initialHeight: this.model.initialHeight(),
      style: this.style,
      contentContainerStyle: this.contentContainerStyle,
    });
  }

  get isNested(): boolean {
    return this.resolvedLayout.kind === 'nested';
  }

  get wrapperStyle(): IStyleProp<IViewStyle> | undefined {
    return this.resolvedLayout.wrapperStyle;
  }

  get innerStyle(): IStyleProp<IViewStyle> | undefined {
    return this.resolvedLayout.kind === 'nested'
      ? this.resolvedLayout.innerStyle
      : undefined;
  }

  // The wrapper's full prop bag (style + identity + a11y) folded for `[symbioteHostProps]`,
  // the same pattern Modal's `hostProps` uses over its renderModal descriptor. The anchor's
  // class-derived style goes FIRST, the resolved wrapper style SECOND — flattenStyle's later-wins
  // collapse keeps an explicit [style] winning over its ambient class.
  get hostProps(): Record<string, unknown> {
    return {
      style: [anchorHostStyle(this.elementRef), this.wrapperStyle],
      testID: this.testID,
      nativeID: this.nativeID,
      accessible: this.accessible,
      ...this.folded,
      onAccessibilityAction: this.eventEmitterHandler(this.accessibilityAction),
      onAccessibilityTap: this.eventEmitterHandler(this.accessibilityTap),
      onMagicTap: this.eventEmitterHandler(this.magicTap),
      onAccessibilityEscape: this.eventEmitterHandler(this.accessibilityEscape),
    };
  }

  // Forward an engine event to the matching @Output(), narrowing the template's untyped $event
  // first.
  private emit(emitter: EventEmitter<ISymbioteEvent>, event: unknown): void {
    if (isSymbioteEvent(event)) emitter.emit(event);
  }

  // The four accessibility events are boolean-GATED Fabric events
  // (`.claude/rules/fabric-boolean-event-gates.md`). `.observed`-gated, unlike `layout` above which
  // this component needs unconditionally for its own internal frame measurement.
  private eventEmitterHandler(
    emitter: EventEmitter<ISymbioteEvent>,
  ): ((event: unknown) => void) | undefined {
    return emitter.observed ? event => this.emit(emitter, event) : undefined;
  }

  // Folds the aria-*/role aliases into the canonical accessibility* props, native ignores aria-*
  get folded(): Partial<IAngularKeyboardAvoidingViewProps> {
    return resolveAccessibilityProps(this.accessibilityInputProps());
  }
}
