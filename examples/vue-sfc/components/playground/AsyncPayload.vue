<!--
  A genuinely async setup() component (top-level await) — the exact shape <Suspense> (SuspenseDemo.vue)
  exists to coordinate. Simulates a network round trip with a timeout instead of a real fetch,
  purely so this stays a self-contained, offline demo.
-->
<script setup lang="ts">
import { View, Text } from '@symbiote-native/vue';

const LOAD_DELAY_MS = 900;

async function loadPayload(): Promise<{ fetchedAt: number }> {
  await new Promise<void>(resolve => setTimeout(resolve, LOAD_DELAY_MS));
  return { fetchedAt: Date.now() };
}

const payload = await loadPayload();
</script>

<template>
  <View class="a11y-card">
    <Text class="switch-label" testID="suspense-resolved"
      >async payload resolved</Text
    >
    <Text class="note-text">{{ `fetched at ${payload.fetchedAt}` }}</Text>
  </View>
</template>
