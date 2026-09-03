<!--
  Every mount/update/unmount lifecycle hook, logged out through a `log` emit so the trail survives
  after the component itself unmounts (ApiPlaygroundScreen.vue keeps the log in its own state).
  onRenderTracked/onRenderTriggered are dev-only debug hooks that fire on EVERY reactive
  dependency access during render — logged once each (not every firing) so the log stays readable.
  The throw button exercises BOTH onErrorCaptured (an ancestor's hook, registered in
  ApiPlaygroundScreen.vue around this component) and app.config.errorHandler in one press: this
  component's own onErrorCaptured hook (if it had one) would need to return exactly `false` to
  stop propagation — the ancestor's hook here deliberately does NOT, so the same error also reaches
  the global handler, proving both fire from one throw.
-->
<script setup lang="ts">
import {
  onBeforeMount,
  onMounted,
  onBeforeUpdate,
  onUpdated,
  onBeforeUnmount,
  onUnmounted,
  onRenderTracked,
  onRenderTriggered,
} from 'vue';
import { View, Text } from '@symbiote-native/vue';
import ActionButton from '../ActionButton.vue';

defineProps<{ seed: number }>();
const emit = defineEmits<{ log: [message: string] }>();

onBeforeMount(() => emit('log', 'onBeforeMount'));
onMounted(() => emit('log', 'onMounted'));
onBeforeUpdate(() => emit('log', 'onBeforeUpdate'));
onUpdated(() => emit('log', 'onUpdated'));
onBeforeUnmount(() => emit('log', 'onBeforeUnmount'));
onUnmounted(() => emit('log', 'onUnmounted'));

let trackedLogged = false;
let triggeredLogged = false;
onRenderTracked(() => {
  if (trackedLogged) return;
  trackedLogged = true;
  emit('log', 'onRenderTracked (dev-only, logged once)');
});
onRenderTriggered(() => {
  if (triggeredLogged) return;
  triggeredLogged = true;
  emit('log', 'onRenderTriggered (dev-only, logged once)');
});

function throwNow(): void {
  throw new Error(
    'LifecycleLogChild: intentional error — see onErrorCaptured / app.config.errorHandler',
  );
}
</script>

<template>
  <View class="a11y-card" :style="{ borderWidth: 1, borderColor: '#f5a623' }">
    <Text class="switch-label">LifecycleLogChild</Text>
    <Text class="note-text" testID="lifecycle-seed">{{
      `seed prop = ${seed} — bump it from the parent to fire onBeforeUpdate/onUpdated`
    }}</Text>
    <ActionButton
      testID="lifecycle-throw"
      title="throw() → onErrorCaptured + errorHandler"
      :onPress="throwNow"
      color="#f5a623"
    />
  </View>
</template>
