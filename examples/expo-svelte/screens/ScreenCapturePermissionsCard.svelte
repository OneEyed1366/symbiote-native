<script lang="ts">
  import {
    getPermissionsAsync,
    requestPermissionsAsync,
    usePermissions,
  } from '@symbiote-native/screen-capture/svelte';
  import type { PermissionResponse } from '@symbiote-native/screen-capture/svelte';
  import ActionButton from '../components/ActionButton.svelte';
  import Card from '../components/Card.svelte';
  import ResultRow from '../components/ResultRow.svelte';
  import { lineColorOf } from '../components/line-color';
  import { ROUTE_NAME } from '../routes';

  const color = lineColorOf(ROUTE_NAME.ScreenCapture);

  const permissions = usePermissions();
  let direct = $state('not called');

  function describePermission(response: PermissionResponse | null): string {
    return response === null
      ? 'loading…'
      : `${response.status}, granted ${response.granted}, canAskAgain ${response.canAskAgain}`;
  }

  function run(call: () => Promise<PermissionResponse>): void {
    call()
      .then(response => {
        direct = describePermission(response);
      })
      .catch((failure: Error) => {
        direct = `failed: ${failure.message}`;
      });
  }
</script>

<Card testID="screen-capture-permissions-card" title="Permissions">
  <ResultRow
    testID="screen-capture-permission-hook"
    label="usePermissions state"
    value={permissions.error === null
      ? describePermission(permissions.status)
      : permissions.error.message}
  />
  <ActionButton
    testID="screen-capture-hook-request"
    title="hook request()"
    onPress={() => permissions.request()}
    {color}
  />
  <ActionButton
    testID="screen-capture-hook-get"
    title="hook get()"
    onPress={() => permissions.get()}
    {color}
  />
  <ActionButton
    testID="screen-capture-get-button"
    title="getPermissionsAsync"
    onPress={() => run(getPermissionsAsync)}
    {color}
  />
  <ActionButton
    testID="screen-capture-request-button"
    title="requestPermissionsAsync"
    onPress={() => run(requestPermissionsAsync)}
    {color}
  />
  <ResultRow testID="screen-capture-direct" label="direct call" value={direct} />
</Card>
