<script setup lang="ts">
import StyleShowcaseTile from '../../components/StyleShowcaseTile.vue';
</script>

<template>
  <view class="sc-panel">
    <text class="sc-panel-title">
      1 · Declarations, as the compiler emits them
    </text>
    <text class="sc-panel-note">
      lightningcss hands back a typed value tree, so a shorthand arrives already
      expanded into four sides and a corner longhand as the pair it really is.
      Neither was true of the hand-rolled evaluator this replaced.
    </text>

    <text class="sc-tile-label"> SHORTHAND EXPANSION </text>
    <view class="sc-shorthand-box" testID="sc-shorthand-box">
      <view class="sc-shorthand-core" />
    </view>
    <text class="sc-tile-caption">
      padding: 6px 12px 26px 38px · border-width: 1px 4px 10px 20px — four
      different values on each. Uniform insets mean only the first value
      survived.
    </text>

    <view class="sc-pair">
      <StyleShowcaseTile
        label="BORDER-RADIUS"
        caption="the shorthand — always worked"
      >
        <view class="sc-corner-shorthand" testID="sc-corner-shorthand" />
      </StyleShowcaseTile>
      <StyleShowcaseTile
        label="FOUR LONGHANDS"
        caption="28 / 4 / 28 / 4 — a leaf. A square here is the bug this screen was built for."
      >
        <view class="sc-corner-longhand" testID="sc-corner-longhand" />
      </StyleShowcaseTile>
    </view>

    <view class="sc-pair">
      <StyleShowcaseTile
        label="BACKGROUND-IMAGE"
        caption="a real native Fabric prop"
      >
        <view class="sc-gradient-tile" testID="sc-gradient-tile" />
      </StyleShowcaseTile>
      <StyleShowcaseTile
        label="+ FILTER"
        caption="same gradient, brighter. iOS paints only brightness and opacity — the grayscale half needs RN's enableSwiftUIBasedFilters flag. Identical twins mean filter stopped arriving entirely."
      >
        <view class="sc-filter-tile" testID="sc-filter-tile" />
      </StyleShowcaseTile>
    </view>

    <view class="sc-pair">
      <StyleShowcaseTile
        label="ROTATE, DEFAULT ORIGIN"
        caption="pivots about centre"
      >
        <view class="sc-origin-frame">
          <view class="sc-origin-square" testID="sc-origin-centre" />
        </view>
      </StyleShowcaseTile>
      <StyleShowcaseTile
        label="+ TRANSFORM-ORIGIN"
        caption="top left — the same rotation, visibly offset"
      >
        <view class="sc-origin-frame">
          <view class="sc-origin-square-corner" testID="sc-origin-corner" />
        </view>
      </StyleShowcaseTile>
    </view>

    <text class="sc-tile-label"> BOX-SHADOW · TWO LAYERS </text>
    <view class="sc-shadow-tile" testID="sc-shadow-tile" />
    <text class="sc-tile-caption">
      Handed through as raw CSS text and parsed by the engine's own
      processBoxShadow port, so spread radius and multiple layers survive.
    </text>
  </view>
</template>
