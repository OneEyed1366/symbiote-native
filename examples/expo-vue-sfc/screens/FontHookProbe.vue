<script setup lang="ts">
import { computed } from 'vue';
import { useFonts } from '@symbiote-native/font/vue';
import ResultRow from '../components/ResultRow.vue';

const props = defineProps<{ family: string; uri: string }>();

// The hook loads once per mount, a later change of the map is not reloaded
const fonts = useFonts({ [props.family]: props.uri });

const resultText = computed(
  () =>
    `${fonts.loaded.value}, ${fonts.error.value === null ? 'no error' : fonts.error.value.message}`,
);
</script>

<template>
  <ResultRow testID="font-hook-result" label="useFonts [loaded, error]" :value="resultText" />
</template>
