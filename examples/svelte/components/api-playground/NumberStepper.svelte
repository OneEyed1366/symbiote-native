<script lang="ts">
  // $bindable() demo (Runes · Yes) and, via `bind:this` + the exported `reset` function, the
  // "bind:this (component)" / "bind:propName (component)" Bindings rows — the same shape
  // @symbiote-native/navigation's <Stack bind:this={navigator}> uses for push/pop/… (App.svelte's
  // own header comment). `$props.id()` (Runes · Partial) rides along here too: it generates a
  // real per-instance id, but this project has no <label for> to link it to, so it's shown only
  // as a plain debug caption — the caveat is the whole point of the demo.
  import { Pressable, Text, View } from '@symbiote-native/svelte';

  let {
    value = $bindable(0),
    label = 'value',
    testID,
  }: { value?: number; label?: string; testID?: string } = $props();

  const instanceId = $props.id();

  export function reset(): void {
    value = 0;
  }
</script>

<View class="row-align-center" {testID}>
  <Pressable
    testID={testID && `${testID}-decrement`}
    class="action-button"
    onPress={() => (value -= 1)}
  >
    <Text class="action-button-text">−</Text>
  </Pressable>
  <Text class="info-text-flex">
    {`${label}: ${value} · $props.id(): ${instanceId}`}
  </Text>
  <Pressable
    testID={testID && `${testID}-increment`}
    class="action-button"
    onPress={() => (value += 1)}
  >
    <Text class="action-button-text">+</Text>
  </Pressable>
</View>
