<script setup lang="ts">
import { useStackNavigation } from '@symbiote-native/navigation/vue';

const navigation = useStackNavigation();
</script>

<template>
  <safe-area-view class="screen">
    <view class="details-card">
      <text class="details-title">You made it!</text>
      <text class="details-body">This screen was pushed by the Stack navigator — proof navigation actually works.</text>
    </view>
    <pressable
      class="button-secondary"
      @press="() => navigation.pop()"
    >
      <text class="button-secondary-text">Go back</text>
    </pressable>
  </safe-area-view>
</template>
