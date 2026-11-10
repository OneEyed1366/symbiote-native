<script setup lang="ts">
import { ref } from 'vue';
import StyleShowcaseToggle from '../../components/StyleShowcaseToggle.vue';

const isOn = ref(false);
</script>

<template>
  <view class="sc-panel">
    <text class="sc-panel-title"> 7 · SCSS · Less · Stylus </text>
    <text class="sc-panel-note">
      Each source reduces to plain CSS before the compiler sees it, so
      everything above applies identically regardless of language. Each tile
      leans on a variable, a parametric mixin, and arithmetic, so its padding is
      a number the source never spells — 26 / 22 / 18 px, from 13 / 11 / 9
      doubled.
    </text>
    <view class="sc-chip-row">
      <view
        :class="`scss-tile${isOn ? ' scss-tile-on' : ''}`"
        testID="sc-scss-tile"
      >
        <text class="scss-tile-text"> SCSS </text>
      </view>
      <view
        :class="`less-tile${isOn ? ' less-tile-on' : ''}`"
        testID="sc-less-tile"
      >
        <text class="less-tile-text"> Less </text>
      </view>
      <view
        :class="`styl-tile${isOn ? ' styl-tile-on' : ''}`"
        testID="sc-styl-tile"
      >
        <text class="styl-tile-text"> Stylus </text>
      </view>
    </view>
    <text class="sc-tile-caption">
      Three different corner radii (14 / 18 / 22) from three mixin calls. The
      toggle turns on each file's `&.x-tile-on` nest, which compiles to a
      COMPOUND selector — nesting that produced a descendant would hit the limit
      two panels down.
    </text>
    <StyleShowcaseToggle
      testID="sc-preprocessor-toggle"
      label="nested &.on rule"
      :active="isOn"
      :onToggle="() => (isOn = !isOn)"
    />
  </view>
</template>
