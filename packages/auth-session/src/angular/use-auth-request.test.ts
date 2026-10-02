import '@angular/compiler';
import { Component, signal } from '@angular/core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, unmount } from '@symbiote-native/angular';
import { installRecordingFabric } from '@symbiote-native/test-utils';

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

const hooks = await import('./use-auth-request');

const ROOT_TAG = 1305;
const fabric = installRecordingFabric();
const tick = (): Promise<void> =>
  new Promise(resolve => setTimeout(resolve, 0));

const DISCOVERY = { authorizationEndpoint: 'https://example.com/authorize' };
const CONFIG = { clientId: 'client', redirectUri: 'app://cb' };
const discovery = signal<typeof DISCOVERY | null>(null);

let request: ReturnType<typeof hooks.injectAuthRequest> | undefined;
let resolvedDiscovery: ReturnType<typeof hooks.injectAutoDiscovery> | undefined;
let google: ReturnType<typeof hooks.injectGoogleAuthRequest> | undefined;
let facebook: ReturnType<typeof hooks.injectFacebookAuthRequest> | undefined;

@Component({ selector: 'auth-request-host', standalone: true, template: '' })
class HostFixture {
  constructor() {
    resolvedDiscovery = hooks.injectAutoDiscovery(() => DISCOVERY);
    request = hooks.injectAuthRequest(() => CONFIG, discovery);
    google = hooks.injectGoogleAuthRequest(() => ({ iosClientId: 'ios-id' }));
    facebook = hooks.injectFacebookAuthRequest(() => ({
      iosClientId: 'fb-ios',
    }));
  }
}

beforeEach(() => {
  fabric.reset();
  vi.clearAllMocks();
  discovery.set(null);
  request = undefined;
});

afterEach(() => {
  unmount(ROOT_TAG);
});

describe('inject auth request hooks (Positive)', () => {
  it('resolves discovery, then loads the request', async () => {
    mount(ROOT_TAG, HostFixture);
    expect(resolvedDiscovery?.()).toBeNull();
    await tick();
    expect(resolvedDiscovery?.()).toEqual(DISCOVERY);
    expect(request?.[0]()).toBeNull();

    discovery.set(DISCOVERY);
    await tick();
    await tick();
    expect(request?.[0]()?.clientId).toBe('client');
  });

  it('loads the Google and Facebook requests for the platform', async () => {
    mount(ROOT_TAG, HostFixture);
    await tick();
    await tick();
    expect(google?.[0]()?.clientId).toBe('ios-id');
    expect(google?.[0]()?.redirectUri).toBe('com.example.app:/oauthredirect');
    expect(facebook?.[0]()?.redirectUri).toBe('fbfb-ios://authorize');
  });

  it('refuses to prompt before the request has loaded', async () => {
    mount(ROOT_TAG, HostFixture);
    await expect(request?.[2]()).rejects.toThrow(
      'Cannot prompt to authenticate until the request has finished loading.',
    );
  });
});
