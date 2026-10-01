<script setup lang="ts">
import { computed } from 'vue';
import {
  clearSharedPayloads,
  getResolvedSharedPayloadsAsync,
  getSharedPayloads,
  useIncomingShare,
} from '@symbiote-native/sharing/vue';
import type { IResolvedSharePayload } from '@symbiote-native/sharing/vue';
import ActionButton from '../components/ActionButton.vue';
import CallConsole from '../components/CallConsole.vue';
import ResultRow from '../components/ResultRow.vue';
import Scenario from '../components/Scenario.vue';
import { lineColorOf } from '../components/line-color';
import { ROUTE_NAME } from '../routes';

const color = lineColorOf(ROUTE_NAME.Sharing);

const incomingRef = useIncomingShare();
const incoming = computed(() => incomingRef.value);

function rowsOf(payload: IResolvedSharePayload): [string, string][] {
  return [
    ['shareType', payload.shareType],
    ['value', payload.value],
    ['contentUri', String(payload.contentUri)],
    ['contentType', String(payload.contentType)],
    ['contentMimeType', String(payload.contentMimeType)],
    ['originalName', String(payload.originalName)],
    ['contentSize', String(payload.contentSize)],
  ];
}

const calls = [
  { label: 'getSharedPayloads', run: async () => getSharedPayloads() },
  { label: 'getResolvedSharedPayloadsAsync', run: () => getResolvedSharedPayloadsAsync() },
  { label: 'clearSharedPayloads', run: async () => clearSharedPayloads() },
];
</script>

<template>
  <Scenario
    testID="sharing-incoming-card"
    title="Receive what other apps share into yours"
    why="Appear in the share sheet so users can send a link, text or image straight into the app. The host app needs a share target (iOS Share Extension, Android intent filter), which this package does not generate."
    :steps="[
      'In another app, share some text or an image to this app',
      'Come back to this screen',
    ]"
    expect="The shared payload count goes up and each item is listed with its type and value. Clear empties the list."
  >
    <ResultRow
      testID="sharing-incoming-count"
      label="sharedPayloads"
      :value="String(incoming.sharedPayloads.length)"
    />
    <ResultRow
      testID="sharing-incoming-resolving"
      label="isResolving"
      :value="String(incoming.isResolving)"
    />
    <ResultRow
      testID="sharing-incoming-error"
      label="error"
      :value="incoming.error?.message ?? 'none'"
    />
    <ResultRow
      testID="sharing-incoming-resolved"
      label="resolvedSharedPayloads"
      :value="String(incoming.resolvedSharedPayloads.length)"
    />
    <template v-for="(payload, index) in incoming.resolvedSharedPayloads" :key="index">
      <ResultRow
        v-for="[label, value] in rowsOf(payload)"
        :key="label"
        :testID="`sharing-payload-${index}-${label}`"
        :label="label"
        :value="value"
      />
    </template>
    <ActionButton
      testID="sharing-incoming-refresh"
      title="refreshSharePayloads"
      :onPress="() => incoming.refreshSharePayloads()"
      :color="color"
    />
    <ActionButton
      testID="sharing-incoming-clear"
      title="clearSharedPayloads (hook)"
      :onPress="() => incoming.clearSharedPayloads()"
      :color="color"
    />
  </Scenario>
  <CallConsole
    prefix="sharing-incoming-calls"
    title="Imperative incoming share calls"
    :color="color"
    :calls="calls"
  />
</template>
