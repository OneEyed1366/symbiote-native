<script setup lang="ts">
import { computed } from 'vue';
import ActionButton from '../components/ActionButton.vue';

const props = defineProps<{ error: unknown; resetError: () => void; color: string }>();

const message = computed(
  () => `caught: ${props.error instanceof Error ? props.error.message : String(props.error)}`,
);
</script>

<template>
  <view>
    <text testID="app-metrics-boundary-message" class="info-text">{{ message }}</text>
    <ActionButton
      testID="app-metrics-reset-button"
      title="resetError"
      :onPress="resetError"
      :color="color"
    />
  </view>
</template>
