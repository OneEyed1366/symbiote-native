// Modal: the Angular lifecycle half. RCTModalHostView is an ordinary Fabric host node committing
// through the same childSet as the rest of the tree (no second JS surface). The style math (the
// backdrop override, the container/host styles, the presentationStyle default), the visible gate,
// and the iOS keep-alive reducer all live framework-agnostic in @symbiote-native/components and are shared
// verbatim with React/Vue; here Angular supplies only the lifecycle: the keep-alive state + a
// POST-render transition (ngOnChanges queues the reducer on a microtask so it runs AFTER the render
// that used the OLD state, the Angular twin of React's useEffect / Vue's post-flush watch — one
// keep-alive frame survives the visible→hidden transition), reusing renderModal's resolved props.
// The user children nest UNDER the container View via <ng-content>.

import {
  CUSTOM_ELEMENTS_SCHEMA,
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  computed,
  ElementRef,
  EventEmitter,
  inject,
  Input,
  Output,
  signal,
  type DoCheck,
  type OnChanges,
  type OnInit,
  type SimpleChanges,
} from '@angular/core';
import {
  createInitialModalState,
  modalReducer,
  renderModal,
  resolveAccessibilityProps,
  shouldRenderModal,
  type IAccessibilityProps,
  type IAccessibilityStateValue,
  type IAriaProps,
  type IModalAnimationType,
  type IModalOrientation,
  type IModalPresentationStyle,
  type IModalState,
} from '@symbiote-native/components';
import {
  dlog,
  isSymbioteEvent,
  type IStyleProp,
  type ISymbioteEvent,
  type IViewStyle,
} from '@symbiote-native/engine';
import {
  anchorHostStyle,
  ModalHost,
  SymbioteHostPropsDirective,
  SymbioteStyleInputDirective,
  ViewHost,
} from '../../primitives';

export type {
  IModalAnimationType,
  IModalPresentationStyle,
  IModalOrientation,
  IModalOrientationChangeEvent,
} from '@symbiote-native/components';

// Mirrors React's IModalProps minus children (Angular takes children via <ng-content>).
export interface IAngularModalProps extends IAccessibilityProps, IAriaProps {
  visible?: boolean;
  transparent?: boolean;
  backdropColor?: string;
  animationType?: IModalAnimationType;
  presentationStyle?: IModalPresentationStyle;
  supportedOrientations?: ReadonlyArray<IModalOrientation>;
  hardwareAccelerated?: boolean;
  statusBarTranslucent?: boolean;
  navigationBarTranslucent?: boolean;
  allowSwipeDismissal?: boolean;
  onShow?: () => void;
  onDismiss?: () => void;
  onRequestClose?: () => void;
  // The engine hands every listener the ISymbioteEvent wrapper, so the orientation is read at
  // event.nativeEvent.orientation (IModalOrientationChangeEvent describes that payload).
  onOrientationChange?: (event: ISymbioteEvent) => void;
  style?: IStyleProp<IViewStyle>;
}

// What the Modal component itself takes as plain @Input()s: the full surface minus the
// show/dismiss/close/orientation and accessibility events, which it exposes as real @Output()
// EventEmitters instead (see the class below), mirroring the Pressable family's onPress -> press
// conversion (adapters/angular/src/components/pressable/index.ts).
export type IAngularModalInputs = Omit<
  IAngularModalProps,
  | 'onShow'
  | 'onDismiss'
  | 'onRequestClose'
  | 'onOrientationChange'
  | 'onAccessibilityAction'
  | 'onAccessibilityTap'
  | 'onMagicTap'
  | 'onAccessibilityEscape'
>;

@Component({
  selector: 'Modal',
  standalone: true,
  hostDirectives: [{ directive: SymbioteStyleInputDirective, inputs: ['style'] }],
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
  imports: [ModalHost, ViewHost, SymbioteHostPropsDirective],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (shouldRender) {
      <symbiote-modal
        [symbioteHostProps]="hostProps()"
        (show)="show.emit()"
        (dismiss)="dismiss.emit()"
        (requestClose)="requestClose.emit()"
        (orientationChange)="emit(orientationChange, $event)"
        (accessibilityAction)="emit(accessibilityAction, $event)"
        (accessibilityTap)="emit(accessibilityTap, $event)"
        (magicTap)="emit(magicTap, $event)"
        (accessibilityEscape)="emit(accessibilityEscape, $event)"
      >
        <symbiote-view [style]="containerStyle" [collapsable]="false">
          <ng-content></ng-content>
        </symbiote-view>
      </symbiote-modal>
    }
  `,
})
export class Modal implements IAngularModalInputs, OnInit, OnChanges, DoCheck {
  @Output() readonly show = new EventEmitter<void>();
  @Output() readonly dismiss = new EventEmitter<void>();
  @Output() readonly requestClose = new EventEmitter<void>();
  @Output() readonly orientationChange = new EventEmitter<ISymbioteEvent>();
  @Output() readonly accessibilityAction = new EventEmitter<ISymbioteEvent>();
  @Output() readonly accessibilityTap = new EventEmitter<ISymbioteEvent>();
  @Output() readonly magicTap = new EventEmitter<ISymbioteEvent>();
  @Output() readonly accessibilityEscape = new EventEmitter<ISymbioteEvent>();
  @Input() visible?: boolean;
  @Input() transparent?: boolean;
  @Input() backdropColor?: string;
  @Input() animationType?: IModalAnimationType;
  @Input() presentationStyle?: IModalPresentationStyle;
  @Input() supportedOrientations?: ReadonlyArray<IModalOrientation>;
  @Input() hardwareAccelerated?: boolean;
  @Input() statusBarTranslucent?: boolean;
  @Input() navigationBarTranslucent?: boolean;
  @Input() allowSwipeDismissal?: boolean;
  @Input() style?: IStyleProp<IViewStyle>;
  @Input() testID?: string;
  @Input() accessible?: boolean;
  @Input() accessibilityLabel?: string;
  @Input() accessibilityHint?: string;
  @Input() accessibilityRole?: IAccessibilityProps['accessibilityRole'];
  @Input() accessibilityState?: IAccessibilityStateValue;
  @Input() accessibilityValue?: IAccessibilityProps['accessibilityValue'];
  @Input() accessibilityActions?: IAccessibilityProps['accessibilityActions'];
  @Input() accessibilityLabelledBy?: string | string[];
  @Input() importantForAccessibility?: IAccessibilityProps['importantForAccessibility'];
  @Input() accessibilityLiveRegion?: IAccessibilityProps['accessibilityLiveRegion'];
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

  // The iOS keep-alive (state/modal.ts): on visible→hidden the node renders one more frame
  // (isRendered still true) before unmounting, so the native onDismiss can arrive.
  private state: IModalState = createInitialModalState(false);

  private readonly changeDetector = inject(ChangeDetectorRef);
  // This component's OWN host — the non-painting anchor `class="..."` at the use site resolves
  // onto (see anchorHostStyle's doc comment) — NOT the inner `symbiote-view [style]="containerStyle"`
  // that hosts the user children; the outer `symbiote-modal` node (bound via `hostProps` below) is
  // the real primitive the anchor sits in front of.
  private readonly elementRef = inject(ElementRef);

  ngOnInit(): void {
    this.state = createInitialModalState(this.visible === true);
  }

  // Bridges the non-reactive @Input fields `hostProps` reads into the reactive graph, so it can
  // memoize. Plain fields read inside a computed() are UNTRACKED - something must signal "a
  // dependency changed" or the bag goes stale. Signal inputs would do this natively, but `input()`
  // is visible only to the AOT compiler and this package's unit suite runs on JIT (see the
  // `angular-adapter-change-detection` skill, §6); `signal()`/`computed()` are plain runtime APIs.
  // The keep-alive `state` is deliberately NOT a dependency: it gates `shouldRender`, never the bag.
  private readonly hostPropsRevision = signal(0);
  // What the anchor's class-derived style was when the bag was last built (identity, not value).
  private lastAnchorStyle: unknown;

  ngOnChanges(changes: SimpleChanges): void {
    // Before the keep-alive early-return below: this is the single moment Angular has finished
    // writing every changed @Input, and `hostProps` depends on far more than `visible`.
    this.hostPropsRevision.update(revision => revision + 1);
    const visibleChange = changes.visible;
    // First change is reflected by the ngOnInit seed; only later toggles drive the keep-alive.
    if (visibleChange === undefined || visibleChange.firstChange) return;
    const isVisible = this.visible === true;
    // Queue on a microtask so the reducer runs AFTER this CD pass renders with the OLD state —
    // the keep-alive frame. A synchronous dispatch here would unmount in the same pass.
    queueMicrotask(() => {
      this.state = modalReducer(this.state, isVisible ? { type: 'show' } : { type: 'hide' });
      this.changeDetector.markForCheck();
    });
  }

  get shouldRender(): boolean {
    const render = shouldRenderModal(this.visible === true, this.state);
    if (!render) dlog('Modal hidden -> no node committed');
    return render;
  }

  // renderModal owns the backdrop/presentationStyle/style math (shared with React/Vue); the
  // adapter reads the resolved host + container props off the Descriptor it returns.
  private get descriptor() {
    return renderModal({
      visible: this.visible,
      transparent: this.transparent,
      backdropColor: this.backdropColor,
      animationType: this.animationType,
      presentationStyle: this.presentationStyle,
      supportedOrientations: this.supportedOrientations,
      hardwareAccelerated: this.hardwareAccelerated,
      statusBarTranslucent: this.statusBarTranslucent,
      navigationBarTranslucent: this.navigationBarTranslucent,
      allowSwipeDismissal: this.allowSwipeDismissal,
      style: this.style,
      passthrough: resolveAccessibilityProps(this.accessibilityInputs()),
    });
  }

  // The anchor's class-derived style is NOT an @Input: `class="..."`/`[ngClass]` at the use site
  // resolves through the renderer's addClass onto this component's anchor host (see
  // anchorHostStyle's doc comment), so it never shows up in SimpleChanges and ngOnChanges alone
  // would leave a later class toggle stranded. ngDoCheck runs at exactly the cadence the old
  // getter was re-read, and bumps only on a real identity change.
  ngDoCheck(): void {
    const anchorStyle = anchorHostStyle(this.elementRef);
    if (anchorStyle === this.lastAnchorStyle) return;
    this.lastAnchorStyle = anchorStyle;
    this.hostPropsRevision.update(revision => revision + 1);
  }

  // renderModal's own MODAL_HOST_STYLE (position:'absolute') is the outer symbiote-modal node's
  // style; the anchor's class-derived style goes FIRST, that resolved style SECOND —
  // flattenStyle's later-wins collapse keeps the modal's own style winning over its ambient class.
  //
  // A computed(), not a getter: Angular re-reads a template getter on every refresh of this view
  // and `[symbioteHostProps]` compares by REFERENCE, so a freshly rebuilt (but identical) bag
  // re-pushes every key through renderer.setProperty -> the engine's prop routing - and this one
  // re-runs renderModal to build it.
  readonly hostProps = computed<Record<string, unknown>>(() => {
    this.hostPropsRevision();
    const descriptorProps = this.descriptor.props;
    return { ...descriptorProps, style: [anchorHostStyle(this.elementRef), descriptorProps.style] };
  });

  get containerStyle(): unknown {
    const container = this.descriptor.children[0];
    return typeof container === 'string' ? undefined : container.props.style;
  }

  emit(emitter: EventEmitter<ISymbioteEvent>, event: unknown): void {
    if (isSymbioteEvent(event)) emitter.emit(event);
  }

  // Typed as the a11y intersection WITH the string index (the bag renderModal spreads into the
  // host props), so resolveAccessibilityProps's result stays assignable to passthrough.
  private accessibilityInputs(): IAccessibilityProps & IAriaProps & Record<string, unknown> {
    return {
      testID: this.testID,
      accessible: this.accessible,
      accessibilityLabel: this.accessibilityLabel,
      accessibilityHint: this.accessibilityHint,
      accessibilityRole: this.accessibilityRole,
      accessibilityState: this.accessibilityState,
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
      accessibilityRespondsToUserInteraction: this.accessibilityRespondsToUserInteraction,
      accessibilityShowsLargeContentViewer: this.accessibilityShowsLargeContentViewer,
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
    };
  }
}
