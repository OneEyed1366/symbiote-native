<!--
  Drawer demo · Home: this screen is mounted under a Drawer, so useDrawerNavigation() hands back
  the Drawer-specific handle (openDrawer/closeDrawer/toggleDrawer/jumpTo) directly — no narrowing.
  Vue SFC twin of DrawerDemoScreen.tsx's inline DrawerHomeScreen.
-->
<script setup lang="ts">
import { useDrawerNavigation } from '@symbiote-native/navigation/vue';
import { ROUTE_NAME } from '../routes';
import { LINE_COLOR, ROUTE_LINE_INFO } from '../navigation-lines';
import ActionButton from '../components/ActionButton.vue';

const navigation = useDrawerNavigation();
const lineInfo = ROUTE_LINE_INFO[ROUTE_NAME.DrawerDemo];
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
          <text class="hero-badge-text">DR</text>
        </view>
        <view class="hero-copy">
          <text class="hero-title">Drawer</text>
          <text class="hero-body"
            >A swipeable drawer sliding in from the right, driven by the
            navigator's own gesture handler.</text
          >
        </view>
      </view>
      <text class="info-text"
        >drawerPosition: right · drawerType: slide — swipe from the RIGHT edge,
        or use a button</text
      >
      <ActionButton
        testID="drawer-open"
        title="Open drawer"
        :onPress="() => navigation.openDrawer()"
        :color="LINE_COLOR.structure"
      />
      <ActionButton
        testID="drawer-toggle"
        title="Toggle drawer"
        :onPress="() => navigation.toggleDrawer()"
        :color="LINE_COLOR.structure"
      />
    </view>
  </safe-area-view>
</template>
