<script setup lang="ts">
import { useImageManipulator } from '@symbiote-native/image-manipulator/vue';
import type { IImageManipulatorContext } from '@symbiote-native/image-manipulator/vue';
import ActionButton from '../components/ActionButton.vue';

const props = defineProps<{
  source: string;
  color: string;
  run: (context: IImageManipulatorContext) => void;
}>();

const context = useImageManipulator(() => props.source);
</script>

<template>
  <view class="button-row">
    <ActionButton
      testID="image-manipulator-hook-button"
      title="useImageManipulator context"
      :onPress="() => run(context.value)"
      :color="color"
    />
    <ActionButton
      testID="image-manipulator-reset-button"
      title="context.reset()"
      :onPress="() => context.value.reset()"
      :color="color"
    />
  </view>
</template>
