/**
 * @format
 *
 * Symbiote Vue canary entry (M3 / R4 on-device proof). createApp(App).mount(appName) wires the
 * native-host seams and RN's own AppRegistry, then mounts via @symbiote-native/engine — RN's own
 * renderer is never in the path.
 */

import { createApp } from '@symbiote-native/vue/bootstrap';
import App from './App';
import { name as appName } from './app.json';

createApp(App).mount(appName);
