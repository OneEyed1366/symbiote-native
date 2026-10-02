<script setup lang="ts">
import { useNetworkRequestObserver } from '@symbiote-native/app-metrics/vue';
import { describeCompleted, describeStarted, splitList } from './app-metrics-network';

const props = defineProps<{ hosts: string; methods: string; onLine: (line: string) => void }>();

useNetworkRequestObserver(() => ({
  filter: { hosts: splitList(props.hosts), methods: splitList(props.methods) },
  onStarted: event => props.onLine(describeStarted(event)),
  onCompleted: event => props.onLine(describeCompleted(event)),
}));
</script>

<template>
  <view />
</template>
