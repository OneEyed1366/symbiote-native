// The Svelte adapter on the real engine, proved with a real compiled `.svelte` file
// The runner compiles it (`compile-svelte-components`) and sets the `browser` export condition
// Without it `mount()` resolves to the SSR build and throws

import { readSurfaceTelemetry } from '@symbiote-native/engine';
import { mount, unmount } from '@symbiote-native/svelte';

import {
  collectGarbage,
  committedShape,
  committedTexts,
  describe,
  expect,
  flushTimers,
  it,
  print,
  report,
} from './harness';

// esbuild resolves this through the `.svelte` loader in `scripts/run-itests.mjs`
import Probe from './svelte-probe.svelte';
import BlankText from './svelte-blank-text-probe.svelte';
import Navigation from './svelte-navigation-probe.svelte';

const ROOT_TAG = 1;
const SCREEN_SWAPS = 20;
// A leak is near two thousand nodes for 30 rows and about eighty for one, a flat tree moves by none
const SCREEN_SIZES = [
  { count: 30, slack: 150 },
  { count: 1, slack: 2 },
] as const;
// C++ frees a dropped tree one level per collection, and a screen row is three levels deep
const COLLECTIONS = 8;

const tick = (): Promise<void> =>
  new Promise(resolve => {
    setTimeout(resolve, 0);
    flushTimers();
  });

// Svelte commits one level more than Vue or React, as it mounts into a root view of its own
// (`createRootElement`), so the shape is container, root view, then the component's outer view
const underRoot = (inner: string): string => `RootView(View(View(${inner})))`;

describe('the Svelte adapter on the real engine', () => {
  // The smallest proof that a compiled component reaches Fabric, asserted on the committed tree
  it('renders a compiled component into the committed tree', () => {
    mount(ROOT_TAG, Probe).commit();

    expect(committedShape()).toBe(underRoot('View(View())'));
    unmount(ROOT_TAG);
  });

  // The `{#if}` branch must add exactly one view, as the anchors it leaves are not views
  it('commits the if-branch and none of the anchors it leaves', async () => {
    const surface = mount(ROOT_TAG, Probe, { expanded: true });
    await tick();
    surface.commit();

    expect(committedShape()).toBe(underRoot('View(View()View())'));
    unmount(ROOT_TAG);
  });

  // A gap the compiler keeps (`&nbsp;`) is blanked by the adapter and then dropped by the engine
  it('commits no raw text for a whitespace-only gap between sibling tags', () => {
    mount(ROOT_TAG, BlankText).commit();

    expect(committedShape()).toBe(
      underRoot('View(Paragraph(RawText())Paragraph(RawText()))'),
    );
    expect(committedTexts().join('|')).toBe('Ada|tail');
    unmount(ROOT_TAG);
  });

  // An expression that empties out keeps its node, and only the committed tree stops painting it
  it('stops committing a raw text whose expression empties out', async () => {
    const surface = mount(ROOT_TAG, BlankText, { emptied: true });
    await tick();
    surface.commit();

    expect(committedShape()).toBe(
      underRoot('View(Paragraph()Paragraph(RawText()))'),
    );
    expect(committedTexts().join('|')).toBe('tail');
    unmount(ROOT_TAG);
  });

  // A screen swapped out by `{#if}` is garbage once nothing names it, and the C++ tree must follow
  for (const { count, slack } of SCREEN_SIZES) {
    it(`gives back the screens of ${count} rows it navigated away from`, async () => {
      const liveNodes = (): number => {
        for (let pass = 0; pass < COLLECTIONS; pass += 1) collectGarbage();
        return readSurfaceTelemetry(ROOT_TAG)?.liveNodes ?? -1;
      };
      // One swap per tick, so every screen is committed before the next one replaces it
      const advance = async (
        surface: { commit(): void },
        steps: number,
      ): Promise<void> => {
        if (steps === 0) return;
        await tick();
        surface.commit();
        await advance(surface, steps - 1);
      };
      // `unmount` after the reading: a mount left on the same root adds a constant to the next one
      const settle = async (cycles: number): Promise<number> => {
        await advance(
          mount(ROOT_TAG, Navigation, { cycles, count }),
          cycles + 2,
        );
        const live = liveNodes();
        unmount(ROOT_TAG);
        return live;
      };

      const oneScreen = await settle(0);
      const afterSwaps = await settle(SCREEN_SWAPS);
      const afterMore = await settle(SCREEN_SWAPS * 2);
      print(
        `x${count}: 0 swaps ${oneScreen}, ${SCREEN_SWAPS} ${afterSwaps}, ${SCREEN_SWAPS * 2} ${afterMore}`,
      );

      expect(oneScreen).toBeGreaterThan(0);
      expect(afterSwaps - oneScreen).toBeLessThan(slack + 1);
      expect(afterMore - afterSwaps).toBeLessThan(slack + 1);
    });
  }
});

report();
