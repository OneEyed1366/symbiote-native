// Svelte `useVideoPlayer` through the real compiler over the shared player controller

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, unmount } from '@symbiote-native/svelte/native-view-bridge';
import { installRecordingFabric } from '@symbiote-native/test-utils';
import {
  createSvelteHarness,
  loadComponent,
} from './svelte-compile.test-helper';

const players = vi.hoisted(() => ({
  createVideoPlayer: vi.fn((source: unknown) => ({
    source,
    release: vi.fn(),
  })),
}));

vi.mock('../core/video-player', () => players);
vi.mock('../core/video-source', () => ({
  parseSource: (source: unknown) =>
    typeof source === 'string' ? { uri: source } : source,
}));

if (globalThis.window === undefined)
  Object.assign(globalThis, { window: globalThis });
if (globalThis.navigator === undefined) {
  Object.assign(globalThis, { navigator: { product: 'ReactNative' } });
}

const ROOT_TAG = 91_943;
const fabric = installRecordingFabric();
const tick = (): Promise<void> =>
  new Promise(resolve => setTimeout(resolve, 0));

let harness = createSvelteHarness('video-player');

beforeEach(() => {
  fabric.reset();
  vi.clearAllMocks();
  harness = createSvelteHarness('video-player');
});

afterEach(() => {
  unmount(ROOT_TAG);
  harness.cleanup();
});

const PROBE_APP = `<script lang="ts">
   import { useVideoPlayer } from './use-video-player.svelte';
   let source = $state('a.mp4');
   const setup = globalThis.__setup;
   const player = useVideoPlayer(() => source, setup);
   Object.assign(globalThis, {
     __player: () => player.current,
     __setSource: (value) => { source = value; },
   });
 </script>`;

async function mountProbe(name: string, setup = vi.fn()): Promise<void> {
  Reflect.set(globalThis, '__setup', setup);
  const app = harness.compileSource(__dirname, name, PROBE_APP);
  mount(ROOT_TAG, await loadComponent(app));
  await tick();
  await tick();
}

function readGlobal(name: string): (...args: unknown[]) => unknown {
  const value: unknown = Reflect.get(globalThis, name);
  if (typeof value !== 'function') throw new Error(`${name} was not set`);
  return (...args) => value(...args);
}

describe('useVideoPlayer', () => {
  it('creates the player from the parsed source and runs the setup on it', async () => {
    const setup = vi.fn();
    await mountProbe('create-app', setup);

    expect(players.createVideoPlayer).toHaveBeenCalledWith(
      { uri: 'a.mp4' },
      undefined,
    );
    expect(setup).toHaveBeenCalledWith(readGlobal('__player')());
  });

  it('replaces the player when the source changes and releases the old one', async () => {
    await mountProbe('replace-app');
    const first = readGlobal('__player')();

    readGlobal('__setSource')('b.mp4');
    await tick();
    await tick();

    expect(readGlobal('__player')()).not.toBe(first);
    expect(Reflect.get(Object(first), 'release')).toHaveBeenCalledTimes(1);
  });
});
