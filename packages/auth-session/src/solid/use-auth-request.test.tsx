import { createSignal } from 'solid-js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, unmount } from '@symbiote-native/solid';
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

const ROOT_TAG = 1303;
const fabric = installRecordingFabric();
const tick = (): Promise<void> =>
  new Promise(resolve => setTimeout(resolve, 0));

const DISCOVERY = { authorizationEndpoint: 'https://example.com/authorize' };
const CONFIG = { clientId: 'client', redirectUri: 'app://cb' };

function mountProbe(run: () => void): void {
  mount(ROOT_TAG, () => {
    run();
    return null;
  });
}

beforeEach(() => {
  fabric.reset();
  vi.clearAllMocks();
});

afterEach(() => {
  unmount(ROOT_TAG);
});

describe('useAutoDiscovery', () => {
  it('starts null and settles on the resolved document', async () => {
    let captured: ReturnType<typeof hooks.useAutoDiscovery> | undefined;
    mountProbe(() => {
      captured = hooks.useAutoDiscovery(() => DISCOVERY);
    });
    expect(captured?.()).toBeNull();
    await tick();
    expect(captured?.()).toEqual(DISCOVERY);
  });
});

describe('useAuthRequest', () => {
  it('loads the request once discovery is there', async () => {
    let captured: ReturnType<typeof hooks.useAuthRequest> | undefined;
    const [discovery, setDiscovery] = createSignal<typeof DISCOVERY | null>(
      null,
    );
    mountProbe(() => {
      captured = hooks.useAuthRequest(() => CONFIG, discovery);
    });
    await tick();
    expect(captured?.[0]()).toBeNull();

    setDiscovery(DISCOVERY);
    await tick();
    await tick();
    expect(captured?.[0]()?.clientId).toBe('client');
    expect(captured?.[0]()?.url).toContain('https://example.com/authorize');
  });

  it('refuses to prompt before the request has loaded', async () => {
    let captured: ReturnType<typeof hooks.useAuthRequest> | undefined;
    mountProbe(() => {
      captured = hooks.useAuthRequest(
        () => CONFIG,
        () => null,
      );
    });
    await expect(captured?.[2]()).rejects.toThrow(
      'Cannot prompt to authenticate until the request has finished loading.',
    );
  });
});

describe('provider hooks', () => {
  it('loads a Google request with the platform client id and redirect', async () => {
    let captured: ReturnType<typeof hooks.useGoogleAuthRequest> | undefined;
    mountProbe(() => {
      captured = hooks.useGoogleAuthRequest(() => ({ iosClientId: 'ios-id' }));
    });
    await tick();
    expect(captured?.[0]()?.clientId).toBe('ios-id');
    expect(captured?.[0]()?.redirectUri).toBe('com.example.app:/oauthredirect');
  });

  it('loads a Facebook request with the fb-prefixed redirect', async () => {
    let captured: ReturnType<typeof hooks.useFacebookAuthRequest> | undefined;
    mountProbe(() => {
      captured = hooks.useFacebookAuthRequest(() => ({
        iosClientId: 'fb-ios',
      }));
    });
    await tick();
    expect(captured?.[0]()?.redirectUri).toBe('fbfb-ios://authorize');
  });
});
