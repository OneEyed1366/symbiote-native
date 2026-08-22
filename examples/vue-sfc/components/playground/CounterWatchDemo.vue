<!--
  ref/computed/watch/watchEffect/watchPostEffect/watchSyncEffect, all driven off ONE counter so
  a single "increment" press fires all four watcher flavors at once — the log's ordering is the
  real proof, not asserted: watchSyncEffect logs synchronously (before this press handler even
  returns), watch/watchEffect are pre-flush (batched, log next), watchPostEffect is flush:'post'
  (the exact timing vue-adapter-reactivity's Gotcha 2 warns about for anything reading a native
  Fabric tag — nothing here needs a tag, so it's safe, just later in the log by design).
-->
<script setup lang="ts">
import {
  ref,
  computed,
  watch,
  watchEffect,
  watchPostEffect,
  watchSyncEffect,
} from 'vue';
import { View, Text } from '@symbiote-native/vue';
import ActionButton from '../ActionButton.vue';

const count = ref(0);
const doubled = computed(() => count.value * 2);
const log = ref<string[]>([]);

function pushLog(entry: string): void {
  log.value = [...log.value, entry].slice(-8);
}

watch(count, (nv, ov) => pushLog(`watch: ${ov} → ${nv}`));
watchEffect(() => pushLog(`watchEffect: doubled=${doubled.value}`));
watchPostEffect(() =>
  pushLog(`watchPostEffect (flush:'post'): doubled=${doubled.value}`),
);
watchSyncEffect(() =>
  pushLog(`watchSyncEffect (flush:'sync'): count=${count.value}`),
);

function increment(): void {
  count.value += 1;
}
</script>

<template>
  <View class="a11y-card">
    <Text class="switch-label"
      >ref + computed + watch/watchEffect/watchPostEffect/watchSyncEffect</Text
    >
    <Text class="list-row-text" testID="reactivity-counter">{{
      `count=${count} · doubled (computed)=${doubled}`
    }}</Text>
    <ActionButton
      testID="reactivity-increment"
      title="increment"
      :onPress="increment"
      color="#f5a623"
    />
    <Text class="section-label">firing order (last 8)</Text>
    <Text v-for="(entry, index) in log" :key="index" class="list-row-text">{{
      entry
    }}</Text>
  </View>
</template>
