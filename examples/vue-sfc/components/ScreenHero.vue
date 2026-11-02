<!-- Line tag and intro card every demo screen leads with, tinted by the screen's own line -->
<script setup lang="ts">
import { computed } from 'vue';
import { LINE_COLOR, ROUTE_LINE_INFO } from '../navigation-lines';
import type { ITourRouteName } from '../navigation-lines';

const props = defineProps<{
  route: ITourRouteName;
  title: string;
  body: string;
}>();

const info = computed(() => ROUTE_LINE_INFO[props.route]);
</script>

<template>
  <view :class="`line-tag line-tag-${info.line}`">
    <text class="line-tag-text">{{ `${info.code} · ${info.label}` }}</text>
  </view>
  <view class="hero-card">
    <view
      class="hero-badge"
      :style="{ backgroundColor: LINE_COLOR[info.line] }"
    >
      <text class="hero-badge-text">{{ info.code }}</text>
    </view>
    <view class="hero-copy">
      <text class="hero-title">{{ title }}</text>
      <text class="hero-body">{{ body }}</text>
    </view>
  </view>
</template>
