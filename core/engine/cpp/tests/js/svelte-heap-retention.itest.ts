// The JS heap after many screen swaps and a full clean-up, which `liveNodes` cannot see
// Adapter closures and per-node maps would show as live bytes that grow with the swap count

import { mount, unmount } from '@symbiote-native/svelte';

import {
  collectGarbage,
  describe,
  expect,
  flushTimers,
  heapInfo,
  it,
  print,
  report,
} from './harness';

import Navigation from './svelte-navigation-probe.svelte';
import SharedStateScreen from './svelte-shared-state-probe.svelte';

const ROOT_TAG = 1;
const ROWS = 30;
const SWAP_COUNTS = [400, 1_600] as const;
const COLLECTIONS = 8;
const LIVE_BYTES_KEY = 'hermes_allocatedBytes';
// Under one small object per extra swap: a per-swap leak of any size crosses it
const EXTRA_SWAPS_SLACK_BYTES = 65_536;

const tick = (): Promise<void> =>
  new Promise(resolve => {
    setTimeout(resolve, 0);
    flushTimers();
  });

const liveBytes = (): number => {
  for (let pass = 0; pass < COLLECTIONS; pass += 1) collectGarbage();
  return heapInfo()[LIVE_BYTES_KEY] ?? -1;
};

const advance = async (
  surface: { commit(): void },
  steps: number,
): Promise<void> => {
  if (steps === 0) return;
  await tick();
  surface.commit();
  await advance(surface, steps - 1);
};

type IScreenComponent = Parameters<typeof mount>[1];

const growth = async (
  screen: IScreenComponent,
  swaps: number,
): Promise<number> => {
  const surface = mount(ROOT_TAG, screen, { cycles: swaps, count: ROWS });
  await advance(surface, 2);
  const base = liveBytes();
  await advance(surface, swaps);
  const end = liveBytes();
  unmount(ROOT_TAG);
  return end - base;
};

const growthOf = async (
  screen: IScreenComponent,
  counts: readonly number[],
): Promise<number[]> => {
  const [next, ...rest] = counts;
  if (next === undefined) return [];
  return [await growth(screen, next), ...(await growthOf(screen, rest))];
};

const expectFlat = async (
  name: string,
  screen: IScreenComponent,
): Promise<void> => {
  const [few, many] = await growthOf(screen, SWAP_COUNTS);
  print(
    `${name} heap growth in bytes after ${SWAP_COUNTS.join('/')} swaps: ${few}/${many}`,
  );
  expect(many).toBeLessThan((few ?? 0) + EXTRA_SWAPS_SLACK_BYTES);
};

describe('the Svelte adapter heap after screen swaps and a full clean-up', () => {
  it('does not keep more live bytes after more swaps', async () => {
    await expectFlat('local state', Navigation);
  });

  // Every screen reads one module-level signal, so a dead screen's effects would pile up on it
  it('does not keep the effects of swapped screens on a shared signal', async () => {
    await expectFlat('shared state', SharedStateScreen);
  });
});

report();
