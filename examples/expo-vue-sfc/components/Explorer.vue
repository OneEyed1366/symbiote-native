<script setup lang="ts">
import { ref } from 'vue';
import ActionButton from './ActionButton.vue';

// Every remaining API call of the package, collapsed so the scenarios above stay the main story
const props = defineProps<{ testID: string; color: string }>();

const isOpen = ref(false);

function toggle(): void {
  isOpen.value = !isOpen.value;
}
</script>

<template>
  <view :testID="props.testID" class="explorer">
    <ActionButton
      :testID="`${props.testID}-toggle`"
      :title="isOpen ? 'Hide API explorer' : 'Open API explorer: every call and option'"
      :onPress="toggle"
      :color="props.color"
    />
    <slot v-if="isOpen" />
  </view>
</template>
