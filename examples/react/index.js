/**
 * @format
 *
 * Symbiote canary entry. App code uses our own AppRegistry (the RN-identical
 * `registerComponent(appKey, () => App)`) which mounts via @symbiote-native/engine, not
 * React Native's renderer; registerApp wires the native-host seams (colors, images, device
 * events, third-party ViewConfigs) before registering, so this file only needs the app itself.
 */

import { getSlot } from '@symbiote-native/engine';
import { registerApp } from '@symbiote-native/react/bootstrap';
import App from './App';
import { name as appName } from './app.json';
import { installFabricCallCounter } from './fabric-call-counter';

// The FABRIC CALLS table reads ZERO on a runtime carrying the native tree host: C++ talks to the
// UIManager directly, bypassing the JS global this counter wraps. Run without the native module to
// see real counts.

// Forcing getSlot() here is the trick: the engine caches the Fabric binding on first commit, so the
// counting wrapper must install before that cache builds. bare-rn carries the byte-identical file,
// which is the only reason the two number sets are comparable.

// Guarded: a diagnostic that can stop the canary booting is worse than no diagnostic — on failure
// the app runs uncounted, and the empty FABRIC CALLS table is the signal.
try {
  installFabricCallCounter(() => {
    getSlot();
  });
} catch (error) {
  console.warn('[symbiote] Fabric call counter not installed:', error);
}

registerApp(App, { appName });
