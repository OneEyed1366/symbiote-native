<!--
  Reproduces vue-adapter-reactivity's Gotcha 2 (async-commit timing) live: reads a freshly-mounted
  node's native Fabric tag from THREE different "is it committed yet" signals, all fired from
  `onMounted()` — the exact lifecycle moment the gotcha bites. This has to be a SEPARATE component
  (not inline in the parent) so `onMounted()` fires at a genuine first-mount instant each time the
  parent remounts it via `v-if` + a bumped `:key`, not on an already-long-settled screen.
-->
<script setup lang="ts">
import { onMounted, nextTick, useTemplateRef } from 'vue';
import {
  getNativeTag,
  whenCommitted,
  type IHostInstance,
} from '@symbiote-native/engine';
import { View } from '@symbiote-native/vue';

const emit = defineEmits<{ result: [message: string] }>();
const probeRef = useTemplateRef<IHostInstance>('probe');

onMounted(() => {
  const node = probeRef.value;
  const immediateTag = node ? getNativeTag(node) : undefined;
  emit(
    'result',
    `onMounted() itself: getNativeTag = ${immediateTag ?? 'undefined'}`,
  );

  nextTick(() => {
    const tag = node ? getNativeTag(node) : undefined;
    emit('result', `nextTick(): getNativeTag = ${tag ?? 'undefined'}`);
  });

  if (node) {
    whenCommitted(node, () => {
      emit(
        'result',
        `whenCommitted(): getNativeTag = ${getNativeTag(node) ?? 'undefined'}`,
      );
    });
  }
});
</script>

<template>
  <View ref="probe" class="chip" testID="nexttick-probe-node" />
</template>
