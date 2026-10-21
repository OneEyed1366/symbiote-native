import { createApp } from '@symbiote-native/svelte/bootstrap';
import App from './CatalystCanary.svelte';
import { name as appName } from './app.json';

createApp(App).mount(appName);
