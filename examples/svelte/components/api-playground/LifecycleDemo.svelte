<script lang="ts">
  // Lifecycle section. `beforeUpdate`/`afterUpdate` are No — Svelte itself deprecates them
  // "especially with runes", and this adapter is runes-only throughout (no
  // <svelte:options runes={false}> anywhere in the codebase). No overlap with
  // HooksDemoScreen.svelte — that screen exercises @symbiote-native/navigation's OWN hooks
  // (useFocusEffect/useIsFocused/useNavigationState), never Svelte's onMount/onDestroy/tick/
  // settled directly; this is the first screen to do that.
  import { onMount, settled, tick } from 'svelte';
  import { Text, View } from '@symbiote-native/svelte';
  import { dlog } from '@symbiote-native/engine';
  import ActionButton from '../ActionButton.svelte';
  import DestroyableChild from './DestroyableChild.svelte';

  const ACCENT = '#f2789a';

  let mountedAt = $state<string | undefined>(undefined);
  onMount(() => {
    mountedAt = new Date().toLocaleTimeString();
    dlog('api-playground: LifecycleDemo onMount fired');
  });

  let childMounted = $state(true);
  let destroyedAt = $state<string | undefined>(undefined);
  function onChildGone(): void {
    destroyedAt = new Date().toLocaleTimeString();
  }
  function toggleChild(): void {
    childMounted = !childMounted;
    if (childMounted) destroyedAt = undefined;
  }

  let tickCounter = $state(0);
  let tickReadout = $state('not run yet');
  async function runTick(): Promise<void> {
    tickCounter += 1;
    await tick();
    tickReadout = `tick() resolved — tickCounter is ${tickCounter} once pending state changes applied`;
  }

  let settledCounter = $state(0);
  let settledReadout = $state('not run yet');
  async function runSettled(): Promise<void> {
    settledCounter += 1;
    await settled();
    settledReadout = `settled() resolved — settledCounter is ${settledCounter}, all pending work flushed`;
  }
</script>

<View class="section-nested">
  <Text class="section-label">
    Lifecycle · onMount, onDestroy, tick, settled
  </Text>
  <Text class="info-text" testID="lifecycle-mount-readout">
    {mountedAt === undefined
      ? 'not mounted yet'
      : `onMount fired at ${mountedAt}`}
  </Text>
  <ActionButton
    testID="lifecycle-toggle-child"
    title={childMounted ? 'Unmount child (fires onDestroy)' : 'Mount child'}
    color={ACCENT}
    onPress={toggleChild}
  />
  {#if childMounted}
    <DestroyableChild onGone={onChildGone} />
  {/if}
  <Text class="info-text" testID="lifecycle-destroy-readout">
    {destroyedAt === undefined
      ? 'child not destroyed yet'
      : `onDestroy fired at ${destroyedAt}`}
  </Text>
  <ActionButton
    testID="lifecycle-run-tick"
    title="await tick()"
    color={ACCENT}
    onPress={runTick}
  />
  <Text class="note-text" testID="lifecycle-tick-readout">
    {tickReadout}
  </Text>
  <ActionButton
    testID="lifecycle-run-settled"
    title="await settled()"
    color={ACCENT}
    onPress={runSettled}
  />
  <Text class="note-text" testID="lifecycle-settled-readout">
    {settledReadout}
  </Text>
</View>
