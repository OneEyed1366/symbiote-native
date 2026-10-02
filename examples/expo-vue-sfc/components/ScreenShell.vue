<script setup lang="ts">
import { computed } from 'vue';
import { LINE_COLOR, ROUTE_LINE_INFO } from '../navigation-lines';
import type { ITourRouteName } from '../navigation-lines';

const props = defineProps<{
  route: ITourRouteName;
  title: string;
  body: string;
  testID: string;
}>();

const lineInfo = computed(() => ROUTE_LINE_INFO[props.route]);
const lineColor = computed(() => LINE_COLOR[lineInfo.value.line]);
</script>

<!-- Line tag + hero card + scroll container shared by every demo screen -->
<template>
  <safe-area-view class="screen">
    <scroll-view
      :testID="testID"
      class="screen"
      contentContainerStyle="scroll-content"
    >
      <view :class="`line-tag line-tag-${lineInfo.line}`">
        <text class="line-tag-text">
          {{ `${lineInfo.code} · ${lineInfo.label}` }}
        </text>
      </view>
      <view class="hero-card">
        <view
          class="hero-badge"
          :style="{ backgroundColor: lineColor }"
        >
          <text class="hero-badge-text">
            {{ lineInfo.code }}
          </text>
        </view>
        <view class="hero-copy">
          <text class="hero-title">
            {{ title }}
          </text>
          <text class="hero-body">
            {{ body }}
          </text>
        </view>
      </view>
      <slot />
    </scroll-view>
  </safe-area-view>
</template>
