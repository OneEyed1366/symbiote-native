/**
 * @format
 *
 * Symbiote Vue canary entry. createApp(App).mount(appName) wires the
 * native-host seams and RN's own AppRegistry, then mounts via @symbiote-native/engine — RN's own
 * renderer is never in the path. Same entry point as examples/vue-sfc, going through the
 * shared AppRegistry seam like every other canary.
 */

import { getSlot } from '@symbiote-native/engine';
import { createApp } from '@symbiote-native/vue/bootstrap';
import App from './App';
import { name as appName } from './app.json';
import { installFabricCallCounter } from './fabric-call-counter';

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

createApp(App).mount(appName);
