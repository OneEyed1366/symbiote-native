<script lang="ts">
  import {
    enableNetworkProviderAsync,
    getBackgroundPermissionsAsync,
    getForegroundPermissionsAsync,
    getMotionActivityPermissionsAsync,
    getProviderStatusAsync,
    hasServicesEnabledAsync,
    requestBackgroundPermissionsAsync,
    requestForegroundPermissionsAsync,
    requestMotionActivityPermissionsAsync,
    useBackgroundPermissions,
    useForegroundPermissions,
    useMotionActivityPermissions,
  } from '@symbiote-native/location/svelte';
  import CallConsole from '../components/CallConsole.svelte';
  import Card from '../components/Card.svelte';
  import ResultRow from '../components/ResultRow.svelte';
  import { lineColorOf } from '../components/line-color';
  import { ROUTE_NAME } from '../routes';

  const color = lineColorOf(ROUTE_NAME.Location);

  const foreground = useForegroundPermissions();
  const background = useBackgroundPermissions();
  const motion = useMotionActivityPermissions();

  function permissionLabel(response: { status: string; granted: boolean } | null): string {
    return response === null ? 'loading…' : `${response.status}, granted ${response.granted}`;
  }
</script>

<Card testID="location-permissions-card" title="Permission hooks">
  <ResultRow
    testID="location-foreground-row"
    label="useForegroundPermissions"
    value={permissionLabel(foreground.status)}
  />
  <ResultRow
    testID="location-background-row"
    label="useBackgroundPermissions"
    value={permissionLabel(background.status)}
  />
  <ResultRow
    testID="location-motion-row"
    label="useMotionActivityPermissions"
    value={permissionLabel(motion.status)}
  />
</Card>
<CallConsole
  prefix="location-permission-calls"
  title="Permission calls"
  {color}
  hint="Background permission needs the foreground one first, a rejection there can be expected on a simulator."
  calls={[
    { label: 'getForegroundPermissionsAsync', run: () => getForegroundPermissionsAsync() },
    {
      label: 'requestForegroundPermissionsAsync',
      run: () => requestForegroundPermissionsAsync(),
    },
    { label: 'getBackgroundPermissionsAsync', run: () => getBackgroundPermissionsAsync() },
    {
      label: 'requestBackgroundPermissionsAsync',
      run: () => requestBackgroundPermissionsAsync(),
    },
    {
      label: 'getMotionActivityPermissionsAsync',
      run: () => getMotionActivityPermissionsAsync(),
    },
    {
      label: 'requestMotionActivityPermissionsAsync',
      run: () => requestMotionActivityPermissionsAsync(),
    },
    { label: 'hasServicesEnabledAsync', run: () => hasServicesEnabledAsync() },
    { label: 'getProviderStatusAsync', run: () => getProviderStatusAsync() },
    { label: 'enableNetworkProviderAsync (Android)', run: () => enableNetworkProviderAsync() },
  ]}
/>
