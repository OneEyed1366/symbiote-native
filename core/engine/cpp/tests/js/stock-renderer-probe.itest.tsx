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

  // why: the renderer resolves a host element's type through `ReactNativeViewConfigRegistry.get`, so
  // a stock arm cannot render one view until `RCTView` is registered. The config has to be RN's OWN
  // rather than a hand-written stand-in: it carries `validAttributes`, which is what
  // `createAttributePayload` reads to decide the payload, so an invented one would produce a
  // different payload and the comparison would be measuring the stand-in. This repo has a standing
  // rule about exactly that shape of error.
  //
  // ── THIS IS A KNOWN-GAP MARKER, AND IT IS MEANT TO FAIL WHEN THE GAP CLOSES ────────────────────
  //
  // It asserts `registered === false`, which is not a requirement — it is the state of the harness.
  // Someone who adds platform-extension resolution will see this go red, and the `detail` line is
  // their handover.
  //
  // THE CHAIN, each link measured by satisfying the previous one and reading the next throw. Every
  // step took one line, and every line is in this test rather than the shared runner because it is a
  // fact about the stock arm:
  //
  //   1. `Can't find variable: global`                     -> runner prelude, `global = globalThis`
  //   2. `__fbBatchedBridgeConfig is not set`               -> an EMPTY bridge, so `NativeModules`
  //                                                           can evaluate and every lookup misses
  //   3. `getEnforcing('SourceCode') could not be found`    -> a turbomodule proxy answering to any
  //                                                           name; chasing them one at a time does
  //                                                           not converge
  //   4. `Cannot destructure property 'screen'`             -> `getConstants()` returning a screen
  //                                                           shape, since `{}` is not inert
  //   5. `Platform_default.select is undefined`             -> THE WALL, and it is not a fake:
  //
  // `Libraries/Utilities/Platform.js` is a compatibility shim whose entire body is
  // `import Platform from './Platform'; export default Platform;` — it relies on METRO resolving
  // `./Platform` to `Platform.ios.js`. esbuild has no platform extensions, so it resolves the file to
  // itself, the cycle yields `undefined`, and `BridgelessUIManager` dies on `Platform.select`.
  //
  // Closing it means teaching the runner `.ios.js` before `.js` for paths under `react-native` —
  // scoped there deliberately, because widening `resolveExtensions` globally would change how OUR
  // own sources resolve, and the project's folder-as-module layout already settled that question.
  //
  // What is NOT in the way, having been budgeted for and then not needed: Flow (the runner strips
  // it), and `ReactNativePrivateInterface` (all twelve of the renderer's uses resolved).
  it('stops at platform-extension resolution, and nothing earlier', () => {
    let detail: string;
    let registered = false;
    try {
      // BRIDGELESS, and it is the correct mode rather than a way around the error. `ViewNative-
      // Component` asks `NativeComponentRegistry.get`, whose branch is `native: !global.RN$Bridgeless`
      // — with the bridge it calls `getNativeComponentAttributes` and dies on "__fbBatchedBridge-
      // Config is not set"; without it, it builds the config from the STATIC one the module already
      // carries in JS. Bridgeless is what a real RN 0.86 app runs, so the static path is also the one
      // a device would take, which is what keeps the baseline honest.
      //
      // Set HERE and not in the runner prelude: it is a fact about the stock arm, and the engine's
      // own code reads globals of this family. A harness-wide flag would change every other itest.
      (globalThis as Record<string, unknown>).RN$Bridgeless = true;
      // AN EMPTY BRIDGE, which is not the same as no bridge. `NativeModules.js` throws
      // "__fbBatchedBridgeConfig is not set" from its MODULE scope, so the module cannot even
      // evaluate — and `TurboModuleRegistry.requireModule` reaches it for every miss, including the
      // one `NativeReactNativeFeatureFlags` takes at import time. An empty `remoteModuleConfig`
      // lets it initialise with no modules, every lookup misses cleanly, and the feature flags fall
      // back to their JS defaults. Set before the first require below, because both modules read
      // these globals at module scope.
      (globalThis as Record<string, unknown>).__fbBatchedBridgeConfig = {
        remoteModuleConfig: [],
      };
      // A TURBOMODULE THAT ANSWERS TO ANY NAME. Chasing the misses one at a time does not converge:
      // importing one component module reaches `getEnforcing('SourceCode')`, and behind it sit the
      // rest of RN's specs, each throwing the moment the previous is satisfied.
      //
      // Permissive by design, and the trap that carries is already written down — a fake that
      // resolves any name means module-NAME correctness can never be proven headlessly
      // (`<native_module_name_is_platform_specific>`). It does not apply to what this arm is for: a
      // payload built from a static JS view config never asks a native module anything, so nothing
      // measured here depends on a name being right.
      //
      // `getConstants` is singled out because a bare `{}` is not inert: `Dimensions` destructures
      // `screen` out of what `DeviceInfo` returns and dies on the miss. One screen shape satisfies
      // every consumer of it, and no measurement here reads a pixel.
      const screen = {
        width: 390,
        height: 844,
        scale: 3,
        fontScale: 1,
      };
      const constants = {
        Dimensions: { window: screen, screen },
        isIPhoneX_deprecated: false,
      };
      const anyTurboModule = new Proxy(
        {},
        {
          get: (_target, name) =>
            name === 'getConstants' ? () => constants : () => ({}),
        },
      );
      (globalThis as Record<string, unknown>).__turboModuleProxy = () =>
        anyTurboModule;
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const registry: unknown = require('react-native/Libraries/Renderer/shims/ReactNativeViewConfigRegistry');
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      require('react-native/Libraries/Components/View/ViewNativeComponent');
      if (typeof registry !== 'object' || registry === null) {
        detail = `registry resolved to ${typeof registry}`;
      } else {
        const get: unknown = (registry as Record<string, unknown>).get;
        if (typeof get !== 'function') {
          detail = 'registry has no get()';
        } else {
          const config: unknown = get('RCTView');
          const attributes =
            typeof config === 'object' && config !== null
              ? (config as Record<string, unknown>).validAttributes
              : undefined;
          registered = typeof attributes === 'object' && attributes !== null;
          detail = registered
            ? `${Object.keys(attributes as object).length} validAttributes`
            : `config resolved to ${typeof config}`;
        }
      }
    } catch (error) {
      // The STACK, not just the message: "__fbBatchedBridgeConfig is not set" is thrown from three
      // unrelated depths in RN and the message alone cannot say whether it came from importing the
      // module or from asking the registry — which is the difference between a one-line flag and the
      // whole TurboModule floor.
      const stack = error instanceof Error ? (error.stack ?? '') : '';
      detail = `${error instanceof Error ? error.message : String(error)} | ${stack
        .split('\n')
        .slice(0, 6)
        .join(' <- ')}`;
    }
    print(
      `DEBUG RCTView view config: registered=${String(registered)} :: ${detail}`,
    );
    // Deliberately asserting the GAP. Red here means someone taught the runner platform extensions
    // and a stock arm is now buildable — update this file, do not silence it.
    expect(registered).toBe(false);
    // And it must still stop where the header says. A different message means the chain moved and
    // the handover above is stale, which is worse than the gap itself.
    expect(detail.includes('Platform_default.select')).toBe(true);
  });
});

report();
