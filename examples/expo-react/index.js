/**
 * @format
 *
 * Symbiote canary entry. App code uses our own AppRegistry (the RN-identical
 * `registerComponent(appKey, () => App)`) which mounts via @symbiote-native/engine, not
 * React Native's renderer; registerApp wires the native-host seams (colors, images, device
 * events, third-party ViewConfigs) before registering, so this file only needs the app itself.
 */

import { registerApp } from '@symbiote-native/react/bootstrap';
import App from './App';
import { name as appName } from './app.json';

registerApp(App, { appName });
