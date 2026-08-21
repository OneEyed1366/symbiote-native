<!--
  defineModel/defineEmits/defineExpose/defineOptions (all compiler macros — no import) + the real
  runtime `useAttrs()` composable, wired together into one small `v-model:count`-able component.
  This is app-level code, not a package component, so reaching for defineModel's sugar is fine here
  — the codebase's OWN components (TextInput/Switch/Slider) deliberately use the lower-level
  resolveModelValue/emitModelUpdate helper pair instead (vue-adapter-events Rule 6), a different
  concern (that helper folds a component's v-model contract through the SAME normalization path
  every host prop goes through; this macro is Vue's own general-purpose sugar for app code).
-->
<script setup lang="ts">
import { useAttrs } from 'vue';
import { View, Text } from '@symbiote-native/vue';
import ActionButton from '../ActionButton.vue';

defineOptions({ name: 'CounterCapsule', inheritAttrs: false });

const count = defineModel<number>('count', { default: 0 });
const emit = defineEmits<{ threshold: [] }>();
const attrs = useAttrs();

function increment(): void {
  count.value += 1;
  if (count.value === 10) emit('threshold');
}

function reset(): void {
  count.value = 0;
}

defineExpose({ reset });
</script>

<template>
  <View class="a11y-card">
    <Text class="switch-label"
      >CounterCapsule — defineModel + defineEmits + defineExpose</Text
    >
    <Text class="list-row-text" testID="capsule-count">{{
      `count=${count}`
    }}</Text>
    <Text class="note-text">{{
      `useAttrs() fallthrough (inheritAttrs:false) = ${JSON.stringify(attrs)}`
    }}</Text>
    <ActionButton
      testID="capsule-increment"
      title="increment (v-model:count)"
      :onPress="increment"
      color="#f5a623"
    />
  </View>
</template>
