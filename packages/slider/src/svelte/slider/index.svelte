<script lang="ts" module>
  // Svelte lifecycle half of Slider, logic and the native render live in the slider core
  // The engine derives `RNCSlider` events and processors from its ViewConfig set up in ../index

  // The leaf is bridged, since a literal `<RNCSlider>` parses as a component and not an element
  // `mountDescriptorChildren` builds the host node programmatically, which the compiler never sees
  // It comes from `native-view-bridge`, as the main barrel has `.svelte` files vitest cannot parse

  // The thumb-image cell uses the raw `image` tag for the same reason, not the `Image` component
  import type { ISliderProps } from './slider-props';

  export type { ISliderProps };
</script>

<script lang="ts">
  import {
    childrenOf,
    dlog,
    removeChild,
    type ISymbioteEvent,
    type ISymbioteNode,
  } from '@symbiote-native/engine';
  import {
    captureHost,
    mountDescriptorChildren,
    createDescriptorChildrenSync,
    type IDescriptorChildrenMount,
  } from '@symbiote-native/svelte/native-view-bridge';
  import type { IDescriptorChild } from '@symbiote-native/components';
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
    orderStepOptions,
    stepNumberFontSize,
    renderSlider,
    renderSliderNative,
    resolveSliderWrapperStyle,
    resolveStepsContainerStyle,
    renderStepsIndicator,
    STEP_INDICATOR_ELEMENT_STYLE,
    TRACK_MARK_CONTAINER_STYLE,
    THUMB_IMAGE_CONTAINER_STYLE,
    THUMB_IMAGE_STYLE,
    STEP_NUMBER_CONTAINER_STYLE,
    SLIDER_DEFAULT_MINIMUM_VALUE,
    SLIDER_DEFAULT_MAXIMUM_VALUE,
    SLIDER_DEFAULT_STEP,
    SLIDER_ON_CHANGE,
    SLIDER_ON_VALUE_CHANGE,
    SLIDER_ON_SLIDING_START,
    SLIDER_ON_SLIDING_COMPLETE,
    SLIDER_ON_ACCESSIBILITY_ACTION,
    type ISliderViewProps,
  } from '../../core';
  import { PLATFORM } from './slider-platform';

  function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
  }

  let {
    value = $bindable(),
    minimumValue,
    maximumValue,
    step,
    lowerLimit,
    upperLimit,
    disabled,
    inverted = false,
    thumbTintColor,
    thumbImage,
    accessibilityState,
    renderStepNumber,
    style,
    class: className,
    stepMarker,
    onValueChange,
    onSlidingStart,
    onSlidingComplete,
    onAccessibilityAction,
    ...passthrough
  }: ISliderProps = $props();

  // Last value native reported, kept only to mark the active step, as native owns the thumb
  // It is a plain number, so `$state` fits, while the host refs below need `.raw` to skip proxies
  let reportedValue = $state<number | undefined>(undefined);
  // The wrapper width the step indicator lays out against, 0 until the first layout
  let width = $state(0);

  function handleValueChange(event: ISymbioteEvent): void {
    const next = valueFromSliderEvent(event);
    if (next === undefined) return;
    reportedValue = next;
    // Additive `bind:value` sugar: reassigning a `$bindable()` prop pushes it to the caller's
    // bound variable on the same report path as `onValueChange`, as Vue's `emitModelUpdate` does
    // The `value`/`onValueChange` contract stays unchanged
    value = next;
    onValueChange?.(next);
  }
  function handleSlidingStart(event: ISymbioteEvent): void {
    const next = valueFromSliderEvent(event);
    if (next !== undefined) onSlidingStart?.(next);
  }
  function handleSlidingComplete(event: ISymbioteEvent): void {
    const next = valueFromSliderEvent(event);
    if (next !== undefined) onSlidingComplete?.(next);
  }
  function handleAccessibilityAction(event: ISymbioteEvent): void {
    onAccessibilityAction?.(event);
  }
  function handleLayout(event: ISymbioteEvent): void {
    const layout = event.nativeEvent.layout;
    if (isRecord(layout) && typeof layout.width === 'number')
      width = layout.width;
  }

  const minimum = $derived(minimumValue ?? SLIDER_DEFAULT_MINIMUM_VALUE);
  const maximum = $derived(maximumValue ?? SLIDER_DEFAULT_MAXIMUM_VALUE);
  const resolvedStep = $derived(step ?? SLIDER_DEFAULT_STEP);
  const lower = $derived(resolveSliderLowerLimit(lowerLimit));
  const upper = $derived(resolveSliderUpperLimit(upperLimit));

  $effect(() => {
    if (isInvalidLimitConfig(lower, upper)) {
      dlog('Slider: lowerLimit must be smaller than upperLimit');
    }
  });

  const hasStepMarker = $derived(stepMarker !== undefined);
  const hasThumbImage = $derived(thumbImage !== undefined);
  const showSteps = $derived(
    shouldRenderStepsIndicator(hasStepMarker, renderStepNumber),
  );

  // The native view gets a `thumbImage` only with no custom marker, which draws its own thumb
  // It is passed raw, as the engine runs the image processor from the ViewConfig
  const nativeThumbImage = $derived(
    shouldPassNativeThumbImage(hasStepMarker, hasThumbImage)
      ? thumbImage
      : undefined,
  );

  const view = $derived<ISliderViewProps>({
    value: sanitizeSliderValue(value),
    minimumValue: minimum,
    maximumValue: maximum,
    step: resolvedStep,
    lowerLimit: lower,
    upperLimit: upper,
    disabled: resolveSliderDisabled(disabled, accessibilityState),
    inverted,
    thumbTintColor: resolveThumbTintColor(
      thumbTintColor,
      hasStepMarker,
      hasThumbImage,
    ),
    thumbImage: nativeThumbImage,
    accessibilityState: resolveSliderAccessibilityState(
      disabled,
      accessibilityState,
    ),
    width,
    style,
    passthrough: {
      ...passthrough,
      [SLIDER_ON_CHANGE]: handleValueChange,
      [SLIDER_ON_VALUE_CHANGE]: handleValueChange,
      [SLIDER_ON_SLIDING_START]: handleSlidingStart,
      [SLIDER_ON_SLIDING_COMPLETE]: handleSlidingComplete,
      [SLIDER_ON_ACCESSIBILITY_ACTION]: handleAccessibilityAction,
    },
  });

  const options = $derived(
    computeStepOptions(minimum, maximum, resolvedStep, PLATFORM.stepResolution),
  );
  const currentValue = $derived(reportedValue ?? view.value ?? minimum);

  // No custom marker: `renderSlider()` builds the wrapper, the steps overlay and the native leaf
  // The child count varies with `renderStepNumber` (1 or 2), so the sync rebuilds on a change
  const defaultDescriptor = $derived(
    hasStepMarker
      ? undefined
      : renderSlider(
          view,
          PLATFORM,
          showSteps
            ? {
                steps: renderStepsIndicator({
                  options,
                  currentValue,
                  width,
                  renderStepNumber: renderStepNumber === true,
                  thumbImage,
                  inverted,
                  platform: PLATFORM,
                }),
                onLayout: handleLayout,
              }
            : { onLayout: handleLayout },
        ),
  );

  let defaultHost = $state.raw<ISymbioteNode | null>(null);
  const captureDefaultHost = captureHost(host => {
    defaultHost = host;
  });
  let mountedDefault: IDescriptorChildrenMount | undefined;
  let mountedDefaultCount = -1;

  function syncDefaultChildren(children: IDescriptorChild[]): void {
    if (defaultHost === null) return;
    if (
      mountedDefault === undefined ||
      mountedDefaultCount !== children.length
    ) {
      // The host is a `view` captured by `{@attach}`, so Svelte tracks none of its children
      for (const child of childrenOf(defaultHost).slice())
        removeChild(defaultHost, child);
      mountedDefault = mountDescriptorChildren(defaultHost, children);
      mountedDefaultCount = children.length;
    } else {
      mountedDefault.update(children);
    }
  }

  $effect(() => {
    const descriptor = defaultDescriptor;
    if (descriptor === undefined) return;
    syncDefaultChildren(descriptor.children);
  });

  // Custom marker: the overlay below is live template content, as it hosts the `stepMarker` Snippet
  // A Descriptor cannot carry that, so only the native leaf, always one, is bridged
  const fontSize = $derived(stepNumberFontSize(options.length));
  const orderedOptions = $derived(orderStepOptions(options, inverted));
  const minOption = $derived(options[0]);
  const maxOption = $derived(options[options.length - 1]);
  const nativeLeafDescriptor = $derived(renderSliderNative(view, PLATFORM));
  const markerWrapperBag = $derived({
    style: resolveSliderWrapperStyle(style, PLATFORM),
    class: className,
    onLayout: handleLayout,
  });

  let markerHost = $state.raw<ISymbioteNode | null>(null);
  const captureMarkerHost = captureHost(host => {
    markerHost = host;
  });
  const syncMarkerLeaf = createDescriptorChildrenSync();

  $effect(() => {
    if (!hasStepMarker) return;
    syncMarkerLeaf(markerHost, [nativeLeafDescriptor]);
  });
</script>

{#if hasStepMarker}
  <view p={markerWrapperBag} {@attach captureMarkerHost}>
    <view
      p={{
        pointerEvents: 'none',
        testID: 'StepsIndicator-Container',
        style: resolveStepsContainerStyle(width, PLATFORM),
      }}
    >
      {#each orderedOptions as optionValue, index (optionValue)}
        <view p={{ style: STEP_INDICATOR_ELEMENT_STYLE }}>
          <view p={{ style: TRACK_MARK_CONTAINER_STYLE }}>
            {@render stepMarker?.({
              stepMarked: optionValue === currentValue,
              currentValue,
              index,
              min: minOption,
              max: maxOption,
            })}
            {#if thumbImage !== undefined && optionValue === currentValue}
              <view
                p={{
                  style: THUMB_IMAGE_CONTAINER_STYLE,
                  testID: 'sliderTrackMark-thumbImage',
                }}
              >
                <image p={{ source: thumbImage, style: THUMB_IMAGE_STYLE }} />
              </view>
            {/if}
          </view>
          {#if renderStepNumber}
            <view p={{ style: STEP_NUMBER_CONTAINER_STYLE }}>
              <text p={{ testID: `${index}th-step`, style: { fontSize } }}>
                {String(optionValue)}
              </text>
            </view>
          {/if}
        </view>
      {/each}
    </view>
  </view>
{:else}
  <view
    p={{ ...defaultDescriptor?.props, class: className }}
    {@attach captureDefaultHost}
  />
{/if}
