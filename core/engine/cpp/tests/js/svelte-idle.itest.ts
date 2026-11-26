// A mounted menu that nobody touches must not write props, create nodes or grow its tree

import {
  readCommitProfile,
  readSurfaceTelemetry,
} from '@symbiote-native/engine';
import { mount, unmount } from '@symbiote-native/svelte';

import {
  collectGarbage,
  describe,
  expect,
  flushTimers,
  it,
  print,
  report,
} from './harness';

// esbuild resolves this through the `.svelte` loader in `scripts/run-itests.mjs`
import IdleMenu from './svelte-idle-probe.svelte';

const ROOT_TAG = 1;
const IDLE_TICKS = 300;
const COLLECTIONS = 8;

const tick = (): Promise<void> =>
  new Promise(resolve => {
    setTimeout(resolve, 0);
    flushTimers();
  });

// A commit per tick, as the host would flush, so a write made at idle would show up as a commit
const idle = async (
  surface: { commit(): void },
  ticks: number,
): Promise<void> => {
  if (ticks === 0) return;
  await tick();
  surface.commit();
  await idle(surface, ticks - 1);
};

const liveNodes = (): number => {
  for (let pass = 0; pass < COLLECTIONS; pass += 1) collectGarbage();
  return readSurfaceTelemetry(ROOT_TAG)?.liveNodes ?? -1;
};

describe('the Svelte adapter on the real engine, idle', () => {
  it('writes no props and keeps its tree while a mounted menu is left alone', async () => {
    const surface = mount(ROOT_TAG, IdleMenu, { count: 4 });
    await idle(surface, 5);
    readCommitProfile();
    const before = liveNodes();

    await idle(surface, IDLE_TICKS);

    const profile = readCommitProfile();
    const after = liveNodes();
    print(
      `idle x${IDLE_TICKS}: live ${before} -> ${after}, commits ${profile.commits}, writes ${profile.propWrites}, created ${profile.nodesCreated}`,
    );
    unmount(ROOT_TAG);

    expect(profile.propWrites).toBe(0);
    expect(profile.nodesCreated).toBe(0);
    expect(after).toBe(before);
  });
});

report();
