<script>
  import Row from './svelte-suite-row.svelte';
  import { registerSetBenchState } from './svelte-suite-bridge';

  // `$state.raw`, not `$state`: the list is REPLACED wholesale by every step, never mutated in
  // place, so deep reactivity would only buy a proxy per row object — two thousand of them per step.
  // The device screen spells it the same way (`examples/svelte/screens/BenchmarkScreen.svelte:373`)
  // and Vue's arm uses `shallowRef` for the identical reason. Measured with the deep spelling first:
  // every mutation step carried a flat ~20 ms of proxying (select 30.1, swap 21.9, remove 25.6
  // against the engine's own 0.8 walk / 3.3 apply).
  let localState = $state.raw({ rows: [], selectedId: undefined });

  // Registered from the component body so the fixture can drive the state the component owns. See
  // `svelte-suite-bridge.ts` for why there is no handle to write through instead.
  registerSetBenchState(next => {
    localState = next;
  });
</script>

<view style={{ flex: 1 }}>
  {#each localState.rows as row (row.id)}
    <Row {row} isSelected={row.id === localState.selectedId} />
  {/each}
</view>
