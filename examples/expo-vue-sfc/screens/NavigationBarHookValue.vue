<script setup lang="ts">
import { computed } from 'vue';
import { useVisibility } from '@symbiote-native/navigation-bar/vue';
import ResultRow from '../components/ResultRow.vue';

const visibility = useVisibility();
const visibilityText = computed(() => visibility.value ?? 'loading…');
</script>

<template>
  <ResultRow testID="navigation-bar-hook" label="useVisibility" :value="visibilityText" />
</template>
