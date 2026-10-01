<script setup lang="ts" generic="T">
import { onUnmounted, ref } from 'vue';
import type { ILocationSubscription } from '@symbiote-native/location/vue';
import ResultRow from '../components/ResultRow.vue';
import ToggleRow from '../components/ToggleRow.vue';

const props = defineProps<{
  prefix: string;
  label: string;
  color: string;
  start: (
    onValue: (value: T) => void,
    onError: (reason: string) => void,
  ) => Promise<ILocationSubscription>;
  format: (value: T) => string;
}>();

const isOn = ref(false);
const output = ref('not watching');
let subscription: ILocationSubscription | null = null;

onUnmounted(() => subscription?.remove());

function toggle(next: boolean): void {
  if (!next) {
    subscription?.remove();
    subscription = null;
    isOn.value = false;
    return;
  }
  props
    .start(
      value => {
        output.value = props.format(value);
      },
      reason => {
        output.value = `error: ${reason}`;
      },
    )
    .then(sub => {
      subscription = sub;
      isOn.value = true;
    })
    .catch((error: Error) => {
      output.value = `failed: ${error.message}`;
    });
}
</script>

<template>
  <ToggleRow
    :testID="`${prefix}-switch`"
    :label="label"
    :value="isOn"
    :onChange="toggle"
    :color="color"
  />
  <ResultRow :testID="`${prefix}-output`" label="latest" :value="output" />
</template>
