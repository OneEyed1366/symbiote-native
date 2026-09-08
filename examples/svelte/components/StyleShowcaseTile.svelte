<script lang="ts">
  // One half of a side-by-side pair on the styling showcase: a label, the specimen itself, a
  // caption. Svelte twin of the local Tile function in
  // examples/react/screens/StyleShowcaseScreen.tsx — a component rather than a snippet because it
  // wraps arbitrary content, which is what `children` is for.
  import type { Snippet } from 'svelte';

  let {
    label,
    caption,
    children,
  }: { label: string; caption: string; children: Snippet } = $props();
</script>

<view class="sc-pair-half">
  <text class="sc-tile-label">{label}</text>
  {@render children()}
  <text class="sc-tile-caption">{caption}</text>
</view>
