<script setup lang="ts">
import { useDrawerNavigation } from '@symbiote-native/navigation/vue';
import ActionButton from '../components/ActionButton.vue';
import { LINE_COLOR } from '../navigation-lines';

const navigation = useDrawerNavigation();
const COLOR = LINE_COLOR.structure;
</script>

<template>
  <scroll-view class="screen" contentInsetAdjustmentBehavior="automatic">
    <view class="scroll-content">
      <text class="section-label">Drawer demo · Settings</text>
      <ActionButton
        testID="drawer-close-from-settings"
        title="Close drawer"
        :onPress="() => navigation.closeDrawer()"
        :color="COLOR"
      />
    </view>
  </scroll-view>
</template>
