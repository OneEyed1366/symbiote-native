import { defineComponent, ref } from 'vue';
import { Explorer } from '../components/Scenario';
import { ScreenShell, lineColorOf } from '../components/ScreenShell';
import { ROUTE_NAME } from '../routes';
import { BackgroundCards } from './location-background';
import {
  INITIAL_OPTIONS,
  OneShotCalls,
  OptionsCard,
  PermissionCards,
  PolyfillCard,
  WatchCard,
} from './location-cards';
import type { IOptionsForm, ISetOptions } from './location-cards';

export const LocationScreen = defineComponent(
  () => {
    const options = ref<IOptionsForm>(INITIAL_OPTIONS);
    const setOptions: ISetOptions = patch => {
      options.value = { ...options.value, ...patch };
    };

    return () => (
      <ScreenShell
        route={ROUTE_NAME.Location}
        testID="location-scroll"
        title="Location"
        body="Know where the user is: current position, live tracking, compass heading, geocoding, motion activity, background updates and geofences. The iOS simulator takes a simulated location (Features, Location), the Android emulator uses Extended Controls."
      >
        <PermissionCards />
        <OneShotCalls options={options.value} />
        <WatchCard options={options.value} />
        <Explorer testID="location-explorer" color={lineColorOf(ROUTE_NAME.Location)}>
          <OptionsCard form={options.value} setForm={setOptions} />
          <BackgroundCards options={options.value} />
          <PolyfillCard />
        </Explorer>
      </ScreenShell>
    );
  },
  { name: 'LocationScreen' },
);
