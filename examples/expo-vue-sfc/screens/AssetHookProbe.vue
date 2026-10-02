<script setup lang="ts">
import { computed } from 'vue';
import { useAssets } from '@symbiote-native/asset/vue';
import ResultRow from '../components/ResultRow.vue';

const BUNDLED_MODULE = require('../assets/bootsplash-logo.svg');

const loaded = useAssets(BUNDLED_MODULE);

const resultText = computed(() =>
  loaded.error.value === undefined
    ? `${loaded.assets.value?.length ?? 0} loaded, downloaded ${String(loaded.assets.value?.[0]?.downloaded)}`
    : loaded.error.value.message,
);
</script>

<template>
  <ResultRow testID="asset-hook-result" label="useAssets [assets, error]" :value="resultText" />
</template>
