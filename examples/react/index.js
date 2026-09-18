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

// The `BATCHED_COMMITS_VIA` arm switch was here and is GONE with the batched applier it selected
// (2026-09-08). What replaced it is not a choice: the tree lives in C++ and the whole commit crosses
// as one buffer, so there is no per-call arm left to pick.
//
// One consequence of that survives and will be read as a bug: the FABRIC CALLS table reads ZERO on a
// runtime carrying the native tree host. The counter below wraps the JS global, and C++ talks to the
// UIManager directly without going through it. To read those counts, run without the native module.

// Before anything mounts, and forcing getSlot() here is the whole trick: the engine caches the
// Fabric binding on first commit, so the counting wrapper has to be installed while that cache is
// built. See the counter's own header for why the global swap is momentary and what breaks if it
// is not — and note the stock baseline (examples/bare-rn) carries the byte-identical file, which
// is the only reason the two sets of numbers are comparable at all.
//
// Guarded because a diagnostic that can stop the canary booting is worth less than no diagnostic:
// on any failure the app runs uncounted, and the empty FABRIC CALLS table is the signal.
try {
  installFabricCallCounter(() => {
    getSlot();
  });
} catch (error) {
  console.warn('[symbiote] Fabric call counter not installed:', error);
}

registerApp(App, { appName });
