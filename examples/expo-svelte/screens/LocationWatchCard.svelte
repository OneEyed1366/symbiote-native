<script lang="ts">
  import {
    watchHeadingAsync,
    watchMotionActivityAsync,
    watchPositionAsync,
  } from '@symbiote-native/location/svelte';
  import type { ILocationHeadingObject } from '@symbiote-native/location/svelte';
  import Scenario from '../components/Scenario.svelte';
  import { describeActivity, describePosition, toLocationOptions } from './location-options';
  import type { IOptionsForm } from './location-options';
  import LocationWatchRow from './LocationWatchRow.svelte';

  let { options, color }: { options: IOptionsForm; color: string } = $props();

  function describeHeading(heading: ILocationHeadingObject): string {
    return `true ${heading.trueHeading}, magnetic ${heading.magHeading}, accuracy ${heading.accuracy}`;
  }
</script>

<Scenario
  testID="location-watch-card"
  title="Follow the user as they move"
  why="Drive a live map, record a run or show distance to a destination. Watches push a new value whenever the position, compass heading or motion changes."
  steps={['Turn on watchPositionAsync', 'Move, or change the simulated location', 'Turn on the heading watch and rotate the phone']}
  expect="Each row updates in place with the newest coordinates, heading or activity. Turning the switch off stops the updates."
>
  <LocationWatchRow
    prefix="location-watch-position"
    label="watchPositionAsync"
    {color}
    start={(onValue, onError) => watchPositionAsync(toLocationOptions(options), onValue, onError)}
    format={describePosition}
  />
  <LocationWatchRow
    prefix="location-watch-heading"
    label="watchHeadingAsync"
    {color}
    start={(onValue, onError) => watchHeadingAsync(onValue, onError)}
    format={describeHeading}
  />
  <LocationWatchRow
    prefix="location-watch-motion"
    label="watchMotionActivityAsync (iOS, foreground)"
    {color}
    start={(onValue, onError) => watchMotionActivityAsync(onValue, onError)}
    format={describeActivity}
  />
</Scenario>
