<script lang="ts">
  import {
    clearSharedPayloads,
    getResolvedSharedPayloadsAsync,
    getSharedPayloads,
    useIncomingShare,
  } from '@symbiote-native/sharing/svelte';
  import type { IResolvedSharePayload } from '@symbiote-native/sharing/svelte';
  import ActionButton from '../components/ActionButton.svelte';
  import CallConsole from '../components/CallConsole.svelte';
  import ResultRow from '../components/ResultRow.svelte';
  import Scenario from '../components/Scenario.svelte';
  import { lineColorOf } from '../components/line-color';
  import { ROUTE_NAME } from '../routes';

  const color = lineColorOf(ROUTE_NAME.Sharing);

  const incoming = useIncomingShare();

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
</script>

<Scenario
  testID="sharing-incoming-card"
  title="Receive what other apps share into yours"
  why="Appear in the share sheet so users can send a link, text or image straight into the app. The host app needs a share target (iOS Share Extension, Android intent filter), which this package does not generate."
  steps={[
    'In another app, share some text or an image to this app',
    'Come back to this screen',
  ]}
  expect="The shared payload count goes up and each item is listed with its type and value. Clear empties the list."
>
  <ResultRow testID="sharing-incoming-count" label="sharedPayloads" value={String(incoming.current.sharedPayloads.length)} />
  <ResultRow testID="sharing-incoming-resolving" label="isResolving" value={String(incoming.current.isResolving)} />
  <ResultRow testID="sharing-incoming-error" label="error" value={incoming.current.error?.message ?? 'none'} />
  <ResultRow testID="sharing-incoming-resolved" label="resolvedSharedPayloads" value={String(incoming.current.resolvedSharedPayloads.length)} />
  {#each incoming.current.resolvedSharedPayloads as payload, index (index)}
    {#each rowsOf(payload) as [label, value] (label)}
      <ResultRow testID={`sharing-payload-${index}-${label}`} {label} {value} />
    {/each}
  {/each}
  <ActionButton testID="sharing-incoming-refresh" title="refreshSharePayloads" onPress={() => incoming.current.refreshSharePayloads()} {color} />
  <ActionButton testID="sharing-incoming-clear" title="clearSharedPayloads (hook)" onPress={() => incoming.current.clearSharedPayloads()} {color} />
</Scenario>
<CallConsole
  prefix="sharing-incoming-calls"
  title="Imperative incoming share calls"
  {color}
  calls={[
    { label: 'getSharedPayloads', run: async () => getSharedPayloads() },
    { label: 'getResolvedSharedPayloadsAsync', run: () => getResolvedSharedPayloadsAsync() },
    { label: 'clearSharedPayloads', run: async () => clearSharedPayloads() },
  ]}
/>
