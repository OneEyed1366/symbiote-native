import { useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, unmount } from '@symbiote-native/react';
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

const ROOT_TAG = 1302;
const fabric = installRecordingFabric();
const tick = (): Promise<void> =>
  new Promise(resolve => setTimeout(resolve, 0));

const DISCOVERY = { authorizationEndpoint: 'https://example.com/authorize' };
const CONFIG = { clientId: 'client', redirectUri: 'app://cb' };

let discovery: ReturnType<typeof hooks.useAutoDiscovery>;
let request: ReturnType<typeof hooks.useAuthRequest> | undefined;
let setDiscovery: ((value: typeof DISCOVERY | null) => void) | undefined;

function AutoDiscoveryHarness(): null {
  discovery = hooks.useAutoDiscovery(DISCOVERY);
  return null;
}

function RequestHarness(): null {
  const [current, setCurrent] = useState<typeof DISCOVERY | null>(null);
  setDiscovery = setCurrent;
  request = hooks.useAuthRequest(CONFIG, current);
  return null;
}

beforeEach(() => {
  fabric.reset();
  vi.clearAllMocks();
  discovery = null;
  request = undefined;
});

afterEach(() => {
  unmount(ROOT_TAG);
});

describe('useAutoDiscovery', () => {
  it('starts null and settles on the resolved document', async () => {
    mount(ROOT_TAG, <AutoDiscoveryHarness />);
    expect(discovery).toBeNull();
    await tick();
    expect(discovery).toEqual(DISCOVERY);
  });
});

describe('useAuthRequest', () => {
  it('loads the request once discovery is there', async () => {
    mount(ROOT_TAG, <RequestHarness />);
    await tick();
    expect(request?.[0]).toBeNull();

    setDiscovery?.(DISCOVERY);
    await tick();
    await tick();
    expect(request?.[0]?.clientId).toBe('client');
    expect(request?.[0]?.url).toContain('https://example.com/authorize');
  });

  it('refuses to prompt before the request has loaded', async () => {
    mount(ROOT_TAG, <RequestHarness />);
    await tick();
    await expect(request?.[2]()).rejects.toThrow(
      'Cannot prompt to authenticate until the request has finished loading.',
    );
  });
});

describe('provider hooks', () => {
  it('loads a Google request with the platform client id and redirect', async () => {
    let captured: ReturnType<typeof hooks.useGoogleAuthRequest> | undefined;
    function Google(): null {
      captured = hooks.useGoogleAuthRequest({ iosClientId: 'ios-id' });
      return null;
    }
    mount(ROOT_TAG, <Google />);
    await tick();
    expect(captured?.[0]?.clientId).toBe('ios-id');
    expect(captured?.[0]?.redirectUri).toBe('com.example.app:/oauthredirect');
  });

  it('loads a Facebook request with the fb-prefixed redirect', async () => {
    let captured: ReturnType<typeof hooks.useFacebookAuthRequest> | undefined;
    function Facebook(): null {
      captured = hooks.useFacebookAuthRequest({ iosClientId: 'fb-ios' });
      return null;
    }
    mount(ROOT_TAG, <Facebook />);
    await tick();
    expect(captured?.[0]?.redirectUri).toBe('fbfb-ios://authorize');
  });
});
