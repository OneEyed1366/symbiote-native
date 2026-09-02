// InputAccessoryView, the Angular lifecycle half (iOS). RCTInputAccessoryView is a real Fabric
// host node that docks its content above the keyboard; a TextInput points at it by nativeID through
// its inputAccessoryViewID. The host-node assembly (nativeID / backgroundColor / style /
// accessibility forwarding) lives framework-agnostic in
// @symbiote-native/components/renderInputAccessoryView and is shared verbatim with React/Vue; here
// Angular supplies only the lifecycle — it folds aria/role, reads the resolved props off the
// Descriptor, and nests the user children under the host via <ng-content>. The Angular twin of the
// React/Vue InputAccessoryView. No platform branch, so this stays flat.

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
} from '@angular/core';
import {
  renderInputAccessoryView,
  resolveAccessibilityProps,
  type IAccessibilityProps,
  type IAccessibilityStateValue,
  type IAriaProps,
} from '@symbiote-native/components';
import {
  isSymbioteEvent,
  type IStyleProp,
  type ISymbioteEvent,
  type IViewStyle,
} from '@symbiote-native/engine';
import {
  anchorHostStyle,
  InputAccessoryViewHost,
  SymbioteHostPropsDirective,
  SymbioteStyleInputDirective,
} from '../../primitives';

// Mirrors React's IInputAccessoryViewProps minus children (Angular takes children via
// <ng-content>), declared per-adapter over the shared a11y base.
export interface IAngularInputAccessoryViewProps
  extends IAccessibilityProps, IAriaProps {
  // The id a TextInput's inputAccessoryViewID points at to dock above its keyboard.
  nativeID?: string;
  backgroundColor?: string;
  style?: IStyleProp<IViewStyle>;
}

// What the component itself takes as plain @Input()s: the full surface minus the accessibility
// callbacks, which it exposes as real @Output() EventEmitters instead (see the class below),
// mirroring Pressable's IAngularPressableInputs split.
export type IAngularInputAccessoryViewInputs = Omit<
  IAngularInputAccessoryViewProps,
  | 'onAccessibilityAction'
  | 'onAccessibilityTap'
  | 'onMagicTap'
  | 'onAccessibilityEscape'
>;

@Component({
  selector: 'InputAccessoryView',
  standalone: true,
  hostDirectives: [
    { directive: SymbioteStyleInputDirective, inputs: ['style'] },
  ],
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
  imports: [InputAccessoryViewHost, SymbioteHostPropsDirective],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <symbiote-input-accessory-view [symbioteHostProps]="hostProps()">
      <ng-content></ng-content>
    </symbiote-input-accessory-view>
  `,
})
export class InputAccessoryView
  implements IAngularInputAccessoryViewInputs, OnChanges, DoCheck
{
  @Input() nativeID?: string;
  @Input() backgroundColor?: string;
  @Input() style?: IStyleProp<IViewStyle>;
  @Output() readonly accessibilityAction = new EventEmitter<ISymbioteEvent>();
  @Output() readonly accessibilityTap = new EventEmitter<ISymbioteEvent>();
  @Output() readonly magicTap = new EventEmitter<ISymbioteEvent>();
  @Output() readonly accessibilityEscape = new EventEmitter<ISymbioteEvent>();
  @Input() testID?: string;
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
  // onto (see anchorHostStyle's doc comment). InputAccessoryView has no inner ViewChild, so this
  // is the only ElementRef in the class.
  private readonly elementRef = inject(ElementRef);

  // Forward an engine event to the matching @Output(), narrowing the template's untyped $event.
  private emit(emitter: EventEmitter<ISymbioteEvent>, event: unknown): void {
    if (isSymbioteEvent(event)) emitter.emit(event);
  }

  // The four accessibility events are boolean-GATED Fabric events
  // (`.claude/rules/fabric-boolean-event-gates.md`). `.observed`-gated, mirroring Pressable's.
  private eventEmitterHandler(
    emitter: EventEmitter<ISymbioteEvent>,
  ): ((event: unknown) => void) | undefined {
    return emitter.observed ? event => this.emit(emitter, event) : undefined;
  }

  // renderInputAccessoryView owns the host-node assembly (shared with React/Vue); the adapter reads
  // the resolved host props off the Descriptor it returns.
  private get descriptor() {
    return renderInputAccessoryView({
      nativeID: this.nativeID,
      backgroundColor: this.backgroundColor,
      style: this.style,
      passthrough: resolveAccessibilityProps(this.accessibilityInputs()),
    });
  }

  // Bridges the non-reactive fields `hostProps` reads into the reactive graph, so it can memoize.
  // Plain fields read inside a computed() are UNTRACKED - something must signal "a dependency
  // changed" or the bag goes stale. Signal inputs would do this natively, but `input()` is visible
  // only to the AOT compiler and this package's unit suite runs on JIT (see the
  // `angular-adapter-change-detection` skill, §6); `signal()`/`computed()` are plain runtime APIs.
  private readonly hostPropsRevision = signal(0);
  // What the anchor's class-derived style was when the bag was last built (identity, not value).
  private lastAnchorStyle: unknown;

  ngOnChanges(): void {
    // The single moment Angular has finished writing every changed @Input for this pass.
    this.hostPropsRevision.update(revision => revision + 1);
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

  // The anchor's class-derived style goes FIRST, the Descriptor's resolved style SECOND —
  // flattenStyle's later-wins collapse keeps an explicit [style] winning over its ambient class.
  //
  // A computed(), not a getter: Angular re-reads a template getter on every refresh of this view
  // and `[symbioteHostProps]` compares by REFERENCE, so a freshly rebuilt (but identical) bag
  // re-pushes every key through renderer.setProperty -> the engine's prop routing - and this one
  // re-runs renderInputAccessoryView to build it.
  readonly hostProps = computed<Record<string, unknown>>(() => {
    this.hostPropsRevision();
    const descriptorProps = this.descriptor.props;
    return {
      ...descriptorProps,
      style: [anchorHostStyle(this.elementRef), descriptorProps.style],
      onAccessibilityAction: this.eventEmitterHandler(this.accessibilityAction),
      onAccessibilityTap: this.eventEmitterHandler(this.accessibilityTap),
      onMagicTap: this.eventEmitterHandler(this.magicTap),
      onAccessibilityEscape: this.eventEmitterHandler(this.accessibilityEscape),
    };
  });

  // Typed as the a11y intersection WITH the string index (the bag renderInputAccessoryView spreads
  // into the host props), so resolveAccessibilityProps's result stays assignable to passthrough.
  private accessibilityInputs(): IAccessibilityProps &
    IAriaProps &
    Record<string, unknown> {
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
    };
  }
}
