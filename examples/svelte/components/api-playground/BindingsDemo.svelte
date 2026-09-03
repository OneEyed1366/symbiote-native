<script lang="ts">
  // Bindings section. `bind:value`/`bind:checked`/`bind:group`/every media & dimension binding
  // are No — dead, there is no real `<input>`/`<select>`/`<audio>`/ResizeObserver in this
  // project (svelte-adapter-dom-shim skill §4). What remains: bind:this on an element (Partial —
  // it binds to our own ShimElement, not a real HTMLElement) and the two component-binding rows,
  // both proven by NumberStepper's own $bindable() value.
  import { Text, View } from '@symbiote-native/svelte';
  import { hostInstance } from '@symbiote-native/svelte';
  import type { ShimElement } from '@symbiote-native/svelte';
  import ActionButton from '../ActionButton.svelte';
  import NumberStepper from './NumberStepper.svelte';
  import { hostProps } from './shim-node-guard';

  const ACCENT = '#5ec8f2';

  // bind:this (element) — Partial. `<View>` is one of THIS adapter's own COMPONENTS, so binding
  // to it hands back a component instance with no exported members, not the raw host node —
  // exactly what "bind:this (element)" means only applies to a genuine ELEMENT, which app code
  // never authors directly (svelte-adapter-dom-shim skill §7's table). Reusing the same
  // <svelte:element> mechanism SpecialElementsDemo.svelte already demos, for illustration only,
  // is the one honest way to show this row live from app code.
  const ELEMENT_BAG = {
    testID: 'bindings-element-target',
    class: 'box-list160',
  };
  let measureTarget = $state.raw<ShimElement | null>(null);
  let measuredSize = $state<string | undefined>(undefined);
  function measureNow(): void {
    hostInstance(measureTarget)?.measure((_x, _y, width, height) => {
      measuredSize = `${Math.round(width)}×${Math.round(height)}`;
    });
  }

  // bind:this (component) + bind:propName (component) — both via NumberStepper. Unlike a
  // component imported through node_modules (svelte-adapter-dom-shim skill §24c's ambient-
  // fallback trap), NumberStepper.svelte is local source in this same app, so svelte-check
  // resolves its real exported `reset` — no `unknown` + runtime-guard workaround needed here.
  let stepperHandle = $state.raw<NumberStepper | null>(null);
  let boundValue = $state(4);
</script>

<View class="section-nested">
  <Text class="section-label">Bindings · bind:this, component $bindable</Text>
  <svelte:element
    this={"symbiote-view"}
    bind:this={measureTarget}
    {@attach hostProps(ELEMENT_BAG)}
  >
    <Text class="tiny-center">
      bound via bind:this on a raw element (illustration only, same caveat as
      SpecialElementsDemo's dynamic tag)
    </Text>
  </svelte:element>
  <ActionButton
    testID="bindings-measure-now"
    title="hostInstance(el).measure()"
    color={ACCENT}
    onPress={measureNow}
  />
  <Text class="info-text" testID="bindings-measure-readout">
    {measuredSize === undefined ? 'not measured yet' : `size: ${measuredSize}`}
  </Text>
  <Text class="note-text">
    Partial — bind:this on a Symbiote element hands back this adapter's own
    ShimElement (measure / measureInWindow / setNativeProps / focus / blur via
    hostInstance), never a DOM HTMLElement.
  </Text>
  <Text class="section-label">
    bind:this (component) + bind:propName (component)
  </Text>
  <NumberStepper
    bind:this={stepperHandle}
    bind:value={boundValue}
    label="bind:value round-trips both ways"
    testID="bindings-stepper"
  />
  <ActionButton
    testID="bindings-reset-via-ref"
    title="stepperHandle.reset() via bind:this"
    color={ACCENT}
    onPress={() => stepperHandle?.reset()}
  />
</View>
