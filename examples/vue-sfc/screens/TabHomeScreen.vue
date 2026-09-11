<!-- Tabs demo · Home tab: custom tabBarIcon + tabBarActiveTintColor (registered on TabsDemoScreen.vue's <TabScreen>). Vue SFC twin of TabsDemoScreen.tsx's inline TabHomeScreen. -->
<script setup lang="ts">
import { useIsFocused } from '@symbiote-native/navigation/vue';
import { ROUTE_NAME } from '../routes';
import { LINE_COLOR, ROUTE_LINE_INFO } from '../navigation-lines';

const isFocused = useIsFocused();
const lineInfo = ROUTE_LINE_INFO[ROUTE_NAME.TabsDemo];
</script>

<template>
  <safe-area-view class="screen">
    <view class="section">
      <view :class="`line-tag line-tag-${lineInfo.line}`">
        <text class="line-tag-text">{{
          `${lineInfo.code} · ${lineInfo.label}`
        }}</text>
      </view>
      <view class="hero-card">
        <view
          class="hero-badge"
          :style="{ backgroundColor: LINE_COLOR.structure }"
        >
          <text class="hero-badge-text">TB</text>
        </view>
        <view class="hero-copy">
          <text class="hero-title">Tabs</text>
          <text class="hero-body"
            >A bottom-tabs navigator — icon, badge, and tint, each tab a real
            native view.</text
          >
        </view>
      </view>
      <text class="info-text">{{ `focused: ${isFocused}` }}</text>
    </view>
  </safe-area-view>
</template>
