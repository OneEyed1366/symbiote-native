// A screen of Reanimated hooks that is left must give back its nodes and its JS heap
// The Svelte hooks run over the real engine, with the worklets mock in place of the UI runtime

import './reanimated-web-shims';
import './reanimated-weak-cache';
import {
  advance as advanceFrames,
  afterFrame,
  useSteppedFrames,
} from './reanimated-fake-time';
import { readSurfaceTelemetry } from '@symbiote-native/engine';
import { LayoutAnimationType } from 'react-native-reanimated/src/commonTypes';
import { ReanimatedModule } from 'react-native-reanimated/src/ReanimatedModule';
import { WorkletEventHandler } from 'react-native-reanimated/src/WorkletEventHandler';
import { mount, unmount } from '@symbiote-native/svelte';

import {
  describe,
  endLayoutAnimation,
  expect,
  heapInfo,
  it,
  mounted,
  print,
  report,
  useLayoutAnimationsProxy,
} from './harness';
import {
  forgetLayoutConfigs,
  layoutConfigCalls,
} from './reanimated-layout-config-bridge';
import { latestWrite } from './reanimated-update-writes';
import { live, publishedBy } from './svelte-reanimated-handle';
import { collectAll, tick } from './svelte-leak-steps';

import LayoutApp from './svelte-layout-animation-probe.svelte';
import App from './svelte-reanimated-probe.svelte';

const ROOT_TAG = 1;
const VISIT_COUNTS = [50, 400] as const;
// The rows of the layout animation probe screen
const ROW_COUNT = 10;
const LIVE_BYTES_KEY = 'hermes_allocatedBytes';
// About 187 bytes per extra visit of a screen that mounts ten rows of four hooks each
const EXTRA_VISITS_SLACK_BYTES = 65_536;
// The count moves by up to two between readings, one leaked node per extra visit would add 350
const NODE_JITTER_SLACK = 10;
const FRAME_MS = 16;
const SETTLE_STEPS = 2;
const FADED = 0.25;

type ISurface = { commit(): void };
type IReading = { nodes: number; bytes: number };

useSteppedFrames();

// The web handler of upstream registers nothing, so the tag it was asked for is kept here
let listenedTag: number | undefined;
const register = WorkletEventHandler.prototype.registerForEvents;
WorkletEventHandler.prototype.registerForEvents = function (tag, name) {
  listenedTag = tag;
  register.call(this, tag, name);
};

// The example app turns shared transitions on, the web module of upstream answers no
const readFlag = ReanimatedModule.getStaticFeatureFlag.bind(ReanimatedModule);
ReanimatedModule.getStaticFeatureFlag = name =>
  name === 'ENABLE_SHARED_ELEMENT_TRANSITIONS' || readFlag(name);

const startedKinds = new Set<number>();

// Stands in for the UI runtime: each animation the proxy starts is over by the next frame
const startLayoutAnimations = (): void => {
  useLayoutAnimationsProxy(true);
  Reflect.set(globalThis, 'LayoutAnimationsManager', {
    start: (tag: number, type: number) => {
      startedKinds.add(type);
      const isExit = type === LayoutAnimationType.EXITING;
      afterFrame(() => endLayoutAnimation(tag, isExit));
    },
    stop: (): void => undefined,
  });
};

const settle = async (surface: ISurface, steps: number): Promise<void> => {
  if (steps === 0) return;
  await tick();
  advanceFrames(FRAME_MS);
  surface.commit();
  // The pull a platform makes each frame, where the proxy starts and ends layout animations
  mounted();
  await settle(surface, steps - 1);
};

const show = async (surface: ISurface, isShown: boolean): Promise<void> => {
  publishedBy('show')(isShown);
  await settle(surface, SETTLE_STEPS);
};

const reading = (): IReading => {
  collectAll();
  return {
    nodes: readSurfaceTelemetry(ROOT_TAG)?.liveNodes ?? -1,
    bytes: heapInfo()[LIVE_BYTES_KEY] ?? -1,
  };
};

const visits = async (surface: ISurface, count: number): Promise<void> => {
  if (count === 0) return;
  await show(surface, true);
  await show(surface, false);
  // The bridge stands in for the native config store, so what it was handed goes with the visit
  forgetLayoutConfigs();
  await visits(surface, count - 1);
};

const growth = async (
  count: number,
  Screen: typeof App = App,
): Promise<IReading> => {
  const surface = mount(ROOT_TAG, Screen);
  await settle(surface, SETTLE_STEPS);
  await visits(surface, 2);
  const base = reading();
  await visits(surface, count);
  const end = reading();
  unmount(ROOT_TAG);
  return { nodes: end.nodes - base.nodes, bytes: end.bytes - base.bytes };
};

describe('a Svelte screen of Reanimated hooks, visited many times', () => {
  // Without this a hook that binds nothing would pass the retention case below
  it('runs the mappers of an attached view when a shared value changes', async () => {
    const surface = mount(ROOT_TAG, App);
    await show(surface, true);
    publishedBy('fadeFirstRow')(FADED);
    await settle(surface, SETTLE_STEPS);
    const { views, props } = latestWrite;
    unmount(ROOT_TAG);
    print(`reanimated last write: ${views} views, ${JSON.stringify(props)}`);
    expect(views).toBeGreaterThan(0);
    expect(props.opacity).toBe(FADED);
    expect(props.accessibilityLabel).toBe(String(FADED / 2));
  });

  it('keeps the frame, reaction and repeat hooks working only while shown', async () => {
    const surface = mount(ROOT_TAG, App);
    await show(surface, true);
    const first = { ...live };
    await settle(surface, SETTLE_STEPS);
    const shown = { ...live };
    const refTag = live.tagOfRef?.();
    print(`reanimated ref tag while shown: ${refTag}`);
    expect(typeof refTag).toBe('number');
    await show(surface, false);
    const left = { ...live };
    await settle(surface, SETTLE_STEPS);
    const later = { ...live };
    unmount(ROOT_TAG);
    print(
      `reanimated live: shown ${JSON.stringify(first)} then ${JSON.stringify(shown)}, left ${JSON.stringify(left)} then ${JSON.stringify(later)}`,
    );
    expect(shown.frames).toBeGreaterThan(first.frames);
    expect(shown.reactions).toBeGreaterThan(first.reactions);
    expect(later.frames).toBe(left.frames);
    expect(later.reactions).toBe(left.reactions);
    expect(listenedTag).toBe(refTag);
  });

  it('keeps no more nodes or live bytes after more visits', async () => {
    const [fewVisits, manyVisits] = VISIT_COUNTS;
    // Thrown away: the first run of the process pays the warmup, whatever its size
    await growth(2);
    const few = await growth(fewVisits);
    const many = await growth(manyVisits);
    print(
      `reanimated growth after ${fewVisits}/${manyVisits} visits: nodes ${few.nodes}/${many.nodes}, bytes ${few.bytes}/${many.bytes}`,
    );
    expect(many.nodes).toBeLessThan(few.nodes + NODE_JITTER_SLACK);
    expect(many.bytes).toBeLessThan(few.bytes + EXTRA_VISITS_SLACK_BYTES);
  });
});

describe('a Svelte screen of layout animations, visited many times', () => {
  // Without this a screen that registers no animation would pass the retention case below
  it('configures every kind of animation and ends the exits', async () => {
    startLayoutAnimations();
    const surface = mount(ROOT_TAG, LayoutApp);
    await show(surface, true);
    const kinds = new Set(layoutConfigCalls.map(call => call.type));
    const enteringCalls = layoutConfigCalls.filter(
      call => call.type === LayoutAnimationType.ENTERING,
    ).length;
    await show(surface, false);
    unmount(ROOT_TAG);
    useLayoutAnimationsProxy(false);
    print(`layout kinds ${[...kinds]}, started ${[...startedKinds]}`);
    expect(kinds.has(LayoutAnimationType.ENTERING)).toBe(true);
    expect(kinds.has(LayoutAnimationType.EXITING)).toBe(true);
    expect(kinds.has(LayoutAnimationType.LAYOUT)).toBe(true);
    expect(
      kinds.has(LayoutAnimationType.SHARED_ELEMENT_TRANSITION_NATIVE_ID),
    ).toBe(true);
    expect(startedKinds.has(LayoutAnimationType.EXITING)).toBe(true);
    // The proxy starts an entering animation only if it had the config when the view mounted
    expect(startedKinds.has(LayoutAnimationType.ENTERING)).toBe(true);
    // One call for each row, and none for the view whose scope skips entering
    expect(enteringCalls).toBe(ROW_COUNT);
  });

  it('keeps no more nodes or live bytes after more visits', async () => {
    const [fewVisits, manyVisits] = VISIT_COUNTS;
    startLayoutAnimations();
    await growth(2, LayoutApp);
    const few = await growth(fewVisits, LayoutApp);
    const many = await growth(manyVisits, LayoutApp);
    useLayoutAnimationsProxy(false);
    print(
      `layout growth after ${fewVisits}/${manyVisits} visits: nodes ${few.nodes}/${many.nodes}, bytes ${few.bytes}/${many.bytes}`,
    );
    expect(many.nodes).toBeLessThan(few.nodes + NODE_JITTER_SLACK);
    expect(many.bytes).toBeLessThan(few.bytes + EXTRA_VISITS_SLACK_BYTES);
  });
});

report();
