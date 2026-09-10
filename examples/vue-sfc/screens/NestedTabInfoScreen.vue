<!-- A second nested tab, proving the nested Tab bar switches focus normally. Vue SFC twin of NestedNavigatorsScreen.tsx's inline NestedTabInfoScreen. -->
<script setup lang="ts">
import { ROUTE_NAME } from '../routes';
import { ROUTE_LINE_INFO } from '../navigation-lines';

const lineInfo = ROUTE_LINE_INFO[ROUTE_NAME.NestedNavigators];
</script>

<template>
  <safe-area-view class="screen">
    <view class="section">
      <view :class="`line-tag line-tag-${lineInfo.line}`">
        <text class="line-tag-text">{{
          `${lineInfo.code} · ${lineInfo.label}`
        }}</text>
      </view>
      <text class="section-label">Nested Tab · Info</text>
      <text class="info-text"
        >A second tab, proving the nested Tab bar switches focus normally.</text
      >
    </view>
  </safe-area-view>
</template>
