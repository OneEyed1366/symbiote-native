<script lang="ts">
  import {
    getPermissionsAsync,
    presentPermissionsPicker,
    requestPermissionsAsync,
  } from '@symbiote-native/media-library/svelte';
  import type {
    IGranularPermission,
    IMediaLibraryNextPermissionResponse,
  } from '@symbiote-native/media-library/svelte';
  import CallConsole from '../components/CallConsole.svelte';
  import Card from '../components/Card.svelte';
  import ResultRow from '../components/ResultRow.svelte';
  import ToggleRow from '../components/ToggleRow.svelte';
  import { lineColorOf } from '../components/line-color';
  import { ROUTE_NAME } from '../routes';

  const color = lineColorOf(ROUTE_NAME.MediaLibrary);
  const GRANULAR: IGranularPermission[] = ['photo', 'video'];

  let isWriteOnly = $state(false);
  let permission = $state<IMediaLibraryNextPermissionResponse | null>(null);

  const granular = $derived(isWriteOnly ? undefined : GRANULAR);

  // Reloads the status whenever `writeOnly` flips, ignoring a stale answer
  $effect(() => {
    const writeOnly = isWriteOnly;
    const granularPermissions = granular;
    let isStale = false;
    permission = null;
    getPermissionsAsync(writeOnly, granularPermissions).then(response => {
      if (!isStale) {
        permission = response;
      }
    });
    return () => {
      isStale = true;
    };
  });
</script>

<Card testID="media-library-permissions-card" title="Permissions">
  <ToggleRow
    testID="media-library-write-only-switch"
    label="writeOnly"
    value={isWriteOnly}
    onChange={next => {
      isWriteOnly = next;
    }}
    {color}
  />
  <ResultRow
    testID="media-library-permission-hook"
    label="usePermissions"
    value={permission === null
      ? 'loading…'
      : `${permission.status}, access ${permission.accessPrivileges ?? 'n/a'}`}
  />
</Card>
<CallConsole
  prefix="media-library-permission-calls"
  title="Permission calls"
  {color}
  hint="granularPermissions (photo, video) only matter on Android 13+."
  calls={[
    { label: 'getPermissionsAsync', run: () => getPermissionsAsync(isWriteOnly, granular) },
    {
      label: 'requestPermissionsAsync',
      run: () => requestPermissionsAsync(isWriteOnly, granular),
    },
    { label: 'presentPermissionsPicker', run: () => presentPermissionsPicker() },
  ]}
/>
