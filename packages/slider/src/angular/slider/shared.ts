// Slider, the Angular lifecycle half. The logic (value/limit/disabled folds, the step-option
// layout) and the native render live in @symbiote-native/slider core, shared verbatim with the Vue
// adapter; here Angular supplies plain class fields (mirroring ActivityIndicatorBase/SwitchBase)
// plus real @Output() EventEmitters for the four native callbacks, and renders through
// DescriptorOutlet — the generic descriptor-to-Angular bridge — since this component has no
// imperative-ref need the Descriptor prop bag can't carry. The native RNCSlider view carries no
// symbiote metadata: the engine derives its events and color processors from the library's
// ViewConfig at runtime, registered by the side-effect import in ../../register (pulled in by the
// package barrel, NOT here, so this module and its tests stay free of the third-party spec). We
// never import the library's own React Slider component here — that component calls React hooks
// off the React dispatcher internally, which is null under Angular, so it would crash if rendered
// directly; instead the engine derives the native view's events and prop processors from its
// ViewConfig at runtime, keeping this wrapper framework-agnostic underneath.
//
// KNOWN GAP (deliberate, scoped by the task this module was built for): the custom `StepMarker`
// render slot (a per-adapter overlay element — a React FC, a Vue scoped slot) has no Angular
// equivalent yet. The natural analogue is a `@ContentChild(TemplateRef) stepMarker?:
// TemplateRef<IStepMarkerProps>` projected per step cell via `NgTemplateOutlet`, but wiring an
// embedded view per cell (constructing it, feeding its context, keeping it in step with
// DescriptorOutlet's imperative patch model, which has no notion of TemplateRefs) is
// disproportionate complexity for a path no real caller exercises today (examples/react/App.tsx's
// Slider usage has no step markers at all). Everything else — value/limits/disabled/colors/
// thumbImage/style/every event, and the DEFAULT numbered step indicator (`renderStepNumber`) — is
// fully implemented below; only the custom-marker overlay is unimplemented.

import {
  ChangeDetectorRef,
  Directive,
  ElementRef,
  EventEmitter,
  inject,
  Input,
  Output,
  type OnChanges,
} from '@angular/core';
import type { ControlValueAccessor } from '@angular/forms';
import {
  AccessibilityInputsBase,
  anchorHostStyle,
} from '@symbiote-native/angular';
import { resolveAccessibilityProps } from '@symbiote-native/components';
import type { IDescriptor } from '@symbiote-native/components';
import { dlog, type ISymbioteEvent } from '@symbiote-native/engine';
import {
  sanitizeSliderValue,
  resolveSliderDisabled,
  resolveSliderAccessibilityState,
  resolveSliderLowerLimit,
  resolveSliderUpperLimit,
  valueFromSliderEvent,
  shouldRenderStepsIndicator,
  resolveThumbTintColor,
  shouldPassNativeThumbImage,
  isInvalidLimitConfig,
  computeStepOptions,
  renderSlider,
  renderStepsIndicator,
  SLIDER_DEFAULT_MINIMUM_VALUE,
  SLIDER_DEFAULT_MAXIMUM_VALUE,
  SLIDER_DEFAULT_STEP,
  SLIDER_ON_CHANGE,
  SLIDER_ON_VALUE_CHANGE,
  SLIDER_ON_SLIDING_START,
  SLIDER_ON_SLIDING_COMPLETE,
  SLIDER_ON_ACCESSIBILITY_ACTION,
  type ISliderPlatform,
  type ISliderProps as ISliderBaseProps,
  type ISliderViewProps,
} from '../../core';

export type ISliderProps = Omit<
  ISliderBaseProps,
  | 'onValueChange'
  | 'onSlidingStart'
  | 'onSlidingComplete'
  | 'onAccessibilityAction'
>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

// Narrows anchorHostStyle's `unknown` (it reads an opaque engine prop bag) to the shape
// ISliderProps['style'] actually declares — the same runtime guard the Angular adapter's
// ActivityIndicator uses for the identical reason: a style value is structurally opaque at the
// type level, so this only rules out non-objects, never validates individual style keys.
function asStyle(value: unknown): ISliderProps['style'] {
  return typeof value === 'object' && value !== null ? value : undefined;
}

@Directive()
export abstract class SliderBase
  extends AccessibilityInputsBase
  implements ISliderProps, OnChanges, ControlValueAccessor
{
  @Input() value?: number;
  @Input() minimumValue?: number;
  @Input() maximumValue?: number;
  @Input() step?: number;
  @Input() lowerLimit?: number;
  @Input() upperLimit?: number;
  @Input() minimumTrackTintColor?: ISliderProps['minimumTrackTintColor'];
  @Input() maximumTrackTintColor?: ISliderProps['maximumTrackTintColor'];
  @Input() thumbTintColor?: ISliderProps['thumbTintColor'];
  @Input() disabled?: boolean;
  @Input() inverted?: boolean;
  @Input() tapToSeek?: boolean;
  @Input() vertical?: boolean;
  @Input() thumbImage?: ISliderProps['thumbImage'];
  @Input() minimumTrackImage?: ISliderProps['minimumTrackImage'];
  @Input() maximumTrackImage?: ISliderProps['maximumTrackImage'];
  @Input() trackImage?: ISliderProps['trackImage'];
  @Input() thumbSize?: number;
  @Input() accessibilityUnits?: string;
  @Input() accessibilityIncrements?: readonly string[];
  @Input() renderStepNumber?: boolean;
  @Input() testID?: string;
  @Input() style?: ISliderProps['style'];

  @Input() nativeID?: string;
  @Input() onAccessibilityTap?: (event: ISymbioteEvent) => void;
  @Input() onMagicTap?: (event: ISymbioteEvent) => void;
  @Input() onAccessibilityEscape?: (event: ISymbioteEvent) => void;

  // The four native callbacks, as real EventEmitters — no v-model-style two-way twin (that was
  // Vue-specific v-model sugar; Angular has no equivalent concept here).
  @Output() readonly valueChange = new EventEmitter<number>();
  @Output() readonly slidingStart = new EventEmitter<number>();
  @Output() readonly slidingComplete = new EventEmitter<number>();
  @Output() readonly accessibilityAction = new EventEmitter<ISymbioteEvent>();

  protected abstract readonly platform: ISliderPlatform;

  private readonly changeDetector = inject(ChangeDetectorRef);
  // This component's OWN host — the non-painting anchor `class="..."` at the use site resolves
  // onto (see anchorHostStyle's doc comment, @symbiote-native/angular) — NOT the descriptor-outlet-
  // rendered wrapper the `descriptor` getter below builds. Merged FIRST so an explicit `style`
  // @Input still wins (flattenStyle's later-wins collapse), mirroring every other composed
  // component's anchor merge.
  private readonly elementRef = inject(ElementRef);

  // The value native last reported, kept only to mark the active step in the indicator. Not the
  // controlled value — the slider is uncontrolled during a drag (no snap-back), mirroring the
  // Vue lifecycle's `reportedValue` ref.
  private reportedValue: number | undefined;
  // The measured wrapper width the step indicator lays out against; 0 until the first layout.
  private width = 0;

  ngOnChanges(): void {
    // No fold needed here: `descriptor` is a getter re-evaluated on every OnPush check the
    // template's `[node]="descriptor"` binding triggers, so an @Input change already recomputes
    // the render on its own. OnChanges exists so this class satisfies the same lifecycle contract
    // as the rest of the input-driven components in this adapter.
  }

  protected readonly handleValueChange = (event: ISymbioteEvent): void => {
    const value = valueFromSliderEvent(event);
    if (value === undefined) return;
    this.reportedValue = value;
    this.valueChange.emit(value);
  };

  protected readonly handleSlidingStart = (event: ISymbioteEvent): void => {
    const value = valueFromSliderEvent(event);
    if (value !== undefined) this.slidingStart.emit(value);
  };

  protected readonly handleSlidingComplete = (event: ISymbioteEvent): void => {
    const value = valueFromSliderEvent(event);
    if (value !== undefined) this.slidingComplete.emit(value);
  };

  protected readonly handleAccessibilityAction = (
    event: ISymbioteEvent,
  ): void => {
    this.accessibilityAction.emit(event);
  };

  // Native onLayout fires through the engine's event dispatch (Renderer2.listen), OUTSIDE
  // Angular's zoneless change-detection notification, so mutating `width` alone would never
  // repaint the step indicator — nothing would tell the OnPush view it is dirty. The explicit
  // `markForCheck()` below is what actually schedules the repaint.
  protected readonly handleLayout = (event: ISymbioteEvent): void => {
    const layout = event.nativeEvent.layout;
    if (isRecord(layout) && typeof layout.width === 'number') {
      this.width = layout.width;
      this.changeDetector.markForCheck();
    }
  };

  // ControlValueAccessor — `value`/`disabled` are plain @Input() fields feeding the `descriptor`
  // getter (re-evaluated on every OnPush check, no fold/commit dance), so writeValue()/
  // setDisabledState() can set them straight, no TextInput-style stale-safe seam needed.
  writeValue(value: number | null): void {
    this.value = value ?? undefined;
    this.changeDetector.markForCheck();
  }

  registerOnChange(fn: (value: number) => void): void {
    this.valueChange.subscribe(fn);
  }

  registerOnTouched(fn: () => void): void {
    // Slider has no blur concept (it's a drag control, not a text field) — the thumb release is
    // the closest "the user is done interacting" signal.
    this.slidingComplete.subscribe(() => fn());
  }

  setDisabledState(isDisabled: boolean): void {
    this.disabled = isDisabled;
    this.changeDetector.markForCheck();
  }

  private inputProps(): ISliderProps {
    return {
      value: this.value,
      minimumValue: this.minimumValue,
      maximumValue: this.maximumValue,
      step: this.step,
      lowerLimit: this.lowerLimit,
      upperLimit: this.upperLimit,
      minimumTrackTintColor: this.minimumTrackTintColor,
      maximumTrackTintColor: this.maximumTrackTintColor,
      thumbTintColor: this.thumbTintColor,
      disabled: this.disabled,
      inverted: this.inverted,
      tapToSeek: this.tapToSeek,
      vertical: this.vertical,
      thumbImage: this.thumbImage,
      minimumTrackImage: this.minimumTrackImage,
      maximumTrackImage: this.maximumTrackImage,
      trackImage: this.trackImage,
      thumbSize: this.thumbSize,
      accessibilityUnits: this.accessibilityUnits,
      accessibilityIncrements: this.accessibilityIncrements,
      renderStepNumber: this.renderStepNumber,
      testID: this.testID,
      style: [asStyle(anchorHostStyle(this.elementRef)), this.style],
      nativeID: this.nativeID,
      ...this.accessibilityInputProps(),
      onAccessibilityTap: this.onAccessibilityTap,
      onMagicTap: this.onMagicTap,
      onAccessibilityEscape: this.onAccessibilityEscape,
    };
  }

  get descriptor(): IDescriptor {
    const props = resolveAccessibilityProps<ISliderProps>(this.inputProps());
    const view = this.viewFor(props);
    // No custom marker slot on Angular yet, so the overlay depends only on `renderStepNumber`
    if (!shouldRenderStepsIndicator(false, props.renderStepNumber)) {
      return renderSlider(view, this.platform, { onLayout: this.handleLayout });
    }
    return renderSlider(view, this.platform, {
      steps: this.stepsFor(view, props),
      onLayout: this.handleLayout,
    });
  }

  // Kept apart from `descriptor` so the value, limit and disabled folds read as one step and the
  // step-overlay decision as another
  private viewFor(props: ISliderProps): ISliderViewProps {
    const {
      value,
      minimumValue: minimumValueInput,
      maximumValue: maximumValueInput,
      step: stepInput,
      lowerLimit: lowerLimitInput,
      upperLimit: upperLimitInput,
      disabled,
      inverted: invertedInput,
      thumbTintColor,
      thumbImage,
      accessibilityState,
      renderStepNumber: _renderStepNumber,
      style,
      ...passthrough
    } = props;

    const lowerLimit = resolveSliderLowerLimit(lowerLimitInput);
    const upperLimit = resolveSliderUpperLimit(upperLimitInput);
    if (isInvalidLimitConfig(lowerLimit, upperLimit)) {
      dlog('Slider: lowerLimit must be smaller than upperLimit');
    }
    const hasThumbImage = thumbImage !== undefined;
    const nativeThumbImage = shouldPassNativeThumbImage(false, hasThumbImage)
      ? thumbImage
      : undefined;

    return {
      value: sanitizeSliderValue(value),
      minimumValue: minimumValueInput ?? SLIDER_DEFAULT_MINIMUM_VALUE,
      maximumValue: maximumValueInput ?? SLIDER_DEFAULT_MAXIMUM_VALUE,
      step: stepInput ?? SLIDER_DEFAULT_STEP,
      lowerLimit,
      upperLimit,
      disabled: resolveSliderDisabled(disabled, accessibilityState),
      inverted: invertedInput ?? false,
      thumbTintColor: resolveThumbTintColor(
        thumbTintColor,
        false,
        hasThumbImage,
      ),
      thumbImage: nativeThumbImage,
      accessibilityState: resolveSliderAccessibilityState(
        disabled,
        accessibilityState,
      ),
      width: this.width,
      style,
      passthrough: { ...passthrough, ...this.nativeEventHandlers() },
    };
  }

  private nativeEventHandlers(): Record<
    string,
    (event: ISymbioteEvent) => void
  > {
    return {
      [SLIDER_ON_CHANGE]: this.handleValueChange,
      [SLIDER_ON_VALUE_CHANGE]: this.handleValueChange,
      [SLIDER_ON_SLIDING_START]: this.handleSlidingStart,
      [SLIDER_ON_SLIDING_COMPLETE]: this.handleSlidingComplete,
      [SLIDER_ON_ACCESSIBILITY_ACTION]: this.handleAccessibilityAction,
    };
  }

  private stepsFor(view: ISliderViewProps, props: ISliderProps): IDescriptor {
    const options = computeStepOptions(
      view.minimumValue,
      view.maximumValue,
      view.step,
      this.platform.stepResolution,
    );
    return renderStepsIndicator({
      options,
      currentValue: this.reportedValue ?? view.value ?? view.minimumValue,
      width: this.width,
      renderStepNumber: props.renderStepNumber === true,
      thumbImage: props.thumbImage,
      inverted: view.inverted,
      platform: this.platform,
    });
  }
}
