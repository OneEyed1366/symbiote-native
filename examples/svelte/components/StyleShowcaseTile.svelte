<script lang="ts">
  // One half of a side-by-side pair on the styling showcase: a label, the specimen itself, a
  // caption. Svelte twin of the local Tile function in
  // examples/react/screens/StyleShowcaseScreen.tsx — a component rather than a snippet because it
  // wraps arbitrary content, which is what `children` is for.
  import { Text, View } from '@symbiote-native/svelte';
  import type { Snippet } from 'svelte';

  let {
    label,
    caption,
    children,
  }: { label: string; caption: string; children: Snippet } = $props();
</script>

<View class="sc-pair-half">
  <Text class="sc-tile-label">{label}</Text>
  {@render children()}
  <Text class="sc-tile-caption">{caption}</Text>
</View>
