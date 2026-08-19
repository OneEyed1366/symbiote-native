/**
 * @format
 *
 * Symbiote Solid canary entry. createApp(App).mount(appName) wires the native-host seams and RN's
 * own AppRegistry, then mounts via @symbiote-native/engine - RN's own renderer is never in the path.
 * Same entry shape as every other canary, going through the shared AppRegistry seam.
 */

import { createApp } from '@symbiote-native/solid/bootstrap';
import App from './App';
import { name as appName } from './app.json';

createApp(App).mount(appName);
