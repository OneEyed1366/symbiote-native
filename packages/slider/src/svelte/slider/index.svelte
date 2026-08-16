<script lang="ts" module>
  // Slider, the Svelte lifecycle half. Logic (value/limit/disabled folds, step-option layout) and
  // the native render live in @symbiote-native/slider core, shared with every adapter; Svelte
  // supplies reactivity (`$state`/`$derived`) and the descriptor bridge for the native
  // `RNCSlider` leaf. The native view carries no symbiote metadata - the engine derives its
  // events/color/image processors from the library's ViewConfig at runtime, registered by the
  // side-effect import in ../index (not here, so this module and its tests stay free of the
  // third-party spec).
  //
  // WHY THE LEAF IS BRIDGED, NOT WRITTEN AS A LITERAL TAG: 'RNCSlider' is neither hyphenated nor
  // lowercase-leading, so a literal `<RNCSlider>` in a Svelte template would parse as a COMPONENT
  // reference (Svelte's own tag-vs-component heuristic), not an element — confirmed against the
  // real compiler (`RNCSlider($$anchor, {...})` in the compiled output, not
  // `createElementNode('RNCSlider')`). `descriptorFor('RNCSlider')` (core/components/src/
  // component-names/shared.ts) already resolves correctly at the ENGINE level for any non-
  // `symbiote-`-prefixed name (falls through to `{component: type, isText: false}`) — the only
  // obstacle is the Svelte COMPILER's template syntax, not engine node resolution. The generic
  // descriptor bridge (`@symbiote-native/svelte/native-view-bridge`'s `mountDescriptorChildren`,
  // svelte-adapter-custom-renderer skill §5) sidesteps this entirely: it calls
  // `createElementNode(child.type)` PROGRAMMATICALLY (renderer.ts's own engine-backed factory,
  // no DOM involved), which the compiler never inspects, so the hyphen/capitalization rule never
  // applies. Every other adapter
  // passes 'RNCSlider' straight into `h()`/`createElement()` — a runtime call, same free pass;
  // Svelte alone routes through a compiled template, hence the bridge. Imported from
  // `native-view-bridge`, NOT the package's main barrel: the main barrel re-exports View/Text/…,
  // real `.svelte` sources, and loading it forces the whole `.svelte` module graph through
  // whatever bundles this file — safe under Metro (production), fatal under vitest's plain,
  // svelte-plugin-free transform (this component's own smoke test).
  //
  // The custom-marker overlay's thumb-image cell uses the raw `symbiote-image` host tag rather
  // than the framework's `Image` component: core's `render-steps-indicator.ts` paints the same
  // default-overlay thumb with a bare `el('symbiote-image', {source, style})` Descriptor, and
  // importing another `.svelte` component here would reintroduce the same main-barrel problem
  // one level down.
  import type { ISliderProps } from './slider-props';

  export type { ISliderProps };
</script>

<script lang="ts">
  import {
    dlog,
    removeChild,
    type ISymbioteEvent,
    type IHostInstance,
  } from '@symbiote-native/engine';
  import {
    mountDescriptorChildren,
    createDescriptorChildrenSync,
    type IDescriptorChildrenMount,
  } from '@symbiote-native/svelte/native-view-bridge';
  import { toTemplateSafeProps } from '@symbiote-native/svelte/renderer';
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

  // Last value native reported, kept only to mark the active step - not the controlled value (the
  // slider is uncontrolled during a drag, unlike Switch: native owns the thumb position). A plain
  // number, not an engine-node reference, so `$state` (not `.raw`) is fine here; only `hostShim*`
  // below needs `.raw`'s no-deep-proxy guarantee for the engine's WeakMap-keyed identity lookups.
  let reportedValue = $state<number | undefined>(undefined);
  // The measured wrapper width the step indicator lays out against; 0 until the first layout.
  let width = $state(0);

  function handleValueChange(event: ISymbioteEvent): void {
    const next = valueFromSliderEvent(event);
    if (next === undefined) return;
    reportedValue = next;
    // Additive `bind:value` sugar: reassigning a `$bindable()` prop pushes it to the caller's
    // bound variable, on the same report path as `onValueChange` below (matches the Vue
    // adapter's `emitModelUpdate` timing) - never replacing the `value`/`onValueChange` contract.
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
    if (isRecord(layout) && typeof layout.width === 'number') width = layout.width;
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
  const showSteps = $derived(shouldRenderStepsIndicator(hasStepMarker, renderStepNumber));

  // The native view gets a thumbImage only when there is one AND no custom marker (which draws
  // its own thumb), matching the library. Passed raw — the engine runs the image processor
  // derived from RNCSlider's ViewConfig (same path as the color tints).
  const nativeThumbImage = $derived(
    shouldPassNativeThumbImage(hasStepMarker, hasThumbImage) ? thumbImage : undefined,
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
    thumbTintColor: resolveThumbTintColor(thumbTintColor, hasStepMarker, hasThumbImage),
    thumbImage: nativeThumbImage,
    accessibilityState: resolveSliderAccessibilityState(disabled, accessibilityState),
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

  const options = $derived(computeStepOptions(minimum, maximum, resolvedStep, PLATFORM.stepResolution));
  const currentValue = $derived(reportedValue ?? view.value ?? minimum);

  // --- No custom marker: renderSlider() is the single source of truth (wrapper + optional
  // default steps overlay + the native leaf), ALL pure Descriptor — mounted via the bridge.
  // Unlike every fixed-shape component elsewhere in this adapter, this Descriptor's own shape
  // genuinely varies with `renderStepNumber` (1 child with no overlay, 2 with one), so the sync
  // below tolerates a child-count change with a clean rebuild instead of assuming constant shape.
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

  // `style` collides with Svelte's own special-cased attribute name (svelte-adapter-custom-
  // renderer skill §6 / renderer.ts's TEMPLATE_KEY_UNMANGLE) — this wrapper's own props ride a
  // literal template spread below (the mounted CHILDREN go through the JS-only descriptor bridge
  // above, unaffected), so `style` is renamed before the spread; `setAttributeOp`'s
  // `realPropName()` reverses it right before `routeProp`.
  const defaultTemplateProps = $derived.by(() =>
    defaultDescriptor === undefined ? undefined : toTemplateSafeProps(defaultDescriptor.props),
  );

  let hostShimDefault = $state.raw<IHostInstance | null>(null);
  let mountedDefault: IDescriptorChildrenMount | undefined;
  let mountedDefaultCount = -1;

  function syncDefaultChildren(children: IDescriptorChild[]): void {
    if (hostShimDefault === null) return;
    if (mountedDefault === undefined || mountedDefaultCount !== children.length) {
      for (const child of hostShimDefault.children.slice()) removeChild(hostShimDefault, child);
      mountedDefault = mountDescriptorChildren(hostShimDefault, children);
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

  // --- Custom marker: the overlay is hand-authored live template content below (it hosts the
  // caller's `stepMarker` Snippet, a live child no Descriptor can carry — component-render-fn-
  // boundary rule). Only the native leaf (always exactly one, constant shape) is bridged.
  const fontSize = $derived(stepNumberFontSize(options.length));
  const orderedOptions = $derived(orderStepOptions(options, inverted));
  const minOption = $derived(options[0]);
  const maxOption = $derived(options[options.length - 1]);
  const nativeLeafDescriptor = $derived(renderSliderNative(view, PLATFORM));
  // See `defaultTemplateProps`'s note above — same rename, this wrapper's props also ride a
  // literal template spread.
  const markerWrapperBag = $derived(
    toTemplateSafeProps({
      style: resolveSliderWrapperStyle(style, PLATFORM),
      class: className,
      onLayout: handleLayout,
    }),
  );

  let hostShimMarker = $state.raw<IHostInstance | null>(null);
  const syncMarkerLeaf = createDescriptorChildrenSync();

  $effect(() => {
    if (!hasStepMarker) return;
    syncMarkerLeaf(hostShimMarker, [nativeLeafDescriptor]);
  });
</script>

{#if hasStepMarker}
  <symbiote-view {...markerWrapperBag} {@attach (node) => (hostShimMarker = node)}>
    <symbiote-view
      pointerEvents="none"
      testID="StepsIndicator-Container"
      {...toTemplateSafeProps({ style: resolveStepsContainerStyle(width, PLATFORM) })}
    >
      {#each orderedOptions as optionValue, index (optionValue)}
        <symbiote-view {...toTemplateSafeProps({ style: STEP_INDICATOR_ELEMENT_STYLE })}><symbiote-view {...toTemplateSafeProps({ style: TRACK_MARK_CONTAINER_STYLE })}>{@render stepMarker?.({ stepMarked: optionValue === currentValue, currentValue, index, min: minOption, max: maxOption })}{#if thumbImage !== undefined && optionValue === currentValue}<symbiote-view {...toTemplateSafeProps({ style: THUMB_IMAGE_CONTAINER_STYLE })} testID="sliderTrackMark-thumbImage"><symbiote-image source={thumbImage} {...toTemplateSafeProps({ style: THUMB_IMAGE_STYLE })} /></symbiote-view>{/if}</symbiote-view>{#if renderStepNumber}<symbiote-view {...toTemplateSafeProps({ style: STEP_NUMBER_CONTAINER_STYLE })}><symbiote-text testID={`${index}th-step`} {...toTemplateSafeProps({ style: { fontSize } })}>{String(optionValue)}</symbiote-text></symbiote-view>{/if}</symbiote-view>
      {/each}
    </symbiote-view>
  </symbiote-view>
{:else}
  <symbiote-view {...defaultTemplateProps} class={className} {@attach (node) => (hostShimDefault = node)} />
{/if}
