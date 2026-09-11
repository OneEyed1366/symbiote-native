<!-- Tabs demo · Profile tab: stays plain, no icon/badge/tint override — shows the default tab look side by side with the customized Home/Search tabs. Vue SFC twin of TabsDemoScreen.tsx's inline TabProfileScreen. -->
<script setup lang="ts">
import { useIsFocused } from '@symbiote-native/navigation/vue';
import { ROUTE_NAME } from '../routes';
import { ROUTE_LINE_INFO } from '../navigation-lines';

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
      <text class="section-label">Profile tab</text>
      <text class="info-text">{{ `focused: ${isFocused}` }}</text>
    </view>
  </safe-area-view>
</template>
