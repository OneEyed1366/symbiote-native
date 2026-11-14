/**
 * @format
 *
 * Web canary entry: the same `registerApp` call as the native canary, which needs the DOM host
 */

import { registerApp } from '@symbiote-native/react/bootstrap';
import App from './App';
import { name as appName } from './app.json';

registerApp(App, { appName });
