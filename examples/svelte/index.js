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

createApp(App).mount(appName);
