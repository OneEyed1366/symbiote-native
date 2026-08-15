<script lang="ts">
  // Drop-in replacement for RN's stock <Button> (same title/onPress/color/testID surface) — a
  // bare Button renders as unstyled tinted text on iOS, visually indistinguishable from a body
  // Text line. One consistent bordered pill, tinted in the caller's own `color`, so every screen's
  // per-feature color-coding is preserved while the chrome stays consistent. Svelte twin of
  // examples/expo-vue-sfc/components/ActionButton.vue and examples/svelte's own ActionButton.
  import { Pressable, Text } from '@symbiote-native/svelte';

  let {
    title,
    onPress,
    color,
    testID,
  }: { title: string; onPress: () => void; color: string; testID?: string } = $props();
</script>

<Pressable
  {testID}
  {onPress}
  class="action-button"
  style={({ pressed }) => ({ borderColor: color, opacity: pressed ? 0.6 : 1 })}
>
  <Text class="action-button-text" style={{ color }}>{title}</Text>
</Pressable>
