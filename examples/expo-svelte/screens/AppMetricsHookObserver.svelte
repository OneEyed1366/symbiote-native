<script lang="ts">
  import { useNetworkRequestObserver } from '@symbiote-native/app-metrics/svelte';
  import {
    describeCompleted,
    describeStarted,
    splitList,
  } from './app-metrics-network';

  let {
    hosts,
    methods,
    onLine,
  }: { hosts: string; methods: string; onLine: (line: string) => void } = $props();

  useNetworkRequestObserver(() => ({
    filter: { hosts: splitList(hosts), methods: splitList(methods) },
    onStarted: event => onLine(describeStarted(event)),
    onCompleted: event => onLine(describeCompleted(event)),
  }));
</script>
