<script lang="ts" module>
  // Switch: the first STATE-machine component in the Svelte adapter (View/Text are
  // render-only). Reuses the shared logic verbatim (switchReducer / valueFromChange /
  // shouldSnapBack, exactly like React's useReducer + Vue's ref-based reducer wiring) and
  // calls renderSwitch() itself for the prop assembly — its Descriptor is always exactly one
  // `symbiote-switch` node with zero children (core/components/src/view/render-switch.ts). Root
  // stays a literal tag (bind:this needs a known tag); `createDescriptorChildrenSync` is still
  // wired for its (always-empty) children, matching every other category-1 component uniformly
  // — the same reason React still routes a childless Switch through descriptorToReact rather
  // than special-casing it. See svelte-adapter-dom-shim skill §19.
  import type { ISwitchProps } from './switch-props';

  export type { ISwitchProps };
</script>

<script lang="ts">
  import {
    switchReducer,
    createInitialSwitchState,
    shouldSnapBack,
    valueFromChange,
    renderSwitch,
  } from '@symbiote-native/components';
  import { dispatchViewCommand, dlog, type ISymbioteEvent } from '@symbiote-native/engine';
  import { PLATFORM } from './switch-platform';
  import { createDescriptorChildrenSync } from '../../descriptor-to-svelte';
  import { createAttachmentsSync } from '../../runes/attachments';
  import type { ShimElement } from '../../dom-shim';

  let {
    value,
    onValueChange,
    disabled,
    trackColor,
    thumbColor,
    ios_backgroundColor,
    style,
    class: className,
    ...passthrough
  }: ISwitchProps = $props();

  // $state.raw, NOT $state: this holds the shim element by IDENTITY (the same
  // shallowRef-not-ref concern Vue's switch/shared.ts documents). $state() would deep-proxy
  // the object, and every imperative command (dispatchViewCommand) reads `.engineNode` off
  // the RAW ShimElement the engine's WeakMap-keyed mirror actually knows about — a Proxy
  // wrapper would miss on every lookup and silently no-op.
  let hostShim = $state.raw<ShimElement | null>(null);
  let switchState = $state(createInitialSwitchState());

  const fabricValue = $derived(value === true);

  function handleChange(event: ISymbioteEvent): void {
    const next = valueFromChange(event);
    dlog(
      `Switch onChange value=${String(next)} eventCount=${String(event.nativeEvent.eventCount)}`,
    );
    if (next === undefined) return;
    onValueChange?.(next, event);
    switchState = switchReducer(switchState, { type: 'native-reported', value: next });
  }

  // Snap-back: when native reported a value the parent rejected (the value prop did not
  // change), command the JS value back down — the controlled-Switch correction RN does via
  // SwitchCommands.setValue/setNativeValue. Mirrors React's useLayoutEffect / Vue's post-flush
  // watch; Svelte's $effect reruns whenever switchState or fabricValue changes, which is the
  // same trigger set. Verified against a real compiled mount
  // (mount-pipeline.smoke.test.ts + switch.smoke.test.ts): the shim's insertOne() calls
  // makeLive() synchronously as part of the SAME appendChild the compiler emits before
  // bind:this fires, so hostShim.engineNode is always populated by the time this first runs.
  $effect(() => {
    const engineNode = hostShim?.engineNode;
    if (engineNode === undefined) return;
    if (!shouldSnapBack(switchState, fabricValue)) {
      dlog(
        `Switch snap-back no-op reported=${String(switchState.lastNativeReport)} value=${fabricValue}`,
      );
      return;
    }
    dlog(
      `Switch ${PLATFORM.snapBackCommand} snap-back reported=${String(switchState.lastNativeReport)} value=${fabricValue}`,
    );
    dispatchViewCommand(engineNode, PLATFORM.snapBackCommand, [fabricValue]);
  });

  const descriptor = $derived(
    renderSwitch(
      {
        value: fabricValue,
        disabled,
        trackColor,
        thumbColor,
        ios_backgroundColor,
        style,
        passthrough: { ...passthrough, class: className, onChange: handleChange },
      },
      PLATFORM,
    ),
  );

  const syncChildren = createDescriptorChildrenSync();
  $effect(() => {
    syncChildren(hostShim, descriptor.children);
  });

  // See View.svelte's note on `{@attach}`.
  const syncAttachments = createAttachmentsSync();
  $effect(() => {
    syncAttachments(hostShim, passthrough);
  });
</script>

<symbiote-switch p={descriptor.props} bind:this={hostShim} />
