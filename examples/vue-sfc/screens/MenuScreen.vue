<!-- Root menu, one row per section, each pushes its hub screen with the section's stops -->
<script setup lang="ts">
import { useStackNavigation } from '@symbiote-native/navigation/vue';
import { MENU_SECTIONS } from '../menu-sections';
import MenuRow from './MenuRow.vue';

const navigation = useStackNavigation();
</script>

<template>
  <safe-area-view class="screen">
    <scroll-view testID="menu-scroll" class="screen">
      <view class="scroll-content">
        <view class="menu-hero">
          <text class="menu-eyebrow">SYMBIOTE NATIVE DEMO SUITE</text>
          <text class="menu-hero-title">Four sections to explore</text>
          <text class="menu-hero-subtitle">
            Framework covers primitives, Vue APIs and CSS styling. Navigation
            drives @symbiote-native/navigation on a real native stack. Packages
            shows the companion libraries. Benchmarks times the engine's own
            commit path.
          </text>
        </view>
        <MenuRow
          v-for="section in MENU_SECTIONS"
          :key="section.route"
          :testID="`menu-row-${section.route}`"
          :line="section.line"
          :code="section.code"
          :label="section.title"
          :hint="section.hint"
          :onPress="() => navigation.push(section.route)"
        />
      </view>
    </scroll-view>
  </safe-area-view>
</template>
