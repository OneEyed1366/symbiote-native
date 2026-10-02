import { useState } from 'react';
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

export function LocationScreen() {
  const [options, setOptionsState] = useState<IOptionsForm>(INITIAL_OPTIONS);
  const setOptions: ISetOptions = patch =>
    setOptionsState(previous => ({ ...previous, ...patch }));

  return (
    <ScreenShell
      route={ROUTE_NAME.Location}
      testID="location-scroll"
      title="Location"
      body="Know where the user is: current position, live tracking, compass heading, geocoding, motion activity, background updates and geofences. The iOS simulator takes a simulated location (Features, Location), the Android emulator uses Extended Controls."
    >
      <PermissionCards />
      <OneShotCalls options={options} />
      <WatchCard options={options} />
      <Explorer testID="location-explorer" color={lineColorOf(ROUTE_NAME.Location)}>
        <OptionsCard form={options} setForm={setOptions} />
        <BackgroundCards options={options} />
        <PolyfillCard />
      </Explorer>
    </ScreenShell>
  );
}
