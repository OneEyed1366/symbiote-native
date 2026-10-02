// Svelte twin of `../react`'s auth request hooks test, driven through the real compiler

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, unmount } from '@symbiote-native/svelte/native-view-bridge';
import { installRecordingFabric } from '@symbiote-native/test-utils';
import {
  createSvelteHarness,
  loadComponent,
} from './svelte-compile.test-helper';

vi.mock('@symbiote-native/crypto', () => ({
  getRandomValues: (typedArray: Uint8Array) => typedArray,
  digestStringAsync: async () => 'abcd',
  CryptoDigestAlgorithm: { SHA256: 'SHA256' },
  CryptoEncoding: { BASE64: 'BASE64', HEX: 'HEX' },
}));
vi.mock('@symbiote-native/web-browser', () => ({
  openAuthSessionAsync: vi.fn(),
}));
vi.mock('@symbiote-native/application', () => ({
  applicationId: 'com.example.app',
}));
vi.mock('react-native', () => ({
  Platform: {
    OS: 'ios',
    select: (spec: Record<string, string>) => spec['ios'] ?? spec['default'],
  },
}));

if (globalThis.window === undefined)
  Object.assign(globalThis, { window: globalThis });
if (globalThis.navigator === undefined) {
  Object.assign(globalThis, { navigator: { product: 'ReactNative' } });
}

const ROOT_TAG = 1304;
const fabric = installRecordingFabric();
const tick = (): Promise<void> =>
  new Promise(resolve => setTimeout(resolve, 0));

let harness = createSvelteHarness('auth-request');

beforeEach(() => {
  fabric.reset();
  vi.clearAllMocks();
  harness = createSvelteHarness('auth-request');
});

afterEach(() => {
  unmount(ROOT_TAG);
  harness.cleanup();
});

const PROBE_APP = `<script lang="ts">
   import { useAutoDiscovery, useGoogleAuthRequest, useFacebookAuthRequest } from './use-auth-request.svelte';
   const discovery = useAutoDiscovery(() => ({ authorizationEndpoint: 'https://example.com/authorize' }));
   const google = useGoogleAuthRequest(() => ({ iosClientId: 'ios-id' }));
   const facebook = useFacebookAuthRequest(() => ({ iosClientId: 'fb-ios' }));
   Object.assign(globalThis, {
     __auth: () => ({ discovery: discovery.current, google: google[0].current, facebook: facebook[0].current }),
   });
 </script>`;

type IProbe = {
  discovery: { authorizationEndpoint: string } | null;
  google: { clientId: string; redirectUri: string } | null;
  facebook: { redirectUri: string } | null;
};

function currentAuth(): IProbe {
  const read: unknown = Reflect.get(globalThis, '__auth');
  if (typeof read !== 'function')
    throw new Error('probe app did not publish `__auth`');
  return read();
}

describe('auth request hooks (Positive)', () => {
  it('resolves discovery and loads the Google and Facebook requests', async () => {
    const app = harness.compileSource(__dirname, 'probe-app', PROBE_APP);
    mount(ROOT_TAG, await loadComponent(app));
    await tick();
    await tick();

    const state = currentAuth();
    expect(state.discovery).toEqual({
      authorizationEndpoint: 'https://example.com/authorize',
    });
    expect(state.google?.clientId).toBe('ios-id');
    expect(state.google?.redirectUri).toBe('com.example.app:/oauthredirect');
    expect(state.facebook?.redirectUri).toBe('fbfb-ios://authorize');
  });
});
