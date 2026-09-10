// RefreshControl, the Angular lifecycle half. On iOS this is the PullToRefreshView Fabric node that
// lives INSIDE a ScrollView (a childless sibling before the content container); on Android it is
// AndroidSwipeRefreshLayout and WRAPS the scroll view, receiving it through <ng-content>. There is
// no JS-side platform renaming and no shared render fn — every prop forwards straight to the
// native node, which reads what it understands and ignores the rest, so Android-only and iOS-only
// prop families ride down harmlessly on both. This folds aria/role through the shared
// resolveAccessibilityProps and maps the native props + a11y + onRefresh onto the
// refresh-control host, children via <ng-content>. One composed component covers both
// platforms, so this stays a flat single file.
//
// `refreshing` is a controlled prop: the parent owns it and pushes it down each commit; native
// reports the gesture via the direct `topRefresh` event, which the engine routes to the host's
// `refresh` listener (Angular blocks [onX] property bindings; events flow through (event) only).
//
// THE CONTROLLED HANDSHAKE IS NOT HERE ANY MORE. This component used to carry its own
// `lastNativeRefreshing` mirror and dispatch `setNativeRefreshing` when the app's value disagreed —
// alone among the five adapters, so the other four silently spun forever on a no-op handler. It now
// lives in `core/components/src/behaviors/refresh-control.ts`, attached to the `refresh-control`
// tag this template renders, which gives every adapter the same correction. Keeping a copy here
// would put TWO owners on one node and dispatch the command twice per rejected pull.

import {
  CUSTOM_ELEMENTS_SCHEMA,
  ChangeDetectionStrategy,
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
  resolveAccessibilityProps,
  type IAccessibilityProps,
  type IAccessibilityStateValue,
  type IAriaProps,
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
  RefreshControlHost,
  SymbioteHostPropsDirective,
  SymbioteStyleInputDirective,
} from '../../primitives';

// Record<string, unknown> already tolerates `style` holding the [anchorHostStyle, this.style]
// array anchorHostStyle's merge produces (see hostProps below) — no widening needed.
type IHostProps = Record<string, unknown>;

// Mirrors React's IRefreshControlProps minus children (Angular takes the Android-wrapped scroll view
// via <ng-content>), declared per-adapter over the shared accessibility base since the framework-specific
// children slot keeps it from being fully shared across adapters. Read the React reference for the
// native prop names.
export interface IAngularRefreshControlProps
  extends IAccessibilityProps, IAriaProps {
  refreshing: boolean;
  // `id` — RN's W3C alias for `nativeID`, folded by the spec entry's ID_ALIAS. See React's
  // declaration for why the prop and the alias land together.
  id?: string;
  // RN's onRefresh is `() => void | Promise<void>`, the handler may be async; the promise is
  // fire-and-forget (native already starts refreshing on the gesture).
  onRefresh?: () => void | Promise<void>;
  tintColor?: string;
  title?: string;
  titleColor?: string;
  progressViewOffset?: number;
  // Android-only spinner styling (RN RefreshControlPropsAndroid): `colors` are the indicator's
  // animated stroke colors, `progressBackgroundColor` the disc behind it, `size` the diameter preset.
  // AndroidSwipeRefreshLayout reads them; PullToRefreshView on iOS ignores unknown props.
  colors?: readonly string[];
  progressBackgroundColor?: string;
  size?: 'default' | 'large';
  // Android-only native prop forwarded to AndroidSwipeRefreshLayout; iOS native never reads it.
  enabled?: boolean;
  // The Android scroll-view wrap injects the layout half of the style onto this host; iOS leaves it
  // unset (the RefreshControl is a childless sibling). Harmless to forward on both.
  style?: IStyleProp<IViewStyle>;
}

// What the RefreshControl component itself takes as plain @Input()s: the full surface minus the
// refresh/accessibility events, which it exposes as real @Output() EventEmitters instead (mirrors
// Pressable's IAngularPressableInputs in pressable/index.ts).
export type IAngularRefreshControlInputs = Omit<
  IAngularRefreshControlProps,
  | 'onRefresh'
  | 'onAccessibilityAction'
  | 'onAccessibilityTap'
  | 'onMagicTap'
  | 'onAccessibilityEscape'
>;

@Component({
  selector: 'RefreshControl',
  standalone: true,
  hostDirectives: [
    { directive: SymbioteStyleInputDirective, inputs: ['style'] },
  ],
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
  imports: [RefreshControlHost, SymbioteHostPropsDirective],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <refresh-control
      [symbioteHostProps]="hostProps()"
      (refresh)="handleRefresh()"
    >
      <ng-content></ng-content>
    </refresh-control>
  `,
})
export class RefreshControl
  implements IAngularRefreshControlInputs, OnInit, OnChanges, DoCheck
{
  // Controlled prop the parent owns; required to match the React reference surface.
  @Input({ required: true }) refreshing!: boolean;
  // RN's onRefresh is `() => void | Promise<void>`, so the callback shape allows an async handler;
  // the @Output() itself only signals the gesture (fire-and-forget, native already starts refreshing).
  @Output() readonly refresh = new EventEmitter<void>();
  @Input() tintColor?: string;
  @Input() title?: string;
  @Input() titleColor?: string;
  @Input() progressViewOffset?: number;
  @Input() colors?: readonly string[];
  @Input() progressBackgroundColor?: string;
  @Input() size?: 'default' | 'large';
  @Input() enabled?: boolean;
  @Input() style?: IStyleProp<IViewStyle>;
  @Input() testID?: string;
  @Input() nativeID?: string;
  @Input() id?: string;
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
  @Output() readonly accessibilityAction = new EventEmitter<ISymbioteEvent>();
  @Output() readonly accessibilityTap = new EventEmitter<ISymbioteEvent>();
  @Output() readonly magicTap = new EventEmitter<ISymbioteEvent>();
  @Output() readonly accessibilityEscape = new EventEmitter<ISymbioteEvent>();
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
  // onto (see anchorHostStyle's doc comment) — distinct from `host` above, which targets the real
  // inner `refresh-control` primitive one level down.
  private readonly elementRef = inject(ElementRef);

  // Bridges the non-reactive @Input fields `hostProps` reads into the reactive graph, so it can
  // memoize. Plain fields read inside a computed() are UNTRACKED - something must signal "a
  // dependency changed" or the bag goes stale. Signal inputs would do this natively, but `input()`
  // is visible only to the AOT compiler and this package's unit suite runs on JIT (see the
  // `angular-adapter-change-detection` skill, §6); `signal()`/`computed()` are plain runtime APIs.
  // Safe here because `refreshing` is a CONTROLLED @Input - the parent owns it, nothing in this
  // class assigns it.
  //
  // PUBLIC because ScrollView projects this component rather than rendering its template: it reads
  // these same plain fields off the instance to build its own `refresh-control`, and a plain field
  // read registers no dependency, so its view was never dirtied when `refreshing` moved. Reading
  // this signal there is what makes a projected control's inputs reach the node at all — the
  // ScrollView's own comment predicted the need ("giving RefreshControl its own revision signal to
  // read here") and the gap was invisible while the wrapper corrected native imperatively.
  readonly hostPropsRevision = signal(0);
  // What the anchor's class-derived style was when the bag was last built (identity, not value).
  private lastAnchorStyle: unknown;

  ngOnInit(): void {
    dlog('RefreshControl -> PullToRefreshView');
    dlog(`RefreshControl refreshing=${String(this.refreshing)}`);
    if (this.enabled !== undefined)
      dlog(`RefreshControl enabled=${String(this.enabled)} (Android-only)`);
    if (this.refresh.observed) dlog('RefreshControl refresh listener wired');
  }

  ngOnChanges(_changes: SimpleChanges): void {
    // The single moment Angular has finished writing every changed @Input, and `hostProps` depends
    // on the whole input surface.
    this.hostPropsRevision.update(revision => revision + 1);
  }

  // Just the @Output(). The engine's behavior owns the mirror and the corrective command; it calls
  // this listener from its own `refresh` dispatcher, so the emit still runs before the check.
  handleRefresh(): void {
    this.refresh.emit();
  }

  // Forward an engine event to the matching @Output(), narrowing the template's untyped $event
  // first. The accessibility* events arrive on the engine's structural event channel.
  private emit(emitter: EventEmitter<ISymbioteEvent>, event: unknown): void {
    if (isSymbioteEvent(event)) emitter.emit(event);
  }

  // The four accessibility events are boolean-GATED Fabric events
  // (`.claude/rules/fabric-boolean-event-gates.md`): a template binding here lit the gate on every
  // instance whether or not an app ever subscribed. `.observed`-gated, mirroring Pressable's.
  private eventEmitterHandler(
    emitter: EventEmitter<ISymbioteEvent>,
  ): ((event: unknown) => void) | undefined {
    return emitter.observed ? event => this.emit(emitter, event) : undefined;
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

  // The full native + a11y prop bag applied onto the host in one shot via
  // [symbioteHostProps], instead of enumerating each key as its own template binding. The
  // anchor's class-derived style goes FIRST, this component's own explicit `style` @Input SECOND
  // — flattenStyle's later-wins collapse keeps an explicit [style] winning over its ambient class.
  //
  // A computed(), not a getter: Angular re-reads a template getter on every refresh of this view
  // and `[symbioteHostProps]` compares by REFERENCE, so a freshly rebuilt (but identical) bag
  // re-pushes every key through renderer.setProperty -> the engine's prop routing. A pull gesture
  // dirties this view through its own `(refresh)` binding, which is exactly when that waste hit.
  readonly hostProps = computed<IHostProps>(() => {
    this.hostPropsRevision();
    return {
      refreshing: this.refreshing,
      tintColor: this.tintColor,
      title: this.title,
      titleColor: this.titleColor,
      progressViewOffset: this.progressViewOffset,
      colors: this.colors,
      progressBackgroundColor: this.progressBackgroundColor,
      size: this.size,
      enabled: this.enabled,
      style: [anchorHostStyle(this.elementRef), this.style],
      testID: this.testID,
      nativeID: this.nativeID,
      id: this.id,
      accessible: this.accessible,
      ...this.folded,
      onAccessibilityAction: this.eventEmitterHandler(this.accessibilityAction),
      onAccessibilityTap: this.eventEmitterHandler(this.accessibilityTap),
      onMagicTap: this.eventEmitterHandler(this.magicTap),
      onAccessibilityEscape: this.eventEmitterHandler(this.accessibilityEscape),
    };
  });

  // Fold the web aria-*/role aliases into the canonical accessibility* props once per render, so the
  // host node never sees an aria-* key (native ignores them) — the shared transform every adapter runs.
  get folded(): Partial<IAngularRefreshControlProps> {
    return resolveAccessibilityProps({
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
