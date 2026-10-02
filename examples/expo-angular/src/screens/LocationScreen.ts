import { Component, signal } from '@angular/core';
import {
  getCurrentWatchId,
  installWebGeolocationPolyfill,
} from '@symbiote-native/location/angular';
import { CallConsole } from '../components/CallConsole';
import { Explorer } from '../components/Explorer';
import { ScreenShell } from '../components/ScreenShell';
import { lineColorOf } from '../components/line-color';
import { ROUTE_NAME } from '../routes';
import { LocationBackground } from './LocationBackground';
import { LocationOneShot } from './LocationOneShot';
import { LocationOptionsCard } from './LocationOptionsCard';
import { LocationPermissions } from './LocationPermissions';
import { LocationWatchCard } from './LocationWatchCard';
import { INITIAL_OPTIONS } from './location-options';
import type { IOptionsForm } from './location-options';

@Component({
  selector: 'LocationScreen',
  standalone: true,
  imports: [
    CallConsole,
    Explorer,
    LocationBackground,
    LocationOneShot,
    LocationOptionsCard,
    LocationPermissions,
    LocationWatchCard,
    ScreenShell,
  ],
  template: `
    <ScreenShell
      [route]="route"
      testID="location-scroll"
      title="Location"
      body="Know where the user is: current position, live tracking, compass heading, geocoding, motion activity, background updates and geofences. The iOS simulator takes a simulated location (Features, Location), the Android emulator uses Extended Controls."
    >
      <LocationPermissions />
      <LocationOneShot [options]="options()" [color]="color" />
      <LocationWatchCard [options]="options()" [color]="color" />
      <Explorer testID="location-explorer" [color]="color">
        <ng-template>
          <LocationOptionsCard [(form)]="options" [color]="color" />
          <LocationBackground [options]="options()" />
          <CallConsole
            prefix="location-polyfill"
            title="Web geolocation polyfill"
            [color]="color"
            [calls]="polyfillCalls"
          />
        </ng-template>
      </Explorer>
    </ScreenShell>
  `,
})
export class LocationScreen {
  readonly route = ROUTE_NAME.Location;
  readonly color = lineColorOf(ROUTE_NAME.Location);
  readonly options = signal<IOptionsForm>({ ...INITIAL_OPTIONS });

  readonly polyfillCalls = [
    {
      label: 'installWebGeolocationPolyfill',
      run: async () => installWebGeolocationPolyfill(),
    },
    { label: 'getCurrentWatchId', run: async () => getCurrentWatchId() },
  ];
}
