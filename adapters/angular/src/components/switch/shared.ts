import {
  ChangeDetectorRef,
  Directive,
  EventEmitter,
  Output,
  computed,
  inject,
  signal,
  type OnChanges,
} from '@angular/core';
import type { ControlValueAccessor } from '@angular/forms';
import {
  renderSwitch,
  resolveAccessibilityProps,
} from '@symbiote-native/components';
import type {
  ISwitchPlatform,
  ISwitchProps,
  ISwitchState,
  ISwitchTrackColor,
} from '@symbiote-native/components';
import {
  createInitialSwitchState,
  shouldSnapBack,
  switchReducer,
  valueFromChange,
} from '@symbiote-native/components';
import {
  dispatchViewCommand,
  dlog,
  isSymbioteNode,
  whenCommitted,
  type ISymbioteEvent,
  type ISymbioteNode,
  type IStyleProp,
  type IViewStyle,
} from '@symbiote-native/engine';

export type {
  ISwitchProps,
  ISwitchTrackColor,
} from '@symbiote-native/components';

export type ISwitchInputs = Pick<
  ISwitchProps,
  | 'value'
  | 'disabled'
  | 'trackColor'
  | 'thumbColor'
  | 'ios_backgroundColor'
  | 'style'
  | 'nativeID'
  | 'testID'
  | 'accessibilityLabel'
  | 'accessibilityRole'
  | 'accessibilityState'
  | 'accessibilityValue'
  | 'accessibilityHint'
  | 'accessible'
  | 'role'
  | 'aria-label'
  | 'aria-disabled'
  | 'aria-checked'
>;

type ISwitchHostPlatform = ISwitchPlatform & { snapBackCommand: string };

type IHostProps = Record<string, unknown>;

function readSwitchNode(value: unknown): ISymbioteNode | null {
  if (isSymbioteNode(value)) return value;
  if (
    typeof value === 'object' &&
    value !== null &&
    'node' in value &&
    isSymbioteNode(value.node)
  ) {
    return value.node;
  }
  return null;
}

function isSwitchEvent(event: unknown): event is ISymbioteEvent {
  return (
    typeof event === 'object' &&
    event !== null &&
    'nativeEvent' in event &&
    typeof event.nativeEvent === 'object' &&
    event.nativeEvent !== null
  );
}

// @Directive() (no selector) is the Angular-sanctioned decorator for an abstract base whose
// concrete subclasses are real @Components — ngc's AOT build (NG2007) requires it the moment the
// base itself carries decorated members (@Output() here), mirroring ScrollViewBase.
@Directive()
export abstract class SwitchBase
  implements ISwitchInputs, ControlValueAccessor, OnChanges
{
  // The value/change lifecycle as real Angular events: `(valueChange)="onToggle($event)"`, not
  // `[onValueChange]="onToggle"` — mirrors Pressable's press/hover @Output() conversion. Unlike
  // Pressable's createPressHandlers, handleChange() below calls `.emit()` unconditionally: it needs
  // no "was this bound" adapter because EventEmitter.emit() is already a safe no-op with no subscribers.
  @Output() readonly valueChange = new EventEmitter<boolean>();
  @Output() readonly change = new EventEmitter<ISymbioteEvent>();
  value: boolean | undefined;
  disabled: boolean | undefined;
  trackColor: ISwitchTrackColor | undefined;
  thumbColor: string | undefined;
  ios_backgroundColor: string | undefined;
  style: IStyleProp<IViewStyle> | undefined;
  nativeID: string | undefined;
  testID: string | undefined;
  accessibilityLabel: string | undefined;
  accessibilityRole: ISwitchInputs['accessibilityRole'];
  accessibilityState: ISwitchInputs['accessibilityState'];
  accessibilityValue: ISwitchInputs['accessibilityValue'];
  accessibilityHint: string | undefined;
  accessible: boolean | undefined;
  role: ISwitchInputs['role'];
  'aria-label': string | undefined;
  'aria-disabled': boolean | undefined;
  'aria-checked': boolean | 'mixed' | undefined;

  protected abstract readonly platform: ISwitchHostPlatform;
  // NOT a hostProps dependency - only snapBackIfNeeded reads it, and the bag's `value` comes from
  // the @Input, not from this reducer state. So it stays a plain field; if a future change makes
  // the bag read it, it must become a signal first (see inputsRevision's note).
  private switchState: ISwitchState = createInitialSwitchState();
  // Only setDisabledState()/writeValue() need this: @angular/forms mutates `value`/`disabled` from
  // OUTSIDE Angular's own binding path, which doesn't itself schedule a tick under zoneless CD.
  private readonly changeDetector = inject(ChangeDetectorRef);

  // Bridges the non-reactive @Input fields into the reactive graph so hostProps below can be a
  // memoized computed(). Signal inputs would make this unnecessary, but `input()` is visible only
  // to the AOT compiler and this package's unit suite runs on JIT - see the
  // `angular-adapter-change-detection` skill, §6. `signal()`/`computed()` are plain runtime APIs
  // and need no compiler support, which is what makes this bridge possible at all.
  //
  // Bumped from ngOnChanges (covers every @Input) AND from the two ControlValueAccessor writers
  // below, which assign `value`/`disabled` from OUTSIDE Angular's binding path and so never reach
  // ngOnChanges. ONLY a genuine dependency of the bag may bump it - widening it to "bump on
  // everything" silently un-memoizes the bag and defeats the point. State that is not an @Input
  // and is not one of those two writers needs its OWN signal instead (the platform components'
  // anchor style is exactly that case).
  private readonly inputsRevision = signal(0);

  ngOnChanges(): void {
    this.inputsRevision.update(revision => revision + 1);
  }

  // MEASURED 2026-08-16: as a getter this rebuilt the bag on every refresh of this view, so
  // `[symbioteHostProps]`'s reference check failed every time and every key was re-pushed through
  // Renderer2 -> routeProp - pure waste when nothing changed. computed() returns the SAME object
  // until a tracked dependency actually changes, and the input setter then skips the whole spread.
  //
  // A computed FIELD cannot be overridden by a subclass accessor the way a getter can, so the
  // platform components override buildHostProps() below and this stays the single memoization
  // point for every platform.
  readonly hostProps = computed<IHostProps>(() => {
    this.inputsRevision();
    return this.buildHostProps();
  });

  protected buildHostProps(): IHostProps {
    const props = resolveAccessibilityProps(this.inputProps());
    const {
      value,
      disabled,
      trackColor,
      thumbColor,
      ios_backgroundColor,
      style,
      onValueChange: _onValueChange,
      ...passthrough
    } = props;

    return renderSwitch(
      {
        value: value === true,
        disabled,
        trackColor,
        thumbColor,
        ios_backgroundColor,
        style,
        passthrough,
      },
      this.platform,
    ).props;
  }

  handleChange(event: unknown, node: unknown): void {
    if (!isSwitchEvent(event)) return;
    this.change.emit(event);
    const next = valueFromChange(event);
    dlog(
      `Switch onChange value=${String(next)} eventCount=${String(event.nativeEvent.eventCount)}`,
    );
    if (next === undefined) return;

    this.valueChange.emit(next);
    this.switchState = switchReducer(this.switchState, {
      type: 'native-reported',
      value: next,
    });

    const hostNode = readSwitchNode(node);
    if (hostNode === null) return;
    queueMicrotask(() => this.snapBackIfNeeded(hostNode));
  }

  private snapBackIfNeeded(node: ISymbioteNode): void {
    const fabricValue = this.value === true;
    if (!shouldSnapBack(this.switchState, fabricValue)) {
      dlog(
        `Switch snap-back no-op reported=${String(this.switchState.lastNativeReport)} value=${fabricValue}`,
      );
      return;
    }

    dlog(
      `Switch ${this.platform.snapBackCommand} snap-back reported=${String(this.switchState.lastNativeReport)} value=${fabricValue}`,
    );
    whenCommitted(node, () => {
      dispatchViewCommand(node, this.platform.snapBackCommand, [fabricValue]);
    });
  }

  // ControlValueAccessor — `value` is a plain field feeding `hostProps` on every CD check, no
  // ngOnChanges/stale-safe commit dance to guard (unlike TextInput, a boolean toggle has no
  // keystroke to race), so writeValue()/setDisabledState() can set it straight.
  writeValue(value: boolean | null): void {
    this.value = value ?? false;
    // `value` feeds hostProps but this write bypasses Angular's binding path, so ngOnChanges never
    // fires for it - without the bump the memoized bag would keep reporting the old value and the
    // switch would stop reflecting a form-driven change.
    this.inputsRevision.update(revision => revision + 1);
    this.changeDetector.markForCheck();
  }

  registerOnChange(fn: (value: boolean) => void): void {
    this.valueChange.subscribe(fn);
  }

  registerOnTouched(fn: () => void): void {
    // Switch has no blur concept (it's a discrete toggle, not a text field) — `change` is the
    // closest touched signal, same convention Angular's own checkbox CVAs use.
    this.change.subscribe(() => fn());
  }

  setDisabledState(isDisabled: boolean): void {
    this.disabled = isDisabled;
    // Same reason as writeValue: an @angular/forms write that never reaches ngOnChanges.
    this.inputsRevision.update(revision => revision + 1);
    this.changeDetector.markForCheck();
  }

  private inputProps(): Partial<ISwitchProps> {
    const props: Partial<ISwitchProps> = {
      value: this.value,
      disabled: this.disabled,
      trackColor: this.trackColor,
      thumbColor: this.thumbColor,
      ios_backgroundColor: this.ios_backgroundColor,
      style: this.style,
    };

    return {
      ...props,
      nativeID: this.nativeID,
      testID: this.testID,
      accessibilityLabel: this.accessibilityLabel,
      accessibilityRole: this.accessibilityRole,
      accessibilityState: this.accessibilityState,
      accessibilityValue: this.accessibilityValue,
      accessibilityHint: this.accessibilityHint,
      accessible: this.accessible,
      role: this.role,
      'aria-label': this['aria-label'],
      'aria-disabled': this['aria-disabled'],
      'aria-checked': this['aria-checked'],
    };
  }
}
