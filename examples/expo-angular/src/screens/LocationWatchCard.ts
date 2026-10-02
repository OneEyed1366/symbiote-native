import { Component, input } from '@angular/core';
import {
  watchHeadingAsync,
  watchMotionActivityAsync,
  watchPositionAsync,
} from '@symbiote-native/location/angular';
import type { ILocationHeadingObject } from '@symbiote-native/location/angular';
import { Scenario } from '../components/Scenario';
import {
  describeActivity,
  describePosition,
  toLocationOptions,
} from './location-options';
import type { IOptionsForm } from './location-options';
import { LocationWatchRow } from './LocationWatchRow';

function describeHeading(heading: ILocationHeadingObject): string {
  return `true ${heading.trueHeading}, magnetic ${heading.magHeading}, accuracy ${heading.accuracy}`;
}

@Component({
  selector: 'LocationWatchCard',
  standalone: true,
  imports: [LocationWatchRow, Scenario],
  template: `
    <Scenario
      testID="location-watch-card"
      title="Follow the user as they move"
      why="Drive a live map, record a run or show distance to a destination. Watches push a new value whenever the position, compass heading or motion changes."
      [steps]="steps"
      expect="Each row updates in place with the newest coordinates, heading or activity. Turning the switch off stops the updates."
    >
      <LocationWatchRow
        prefix="location-watch-position"
        label="watchPositionAsync"
        [color]="color()"
        [start]="startPosition"
        [format]="describePosition"
      />
      <LocationWatchRow
        prefix="location-watch-heading"
        label="watchHeadingAsync"
        [color]="color()"
        [start]="startHeading"
        [format]="describeHeading"
      />
      <LocationWatchRow
        prefix="location-watch-motion"
        label="watchMotionActivityAsync (iOS, foreground)"
        [color]="color()"
        [start]="startMotion"
        [format]="describeActivity"
      />
    </Scenario>
  `,
})
export class LocationWatchCard {
  readonly options = input.required<IOptionsForm>();
  readonly color = input.required<string>();
  readonly describePosition = describePosition;
  readonly describeHeading = describeHeading;
  readonly describeActivity = describeActivity;
  readonly steps = [
    'Turn on watchPositionAsync',
    'Move, or change the simulated location',
    'Turn on the heading watch and rotate the phone',
  ];

  readonly startPosition = (
    onValue: Parameters<typeof watchPositionAsync>[1],
    onError: Parameters<typeof watchPositionAsync>[2],
  ) => watchPositionAsync(toLocationOptions(this.options()), onValue, onError);
  readonly startHeading = (
    onValue: Parameters<typeof watchHeadingAsync>[0],
    onError: Parameters<typeof watchHeadingAsync>[1],
  ) => watchHeadingAsync(onValue, onError);
  readonly startMotion = (
    onValue: Parameters<typeof watchMotionActivityAsync>[0],
    onError: Parameters<typeof watchMotionActivityAsync>[1],
  ) => watchMotionActivityAsync(onValue, onError);
}
