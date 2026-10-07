<script setup lang="ts">
import { LOGO_URI } from './canary-shared';

const GLOW_STYLE = { boxShadow: '0px 0px 22px 3px rgba(20,158,202,0.85)' };
const DARKEN_STYLE = { filter: [{ brightness: 0.5 }] };
const ROTATED_STYLE = { transformOrigin: 'top left', transform: [{ rotate: '4deg' }] };
</script>

<template>
  <!-- Modern style props reaching Fabric's C++ parser, each an A/B on the dark theme -->
  <view
    class="shadow-card"
    :style="GLOW_STYLE"
  >
    <text class="note-text"> boxShadow · glow </text>
  </view>
  <view class="row">
    <view class="filter-tile">
      <text class="tile-text"> no filter </text>
    </view>
    <view
      class="filter-tile"
      :style="DARKEN_STYLE"
    >
      <text class="tile-text"> brightness 0.5 </text>
    </view>
  </view>
  <view
    class="rotated-card"
    :style="ROTATED_STYLE"
  >
    <text class="tile-text"> transformOrigin · top-left </text>
  </view>
  <!-- The gradient is authored in App.css and reaches Fabric through the css-parser -->
  <view class="gradient-card">
    <text class="tile-text"> background-image · linear-gradient </text>
  </view>
  <!-- PASS: the logo loads through the web alias fold and reads as "Vue logo" -->
  <image
    :src="LOGO_URI"
    alt="Vue logo"
    :width="48"
    :height="48"
    class="web-image"
  />
</template>
