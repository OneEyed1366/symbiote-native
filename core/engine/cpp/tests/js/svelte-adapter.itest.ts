// The FOURTH adapter on the real engine, and the second that needs a compiler.
//
// Solid settled that a compile step can live in the bundler. Svelte asks the same question with a
// different answer shape: its components are whole FILES, not JSX inside a `.tsx`, and its runtime
// is split by an export condition — the `default`/`worker` side is the SSR build, whose `mount()`
// throws outright. Both halves are the runner's job (`compile-svelte-components`, and `browser` in
// the esbuild conditions), and this file is what proves they are right.
//
// **The probe is a real `.svelte` file, not a compiled source string.** The vitest suites compile a
// string at runtime, write a loose `.mjs` and dynamic-import it by path; there is no file system to
// write to here and no module loader to import with. A file next to the test is also how an app
// actually builds, so this removes an indirection rather than adding one.
//
// Svelte's own currency is ANCHOR NODES — a `{#if}` leaves two — and none of them commit, which is
// exactly the kind of thing a stand-in tree had to be told and this one simply does.

import { mount, unmount } from '@symbiote-native/svelte';

import {
  committedShape,
  describe,
  expect,
  flushTimers,
  it,
  report,
} from './harness';

// esbuild resolves this through the `.svelte` loader in `scripts/run-itests.mjs`.
import Probe from './svelte-probe.svelte';

const ROOT_TAG = 1;

const tick = (): Promise<void> =>
  new Promise(resolve => {
    setTimeout(resolve, 0);
    flushTimers();
  });

// Svelte commits ONE MORE LEVEL than Vue or React do for the same markup, and it is not an artefact
// of this harness: `render.ts` mounts into `createRootShimElement(surface)`, a real engine node
// standing in for the DOM element Svelte's client runtime insists on having as a target. So the
// nesting below is surface container -> Svelte's shim -> the component's own outer view.
//
// Vue's twin of this file reads `RootView(View(View()))` for one element; Svelte reads
// `RootView(View(View(View())))`. Written out here because the first version of this file guessed
// Vue's shape, and a shape assertion that has to be corrected downward is exactly the mistake a
// stand-in tree used to absorb silently.
const SHIM = (inner: string): string => `RootView(View(View(${inner})))`;

describe('the Svelte adapter on the real engine', () => {
  // why: the smallest proof that a compiled Svelte component reaches Fabric — and the assertion is
  // on the tree React Native committed, not on what the DOM shim was asked to do.
  it('renders a compiled component into the committed tree', () => {
    mount(ROOT_TAG, Probe).commit();

    expect(committedShape()).toBe(SHIM('View(View())'));
    unmount(ROOT_TAG);
  });

  // why: the `{#if}` branch, which is where Svelte's anchors live. The committed shape must gain
  // exactly one view — a block leaves anchor nodes behind, and an anchor is not a view.
  it('commits the if-branch and none of the anchors it leaves', async () => {
    const surface = mount(ROOT_TAG, Probe, { expanded: true });
    await tick();
    surface.commit();

    expect(committedShape()).toBe(SHIM('View(View()View())'));
    unmount(ROOT_TAG);
  });
});

report();
