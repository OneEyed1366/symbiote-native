<script setup lang="ts">
import { shallowRef } from 'vue';
import Reanimated from '@symbiote-native/reanimated/vue';
import type { IHostInstance } from '@symbiote-native/vue';

// A ref on a component gets what it exposes, so the node goes out as `hostNode`
const hostNode = shallowRef<IHostInstance | null>(null);
defineExpose({ hostNode });
</script>

<template>
  <Reanimated.View class="ra-tile ra-tile-small" ref="hostNode" />
</template>
