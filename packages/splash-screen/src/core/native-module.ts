// react-native-bootsplash's package.json ships an `exports` map that only opens `.`,
// `./expo`, `./package.json`, `./app.plugin.js` — its internal TurboModule spec
// (dist/commonjs/specs/NativeRNBootSplash) is NOT a published subpath, so a deep import
// would throw ERR_PACKAGE_PATH_NOT_EXPORTED. getEnforcingNativeModule reads the same
// global TurboModule proxy the spec itself reads (by name), sidestepping the exports map
// entirely — this is how we reach getConstants(), which the package's public JS API
// (hide/isVisible/useHideAnimation) never exposes directly.
import { getEnforcingNativeModule } from '@symbiote-native/engine';
import type { IHideAnimationConstants } from './types';

const RN_BOOT_SPLASH_MODULE_NAME = 'RNBootSplash';

type IRNBootSplashSpec = {
  getConstants(): IHideAnimationConstants;
};

// DELIBERATELY UNGUARDED — do not wrap this in a try/catch or hand it a fallback.
//
// A missing RNBootSplash is a BUILD error, not a runtime condition: the module is either linked
// into the binary or it is not, deterministically, on the very first launch. Upstream treats it
// the same way and does not soften it either — react-native-bootsplash's whole spec file is
// `TurboModuleRegistry.getEnforcing<Spec>("RNBootSplash")` (src/specs/NativeRNBootSplash.ts),
// which throws at module-IMPORT time, and its useHideAnimation calls `NativeModule.getConstants()`
// with no guard at all. `getEnforcing` exists precisely to make this loud.
//
// This repo has a live footgun that depends on it staying loud: `npm install` deletes the
// `.rn-bootsplash/` folder this package's podspec vendors at pod-install time (see CLAUDE.md), so
// a skipped `pod install` yields exactly this missing module. Degrading to light-mode defaults
// would turn that into "the splash looks fine, just never dark" and it would ship.
//
// Note the failure is currently invisible under @symbiote-native/react specifically: mount()
// (adapters/react/src/render.ts) wires the reconciler's uncaught-error callbacks to `noop`, so the
// throw never reaches the app. That is a defect in THAT adapter, tracked separately — it is not a
// reason to stop throwing here.
export function getHideAnimationConstants(): IHideAnimationConstants {
  return getEnforcingNativeModule<IRNBootSplashSpec>(
    RN_BOOT_SPLASH_MODULE_NAME,
  ).getConstants();
}
