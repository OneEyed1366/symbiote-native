<script lang="ts" module>
  // Switch: the first STATE-machine component in the Svelte adapter (View/Text are
  // render-only). Reuses the shared logic verbatim (switchReducer / valueFromChange /
  // shouldSnapBack, exactly like React's useReducer + Vue's ref-based reducer wiring) and
  // calls renderSwitch() itself for the prop assembly — its Descriptor is always exactly one
  // `symbiote-switch` node with zero children (core/components/src/view/render-switch.ts). Root
  // stays a literal tag (the host ref needs a known tag); `createDescriptorChildrenSync` is
  // still wired for its (always-empty) children, matching every other category-1 component
  // uniformly — the same reason React still routes a childless Switch through descriptorToReact
  // rather than special-casing it.
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
  import { dispatchViewCommand, dlog, type ISymbioteEvent, type IHostInstance } from '@symbiote-native/engine';
  import { PLATFORM } from './switch-platform';
  import { createDescriptorChildrenSync } from '../../descriptor-to-svelte';
  import { remapOnPrefixedValueProps } from '../../renderer';

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

  // $state.raw, NOT $state: this holds the host node by IDENTITY (the same
  // shallowRef-not-ref concern Vue's switch/shared.ts documents). $state() would deep-proxy
  // the object, and every imperative command (dispatchViewCommand) reads it directly — a Proxy
  // wrapper would miss the engine's WeakMap-keyed mirror lookup and silently no-op.
  let hostRef = $state.raw<IHostInstance | null>(null);
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
  // same trigger set. Nodes are eagerly bound under the custom-renderer API (unlike the retired
  // shim's lazy-until-committed ShimElement), so `hostRef` is already the real, dispatchable
  // engine node the moment the `{@attach}` below runs.
  $effect(() => {
    if (hostRef === null) return;
    if (!shouldSnapBack(switchState, fabricValue)) {
      dlog(
        `Switch snap-back no-op reported=${String(switchState.lastNativeReport)} value=${fabricValue}`,
      );
      return;
    }
    dlog(
      `Switch ${PLATFORM.snapBackCommand} snap-back reported=${String(switchState.lastNativeReport)} value=${fabricValue}`,
    );
    dispatchViewCommand(hostRef, PLATFORM.snapBackCommand, [fabricValue]);
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

  // iOS's `onTintColor` (renderSwitch's own output, see switch-platform.ios.ts) collides with
  // Svelte's on-prefix-is-always-an-event rule — renderer.ts's `remapOnPrefixedValueProps`
  // renames it before it reaches the template spread; `setAttributeOp` reverses the rename.
  const props = $derived(remapOnPrefixedValueProps(descriptor.props));

  const syncChildren = createDescriptorChildrenSync();
  $effect(() => {
    syncChildren(hostRef, descriptor.children);
  });
</script>

<symbiote-switch {...props} {@attach (node) => (hostRef = node)} />
