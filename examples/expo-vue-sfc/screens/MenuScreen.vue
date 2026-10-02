<script setup lang="ts">
import { useStackNavigation } from '@symbiote-native/navigation/vue';
import { ROUTE_LINE_INFO } from '../navigation-lines';
import { MENU_ITEMS } from './menu-items';

// Only ever mounted under the root Stack, so the handle is Stack-specific with no union narrowing
const navigation = useStackNavigation();
</script>

<template>
  <safe-area-view class="screen">
    <scroll-view testID="menu-scroll" class="screen" contentContainerStyle="scroll-content">
      <view class="menu-hero">
        <text class="menu-eyebrow">EXPO MODULES DEMOS</text>
        <text class="menu-hero-title">Expo-SDK ports on a real native stack</text>
        <text class="menu-hero-subtitle">
          Each row below demos a different @symbiote-native package built on expo-modules-core.
        </text>
      </view>
      <pressable
        v-for="item in MENU_ITEMS"
        :key="item.route"
        :testID="`menu-row-${item.route}`"
        :class="`menu-row menu-row-${ROUTE_LINE_INFO[item.route].line}`"
        @press="() => navigation.push(item.route)"
      >
        <view :class="`menu-badge menu-badge-${ROUTE_LINE_INFO[item.route].line}`">
          <text class="menu-badge-text">{{ ROUTE_LINE_INFO[item.route].code }}</text>
        </view>
        <view class="menu-row-copy">
          <text class="menu-row-label">{{ item.label }}</text>
          <text :class="`menu-row-hint menu-row-hint-${ROUTE_LINE_INFO[item.route].line}`">
            {{ item.hint }}
          </text>
        </view>
      </pressable>
    </scroll-view>
  </safe-area-view>
</template>
