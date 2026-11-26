<script lang="ts">
  // Bindings section, where `bind:` on an element is refused and an `{@attach}` replaces it
  // The two component-binding rows stay, both proven by `$bindable()` in `NumberStepper`
  import { hostInstance } from '@symbiote-native/svelte';
  import { hostProps } from '@symbiote-native/svelte/native-view-bridge';
  import ActionButton from '../ActionButton.svelte';
  import NumberStepper from './NumberStepper.svelte';

  const ACCENT = '#5ec8f2';

  // The attachment hands back the element itself, `hostInstance()` unwraps its engine node
  const ELEMENT_BAG = {
    testID: 'bindings-element-target',
    class: 'box-list160',
  };
  let measureTarget = $state.raw<unknown>(null);
  let measuredSize = $state<string | undefined>(undefined);
  function measureNow(): void {
    hostInstance(measureTarget)?.measure((_x, _y, width, height) => {
      measuredSize = `${Math.round(width)}×${Math.round(height)}`;
    });
  }

  // `NumberStepper` is local source, so svelte-check resolves its real exported `reset`
  let stepperHandle = $state.raw<NumberStepper | null>(null);
  let boundValue = $state(4);
</script>

<view class="section-nested">
  <text class="section-label">Bindings · element attach, component $bindable</text>
  <svelte:element
    this={"view"}
    {@attach (node: unknown) => {
      measureTarget = node;
    }}
    {@attach hostProps(ELEMENT_BAG)}
  >
    <text class="tiny-center">
      captured by an attachment on a raw element (illustration only, same
      caveat as SpecialElementsDemo's dynamic tag)
    </text>
  </svelte:element>
  <ActionButton
    testID="bindings-measure-now"
    title="hostInstance(el).measure()"
    color={ACCENT}
    onPress={measureNow}
  />
  <text class="info-text" testID="bindings-measure-readout">
    {measuredSize === undefined ? 'not measured yet' : `size: ${measuredSize}`}
  </text>
  <text class="note-text">
    Partial — an attachment on a Symbiote element receives this adapter's own
    node (measure / measureInWindow / setNativeProps / focus / blur via
    hostInstance), never a DOM HTMLElement.
  </text>
  <text class="section-label">
    bind:this (component) + bind:propName (component)
  </text>
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
</view>
