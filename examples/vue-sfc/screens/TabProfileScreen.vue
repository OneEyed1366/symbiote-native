<script setup lang="ts">
import { useRoute } from '@symbiote-native/navigation/vue';

const route = useRoute();
</script>

<template>
  <scroll-view class="screen" contentInsetAdjustmentBehavior="automatic">
    <view class="scroll-content">
      <text class="section-label">Profile tab</text>
      <text testID="tabs-profile-params" class="info-text">
        {{ `params: ${JSON.stringify(route.params) ?? 'none'}` }}
      </text>
    </view>
  </scroll-view>
</template>
