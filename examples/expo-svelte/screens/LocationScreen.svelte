<script lang="ts">
  import {
    getCurrentWatchId,
    installWebGeolocationPolyfill,
  } from '@symbiote-native/location/svelte';
  import CallConsole from '../components/CallConsole.svelte';
  import Explorer from '../components/Explorer.svelte';
  import ScreenShell from '../components/ScreenShell.svelte';
  import { lineColorOf } from '../components/line-color';
  import { ROUTE_NAME } from '../routes';
  import LocationBackground from './LocationBackground.svelte';
  import LocationOneShot from './LocationOneShot.svelte';
  import LocationOptionsCard from './LocationOptionsCard.svelte';
  import LocationPermissions from './LocationPermissions.svelte';
  import LocationWatchCard from './LocationWatchCard.svelte';
  import { INITIAL_OPTIONS } from './location-options';
  import type { IOptionsForm } from './location-options';

  const ROUTE = ROUTE_NAME.Location;
  const color = lineColorOf(ROUTE);

  let options = $state<IOptionsForm>({ ...INITIAL_OPTIONS });

  function setOptions(patch: Partial<IOptionsForm>): void {
    Object.assign(options, patch);
  }
</script>

<ScreenShell
  route={ROUTE}
  testID="location-scroll"
  title="Location"
  body="Know where the user is: current position, live tracking, compass heading, geocoding, motion activity, background updates and geofences. The iOS simulator takes a simulated location (Features, Location), the Android emulator uses Extended Controls."
>
  <LocationPermissions />
  <LocationOneShot {options} {color} />
  <LocationWatchCard {options} {color} />
  <Explorer testID="location-explorer" {color}>
    <LocationOptionsCard form={options} setForm={setOptions} {color} />
    <LocationBackground {options} />
    <CallConsole
      prefix="location-polyfill"
      title="Web geolocation polyfill"
      {color}
      calls={[
        { label: 'installWebGeolocationPolyfill', run: async () => installWebGeolocationPolyfill() },
        { label: 'getCurrentWatchId', run: async () => getCurrentWatchId() },
      ]}
    />
  </Explorer>
</ScreenShell>
