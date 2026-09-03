<script lang="ts">
  // Stores section — every row is Yes: pure JS, no DOM dependency, so the whole `svelte/store`
  // API works unmodified. Not used elsewhere in this app (which prefers runes — HooksDemoScreen
  // and StatePersistenceScreen both read live state straight off @symbiote-native/navigation's
  // own $state-shaped hooks), so this is the first screen to exercise it directly.
  import {
    derived,
    fromStore,
    get,
    readable,
    readonly,
    toStore,
    writable,
  } from 'svelte/store';
  import type { Readable, StartStopNotifier, Writable } from 'svelte/store';
  import { Text, View } from '@symbiote-native/svelte';
  import ActionButton from '../ActionButton.svelte';

  const ACCENT = '#4fd1a5';
  const CLOCK_INTERVAL_MS = 1_000;

  // writable + $store auto-subscription
  const countStore: Writable<number> = writable(0);

  // derived (store)
  const doubledStore = derived(countStore, value => value * 2);

  // readonly(store) — the returned store's `.set`/`.update` are gone at the TYPE level; only
  // `$readonlyCountStore` (read) compiles.
  const readonlyCountStore: Readable<number> = readonly(countStore);

  // readable + a real StartStopNotifier — starts a ticking clock on first subscriber, tears it
  // down on last unsubscribe.
  const clockStartStop: StartStopNotifier<string> = set => {
    const id = setInterval(
      () => set(new Date().toLocaleTimeString()),
      CLOCK_INTERVAL_MS,
    );
    return () => clearInterval(id);
  };
  const clockStore = readable(new Date().toLocaleTimeString(), clockStartStop);

  // get(store) — a one-off read with no subscription
  let getReadout = $state('not read yet');
  function readOnce(): void {
    getReadout = `get(countStore) -> ${get(countStore)}`;
  }

  // toStore/fromStore — bridging a $state rune into store form and back
  let bridgeRune = $state(0);
  const bridgeStore: Writable<number> = toStore(
    () => bridgeRune,
    value => (bridgeRune = value),
  );
  const backToRune = fromStore(countStore);
</script>

<View class="section-nested">
  <Text class="section-label">
    Stores · writable, derived, get, readonly, toStore/fromStore
  </Text>
  <View class="row-align-center">
    <ActionButton
      testID="stores-decrement"
      title="countStore.update(-1)"
      color={ACCENT}
      onPress={() => countStore.update(value => value - 1)}
    />
    <ActionButton
      testID="stores-set-zero"
      title="countStore.set(0)"
      color={ACCENT}
      onPress={() => countStore.set(0)}
    />
    <ActionButton
      testID="stores-increment"
      title="countStore.update(+1)"
      color={ACCENT}
      onPress={() => countStore.update(value => value + 1)}
    />
  </View>
  <Text class="info-text" testID="stores-count-readout">
    {`$countStore: ${$countStore} · derived $doubledStore: ${$doubledStore} · readonly $readonlyCountStore: ${$readonlyCountStore}`}
  </Text>
  <ActionButton
    testID="stores-get-once"
    title="get(countStore)"
    color={ACCENT}
    onPress={readOnce}
  />
  <Text class="note-text" testID="stores-get-readout">
    {getReadout}
  </Text>
  <Text class="info-text" testID="stores-clock-readout">
    {`readable() ticking clock: ${$clockStore}`}
  </Text>
  <Text class="section-label">
    toStore / fromStore — bridging a $state rune
  </Text>
  <View class="row-align-center">
    <ActionButton
      testID="stores-bridge-set"
      title="bridgeStore.set(bridgeRune + 1)"
      color={ACCENT}
      onPress={() => bridgeStore.set(bridgeRune + 1)}
    />
  </View>
  <Text class="info-text" testID="stores-bridge-readout">
    {`bridgeRune ($state): ${bridgeRune} · $bridgeStore (toStore of it): ${$bridgeStore} · fromStore(countStore).current: ${backToRune.current}`}
  </Text>
</View>
