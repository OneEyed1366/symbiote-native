<!--
  One half of a side-by-side pair on StyleShowcaseScreen: a label, the demo node itself, a caption
  under it. The node arrives through the default slot, so a tile never knows what it is framing.
  Vue SFC twin of the local `Tile` in .examples/react/screens/StyleShowcaseScreen.tsx — its own
  file because an SFC holds exactly one component.
-->
<script setup lang="ts">
defineProps<{
  label: string;
  caption: string;
}>();
</script>

<template>
  <view class="sc-pair-half">
    <text class="sc-tile-label">{{ label }}</text>
    <slot />
    <text class="sc-tile-caption">{{ caption }}</text>
  </view>
</template>
