/**
 * @format
 *
 * Symbiote Angular canary entry. bootstrapApplication wires the native-host seams and RN's own
 * AppRegistry, then registers the root component — same entry point the other canaries use.
 */

import { getSlot } from '@symbiote-native/engine';
import { bootstrapApplication } from '@symbiote-native/angular/bootstrap';
import { AppComponent } from './build/angular/src/App';
import { name as appName } from './app.json';
// Through the ngc output, like App above: the counter is TS under src/, and BenchmarkScreen
// imports the same emitted module, so both sides share the one set of counters.
import { installFabricCallCounter } from './build/angular/src/fabric-call-counter';

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

bootstrapApplication(AppComponent, { appName });
