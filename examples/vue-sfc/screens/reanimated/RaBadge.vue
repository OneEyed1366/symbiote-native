<script setup lang="ts">
import { shallowRef } from 'vue';
import Reanimated from '@symbiote-native/reanimated/vue';

// A ref on a component gets what it exposes, so the node goes out as `hostNode`
const hostNode = shallowRef<unknown>(null);
defineExpose({ hostNode });

const captureNode = (node: unknown) => {
  hostNode.value = node;
};
</script>

<template>
  <Reanimated.View class="ra-tile ra-tile-small" :ref="captureNode" />
</template>
