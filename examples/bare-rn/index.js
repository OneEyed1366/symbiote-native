/**
 * @format
 *
 * Stock React Native entry: RN's own AppRegistry, RN's own Fabric renderer. This app is
 * the measurement baseline the SymbioteNative examples are compared against, so nothing
 * from @symbiote-native/* may ever enter this bundle.
 */

import { AppRegistry } from 'react-native';
import App from './App';
import { name as appName } from './app.json';
import { installFabricCallCounter } from './fabric-call-counter';

// The require below is the whole trick, and it has to happen HERE, before anything renders:
// React's Fabric renderer destructures the Fabric binding once at module scope, and RN only
// requires that module lazily on first render. Forcing the require while the counting view is
// installed is what makes the two stacks measurable on the same surface — see the counter's own
// header for why the swap is momentary and what breaks if it is not.
//
// Guarded because this app's job is to be the measurement BASELINE. A diagnostic that can stop it
// booting is worth less than no diagnostic: on any failure the app runs uncounted, and the empty
// FABRIC CALLS table on the benchmark screen is the signal.
try {
  installFabricCallCounter(() => {
    require('react-native/Libraries/Renderer/shims/ReactFabric');
  });
} catch (error) {
  console.warn('[bare-rn] Fabric call counter not installed:', error);
}

AppRegistry.registerComponent(appName, () => App);
