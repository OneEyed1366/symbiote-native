/**
 * @format
 *
 * Symbiote Svelte canary entry. createApp(App).mount(appName) wires the
 * native-host seams and RN's own AppRegistry, then mounts via @symbiote-native/engine — RN's own
 * renderer is never in the path.
 */

import { createApp } from '@symbiote-native/svelte/bootstrap';
import App from './App.svelte';
import { name as appName } from './app.json';

// DevTools inspector (Rozenite) — on for any dev build, off in release. `__DEV__` is RN's own
// runtime global (Metro/Hermes set it directly, no inline-flag plumbing needed here), so this
// stays in sync with metro.config.js's withRozenite() gate without a second flag to keep in sync.
if (__DEV__) {
  require('@symbiote-native/devtools/react-native');
}

createApp(App).mount(appName);
