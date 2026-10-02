import { Component, input, signal } from '@angular/core';
import {
  geocodeAsync,
  getCurrentPositionAsync,
  getHeadingAsync,
  getLastKnownPositionAsync,
  getMotionActivityAsync,
  reverseGeocodeAsync,
} from '@symbiote-native/location/angular';
import type { ILocationObject } from '@symbiote-native/location/angular';
import { CallConsole } from '../components/CallConsole';
import { Field } from '../components/Field';
import { Scenario } from '../components/Scenario';
import {
  describeActivity,
  describePosition,
  optionalNumber,
  toLocationOptions,
} from './location-options';
import type { IOptionsForm } from './location-options';

@Component({
  selector: 'LocationOneShot',
  standalone: true,
  imports: [CallConsole, Field, Scenario],
  template: `
    <Scenario
      testID="location-geocode-card"
      title="Find where the user is right now, and turn it into an address"
      why="Show nearby stores, prefill a delivery address or tag a photo. One call gives the current coordinates, and reverse geocoding turns them into a street address."
      [steps]="steps"
      expect="The first call prints latitude, longitude and accuracy. Reverse geocoding prints the matching street address, and geocodeAsync prints coordinates for the typed address."
    >
      <Field
        testID="location-address-input"
        label="address for geocodeAsync"
        [(value)]="address"
      />
      <CallConsole
        isBare
        prefix="location-one-shot"
        title="One-shot calls"
        [color]="color()"
        hint="The simulator has no GPS, set a simulated location (iOS: Features, Location; Android: Extended Controls)."
        [calls]="calls"
      />
    </Scenario>
  `,
})
export class LocationOneShot {
  readonly options = input.required<IOptionsForm>();
  readonly color = input.required<string>();
  readonly steps = [
    'Allow location in the permission card above',
    'Press getCurrentPositionAsync (set a simulated location on a simulator)',
    'Press reverseGeocodeAsync, then try geocodeAsync with an address',
  ];

  readonly address = signal('221B Baker Street, London');
  private last: ILocationObject | null = null;

  readonly calls = [
    {
      label: 'getCurrentPositionAsync',
      run: async () => {
        const position = await getCurrentPositionAsync(
          toLocationOptions(this.options()),
        );
        this.last = position;
        return describePosition(position);
      },
    },
    {
      label: 'getLastKnownPositionAsync',
      run: async () => {
        const position = await getLastKnownPositionAsync({
          maxAge: optionalNumber(this.options().maxAge),
          requiredAccuracy: optionalNumber(this.options().requiredAccuracy),
        });
        return position && describePosition(position);
      },
    },
    { label: 'getHeadingAsync', run: () => getHeadingAsync() },
    {
      label: 'getMotionActivityAsync (iOS)',
      run: async () => describeActivity(await getMotionActivityAsync()),
    },
    { label: 'geocodeAsync', run: () => geocodeAsync(this.address()) },
    {
      label: 'reverseGeocodeAsync (last position)',
      run: async () => {
        if (this.last === null) {
          throw new Error('get a position first');
        }
        return reverseGeocodeAsync(this.last.coords);
      },
    },
  ];
}
