// Can React's OWN Fabric renderer stand up in this harness?
//
// why: every comparison against stock React Native in `CLAUDE.md` is taken on a device, because
// nothing here can run the other side. That is why `Swap` has carried "the standing React anomaly"
// unexplained through every re-measurement: both sides run the SAME reconciler, so the 9.6-vs-35.3
// difference has to be what React does against a MUTATION-mode host config versus its own
// PERSISTENT-mode one — and there is no arm to subtract.
//
// A headless stock baseline would answer that, and every future question of its shape, without a
// simulator. This file is the feasibility step, deliberately the smallest one: does the renderer
// LOAD, and does it find the pieces it needs. It asserts nothing about speed.
//
// WHY IT LOOKS POSSIBLE. Three walls that used to stand are down:
//   - `ReactFabric-prod.js` is a GENERATED bundle carrying `@noflow`, not Flow source.
//   - This runner already strips Flow from all of `react-native` and `@react-native/*`
//     (`scripts/run-itests.mjs`, `reactNativeFlow`) with Hermes' own parser — the step
//     `CLAUDE.md`'s RN-port backlog calls "step 0 … has not been tried".
//   - The renderer touches `ReactNativePrivateInterface` in exactly TWELVE places, so whatever does
//     not survive the import is a small, nameable list rather than RN's whole TurboModule floor.
//
// WHAT A FAILURE HERE MEANS: not that the idea is dead, but that the next step is a stub for the
// members that did not load. The point of the probe is to make that list, cheaply.
//
// ── IT LOADS, AND THE TWO WALLS IT HIT WERE NEITHER OF THE EXPECTED ONES ────────────────────────
//
// Flow was never the problem — the loader already handled it. What failed, in order:
//
//   1. 75x "The JSX syntax extension is not currently enabled". Stripping Flow leaves JSX ALONE, and
//      React Native writes JSX in `.js` files, which the loader was handing esbuild as `js`. Reads
//      like a Flow failure and is not one. Fixed by returning the `jsx` loader — strictly wider,
//      since a `.js` file with no JSX parses identically either way.
//   2. Unresolvable dev-only modules and `.png` imports out of LogBox. Those come from
//      `ReactNativePrivateInitializeCore`, which `ReactFabric-prod.js` requires on line 16 for its
//      side effects: RN's app bootstrap, dragging in LogBox, the DevTools hook and the whole
//      component tree. Stubbed to empty in the runner — a measurement that ran an app bootstrap
//      would be measuring the bootstrap.
//
// Neither was `ReactNativePrivateInterface`, which was the thing budgeted for. The renderer's twelve
// uses of it all resolved, so no stub was needed at all.
//
// WHAT THIS DOES NOT YET DO: render. It loads and exposes `render` / `stopSurface` /
// `dispatchCommand`, which makes a headless stock baseline a build-out rather than a research
// question — but standing a surface up needs view configs registered and a root tag the binding
// knows, and none of that is here.

import { describe, expect, it, print, report } from './harness';

type IProbeResult = { loaded: boolean; detail: string };

/** Load the renderer, and report what happened rather than letting the whole file die on it. */
function probeStockRenderer(): IProbeResult {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const loaded: unknown = require('react-native/Libraries/Renderer/implementations/ReactFabric-prod.js');
    if (typeof loaded !== 'object' || loaded === null) {
      return { loaded: false, detail: `resolved to ${typeof loaded}` };
    }
    return { loaded: true, detail: Object.keys(loaded).sort().join(' ') };
  } catch (error) {
    return {
      loaded: false,
      detail: error instanceof Error ? error.message : String(error),
    };
  }
}

describe('react own Fabric renderer in the headless harness', () => {
  // why: the binding the stock renderer drives is the same one `raw-fabric-vs-engine.itest.ts`
  // already uses, so if it were missing the probe below would fail for a reason that has nothing to
  // do with the renderer. Checked first so the two answers cannot be confused.
  it('has the nativeFabricUIManager the stock renderer would drive', () => {
    const binding = (globalThis as Record<string, unknown>)
      .nativeFabricUIManager;
    print(`DEBUG nativeFabricUIManager: ${typeof binding}`);
    expect(typeof binding).toBe('object');
  });

  // [characterization — this records what the harness CAN do, not what it should]
  //
  // why: the whole feasibility question in one assertion. A pass makes a headless stock baseline a
  // build-out rather than a research question; a failure names the missing piece in `detail`.
  it('loads ReactFabric-prod, or says exactly what stopped it', () => {
    const result = probeStockRenderer();
    print(
      `DEBUG stock renderer loaded=${String(result.loaded)} :: ${result.detail}`,
    );
    expect(result.loaded).toBe(true);
  });
});

report();
