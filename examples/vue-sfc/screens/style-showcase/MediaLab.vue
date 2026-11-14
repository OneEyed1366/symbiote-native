<script setup lang="ts">
import { computed } from 'vue';
import { useWindowQuery } from './window-query';

// The device lab: the e2e test reads the text readouts and counts the pixels of the swatches,
// whose colours no other rule of the app uses (StyleShowcase.lab.css)
// Text sits hugging its tag: the template compiler keeps the padding of a padded one as a space
const wide = useWindowQuery('(min-width: 600px)');
const landscape = useWindowQuery('(orientation: landscape)');
const dark = useWindowQuery('(prefers-color-scheme: dark)');

const mediaReadout = computed(
  () =>
    `wide=${wide.value.matches} landscape=${landscape.value.matches} changes=${wide.value.changes + landscape.value.changes}`,
);
const schemeReadout = computed(
  () => `dark=${dark.value.matches} changes=${dark.value.changes}`,
);
</script>

<template>
  <view class="sc-panel">
    <text class="sc-panel-title">10 · Device lab: @media, matchMedia</text>
    <text class="sc-tile-label">WINDOW 600 WIDE · ORIENTATION</text>
    <view class="lab-row">
      <view class="lab-media-swatch" testID="lab-media-swatch" />
      <text class="lab-readout" testID="lab-media-readout">{{ mediaReadout }}</text>
    </view>
    <text class="sc-tile-caption"
      >Rose in a narrow window, teal from 600 wide. The readout comes from
      matchMedia and counts its change events.</text
    >
    <text class="sc-tile-label">COLOR SCHEME OF THE DEVICE</text>
    <view class="lab-row">
      <view class="lab-scheme-swatch" testID="lab-scheme-swatch" />
      <text class="lab-readout" testID="lab-scheme-readout">{{ schemeReadout }}</text>
    </view>
    <text class="sc-tile-caption"
      >Orange on a light device, indigo on a dark one. Its own change count,
      apart from the window readout above.</text
    >
  </view>
</template>
