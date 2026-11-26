// A popped screen of the real `Stack` must leave both the C++ tree and the JS heap
// The round trips go through the navigator handle, as an app does

import { readSurfaceTelemetry } from '@symbiote-native/engine';
import { mount, unmount } from '@symbiote-native/svelte';

import { describe, expect, heapInfo, it, print, report } from './harness';
import { stackActions } from './svelte-stack-handle';
import { advance, collectAll } from './svelte-leak-steps';

import App from './svelte-stack-probe.svelte';

const ROOT_TAG = 1;
const TRIP_COUNTS = [100, 800] as const;
const LIVE_BYTES_KEY = 'hermes_allocatedBytes';
// About 93 bytes per extra trip: retaining even the 30 row array of a screen crosses it
const EXTRA_TRIPS_SLACK_BYTES = 65_536;
// The count moves by up to two between readings, one leaked node per extra trip would add 700
const NODE_JITTER_SLACK = 10;
// The detail screen has 30 rows of three nodes each, so a pushed one adds at least that
const DETAIL_ROW_NODES = 90;
const SCREEN_STEPS = 2;

type ISurface = { commit(): void };
type IReading = { nodes: number; bytes: number };

const liveNodes = (): number => readSurfaceTelemetry(ROOT_TAG)?.liveNodes ?? -1;

const reading = (): IReading => {
  collectAll();
  return {
    nodes: liveNodes(),
    bytes: heapInfo()[LIVE_BYTES_KEY] ?? -1,
  };
};

const push = async (surface: ISurface): Promise<void> => {
  stackActions().push('detail');
  await advance(surface, SCREEN_STEPS);
};

const pop = async (surface: ISurface): Promise<void> => {
  stackActions().pop();
  await advance(surface, SCREEN_STEPS);
};

const trips = async (surface: ISurface, count: number): Promise<void> => {
  if (count === 0) return;
  await push(surface);
  await pop(surface);
  await trips(surface, count - 1);
};

// The first trips allocate caches once, so the base is read after two of them
const growth = async (count: number): Promise<IReading> => {
  const surface = mount(ROOT_TAG, App);
  await advance(surface, SCREEN_STEPS);
  await trips(surface, 2);
  const base = reading();
  await trips(surface, count);
  const end = reading();
  unmount(ROOT_TAG);
  return { nodes: end.nodes - base.nodes, bytes: end.bytes - base.bytes };
};

describe('the real Svelte Stack after many push and pop round trips', () => {
  // Without this a handle that pushes nothing would pass the retention case below
  it('puts a whole screen into the tree on push', async () => {
    const surface = mount(ROOT_TAG, App);
    await advance(surface, SCREEN_STEPS);
    const alone = reading().nodes;
    await push(surface);
    const pushed = reading().nodes;
    unmount(ROOT_TAG);
    print(`stack nodes: home alone ${alone}, with detail pushed ${pushed}`);
    expect(pushed - alone).toBeGreaterThan(DETAIL_ROW_NODES);
  });

  it('keeps no more nodes or live bytes after more round trips', async () => {
    const [fewTrips, manyTrips] = TRIP_COUNTS;
    // Thrown away: the first run of the process pays about 38 KB of warmup, whatever its size
    await growth(2);
    const few = await growth(fewTrips);
    const many = await growth(manyTrips);
    print(
      `stack growth after ${fewTrips}/${manyTrips} trips: nodes ${few.nodes}/${many.nodes}, bytes ${few.bytes}/${many.bytes}`,
    );
    expect(many.nodes).toBeLessThan(few.nodes + NODE_JITTER_SLACK);
    expect(many.bytes).toBeLessThan(few.bytes + EXTRA_TRIPS_SLACK_BYTES);
  });
});

report();
