// React's own Fabric renderer, loaded into this harness.
//
// why: `stock-renderer-probe.itest.tsx` established that it can be done and what each step is for.
// This is that sequence as one import, because there are now two files that want a stock arm and the
// setup must be IDENTICAL in both — two copies of four globals is two chances for one arm to be
// measured under different conditions than the other, which is the failure mode every comparison in
// this directory is written to avoid.
//
// A FILE THAT RUNS ON IMPORT, deliberately: every global below has to be standing before React
// Native's modules evaluate, and they evaluate on the first `require` of the renderer. A function
// the caller must remember to invoke first would be a rule, and rules get skipped.
//
// The importing file must carry `// @symbiote-platform-extensions` on its first line. Without it the
// runner does not resolve `.ios.js`, `Platform` comes back `undefined`, and the failure names
// `BridgelessUIManager` rather than the missing directive.

// BRIDGELESS, which is the mode a real RN 0.86 app runs. `NativeComponentRegistry.get` branches on
// `native: !global.RN$Bridgeless`: with a bridge it asks native for the view config and dies here;
// without one it builds the config from the STATIC one the module already carries in JS. So the
// static path is also the path a device takes, which is what keeps a baseline honest.
(globalThis as Record<string, unknown>).RN$Bridgeless = true;

// AN EMPTY BRIDGE, which is not the same as no bridge. `NativeModules.js` throws
// "__fbBatchedBridgeConfig is not set" from its MODULE scope, so it cannot even evaluate — and
// `TurboModuleRegistry.requireModule` reaches it on every miss, including the one
// `NativeReactNativeFeatureFlags` takes at import time. Empty lets it initialise with no modules,
// every lookup misses cleanly, and the feature flags fall back to their JS defaults.
(globalThis as Record<string, unknown>).__fbBatchedBridgeConfig = {
  remoteModuleConfig: [],
};

// A screen shape, because `{}` is not inert: `Dimensions` destructures `screen` out of what
// `DeviceInfo.getConstants()` returns and dies on the miss. One shape satisfies every consumer and no
// measurement here reads a pixel.
const SCREEN = { width: 390, height: 844, scale: 3, fontScale: 1 };

// A TURBOMODULE THAT ANSWERS TO ANY NAME. Chasing the misses one at a time does not converge —
// importing one component module reaches `getEnforcing('SourceCode')`, and behind it sits the rest of
// RN's specs, each throwing the moment the previous is satisfied.
//
// Permissive by design, and the trap it carries is already written down: a fake that resolves any
// name means module-NAME correctness can never be proven headlessly
// (`<native_module_name_is_platform_specific>`). It does not reach what a stock arm measures — a
// payload built from a static JS view config asks no native module anything.
//
// EXCEPT THAT `ExceptionsManager` MUST NOT BE SILENT, and this is the most expensive thing in the
// file to have learned. React catches a throw during render and routes it through RN's
// `ReactFiberErrorDialog` -> `ExceptionsManager`; a fake that accepts the report tells React the
// error is handled, so it does not rethrow. What the caller then sees is a component body that RAN
// and a surface holding `RootView()`, empty, with no error anywhere — and a swap measured against
// that reads 0.1 ms with a before/after census that matches perfectly, because both are empty.
//
// So the fake keeps the module NAME and shouts when the error path is used. A stock arm that
// silently renders nothing is the worst failure this harness can produce.
function fakeTurboModule(name: string): unknown {
  return new Proxy(
    {},
    {
      get: (_target, member) => {
        if (member === 'getConstants') {
          return () => ({
            Dimensions: { window: SCREEN, screen: SCREEN },
            isIPhoneX_deprecated: false,
          });
        }
        if (name === 'ExceptionsManager') {
          return (...args: unknown[]) => {
            const first = args[0];
            const message =
              typeof first === 'object' && first !== null && 'message' in first
                ? String((first as { message: unknown }).message)
                : String(first);
            throw new Error(
              `stock renderer reported an exception via ${String(member)}: ${message}`,
            );
          };
        }
        return () => ({});
      },
    },
  );
}

(globalThis as Record<string, unknown>).__turboModuleProxy = (name: string) =>
  fakeTurboModule(name);

export type IStockRenderer = {
  render: (
    element: unknown,
    rootTag: number,
    callback?: (() => void) | null,
    concurrentRoot?: boolean,
  ) => unknown;
};

/**
 * `ReactFabric-prod`, with RN's own view configs registered.
 *
 * PROD and not `-dev`: the dev bundle carries the reconciler's own instrumentation, which is the
 * same reason `CLAUDE.md` refuses to benchmark adapters in a Debug build — there the sign of the
 * headline comparison flipped.
 */
export function loadStockRenderer(): IStockRenderer {
  // The component modules register themselves with `ReactNativeViewConfigRegistry` on import, and the
  // renderer looks a host element's type up there. Imported for that side effect alone.
  //
  // ALL FOUR OF THE ROW'S NAMES, and leaving three out does not fail the way it should: React catches
  // the unregistered-type throw during render and routes it through `ReactFiberErrorDialog`, which in
  // this harness reports it handled. What the caller sees is a component body that RAN and a surface
  // that committed nothing — `RootView()`, empty, with no error anywhere. Measured against that, a
  // swap read 0.1 ms and every before/after census matched, because both were empty.
  //
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require('react-native/Libraries/Components/View/ViewNativeComponent');
  // `RCTText` and `RCTVirtualText`.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require('react-native/Libraries/Text/TextNativeComponent');
  // `RCTSinglelineTextInputView`. RN's own filename carries the typo.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require('react-native/Libraries/Components/TextInput/RCTSingelineTextInputNativeComponent');
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const loaded: unknown = require('react-native/Libraries/Renderer/implementations/ReactFabric-prod.js');
  if (typeof loaded !== 'object' || loaded === null) {
    throw new Error(`ReactFabric-prod resolved to ${typeof loaded}`);
  }
  const render = (loaded as Record<string, unknown>).render;
  if (typeof render !== 'function') {
    throw new Error(`ReactFabric-prod.render is ${typeof render}`);
  }
  // A narrowing, not a cast: the shape was checked above, and `stock-renderer-probe.itest.tsx` fails
  // first if the export ever stops being a function.
  return { render: render as IStockRenderer['render'] };
}
