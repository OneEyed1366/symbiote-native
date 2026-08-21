<!--
  useModel() — the non-macro runtime equivalent of defineModel() (CounterCapsule.vue's macro is
  sugar built on exactly this + a generated prop/emit declaration). Kept as its own tiny component
  rather than folded into CounterCapsule so the two forms stay visibly distinct call sites.
-->
<script setup lang="ts">
import { useModel } from 'vue';
import { View, Text } from '@symbiote-native/vue';
import ActionButton from '../ActionButton.vue';

const props = defineProps<{ count: number }>();
defineEmits<{ 'update:count': [value: number] }>();

const count = useModel(props, 'count');

function increment(): void {
  count.value += 1;
}
</script>

<template>
  <View class="a11y-card">
    <Text class="switch-label">useModel() — non-macro v-model</Text>
    <Text class="list-row-text" testID="usemodel-count">{{
      `count=${count}`
    }}</Text>
    <ActionButton
      testID="usemodel-increment"
      title="increment (v-model:count)"
      :onPress="increment"
      color="#f5a623"
    />
  </View>
</template>
