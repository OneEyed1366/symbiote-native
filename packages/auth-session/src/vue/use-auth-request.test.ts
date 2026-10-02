import { defineComponent, h, ref, type VNode } from '@vue/runtime-core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, unmount } from '@symbiote-native/vue';
import { installRecordingFabric } from '@symbiote-native/test-utils';

vi.mock('@symbiote-native/crypto', () => ({
  getRandomValues: (typedArray: Uint8Array) => typedArray,
  digestStringAsync: async () => 'abcd',
  CryptoDigestAlgorithm: { SHA256: 'SHA256' },
  CryptoEncoding: { BASE64: 'BASE64', HEX: 'HEX' },
}));
const { openAuthSessionAsync } = vi.hoisted(() => ({
  openAuthSessionAsync: vi.fn(),
}));
vi.mock('@symbiote-native/web-browser', () => ({ openAuthSessionAsync }));
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

const ROOT_TAG = 1301;
const fabric = installRecordingFabric();
const tick = (): Promise<void> =>
  new Promise(resolve => setTimeout(resolve, 0));

const DISCOVERY = { authorizationEndpoint: 'https://example.com/authorize' };
const CONFIG = { clientId: 'client', redirectUri: 'app://cb' };

function mountProbe(run: () => void): void {
  const Probe = defineComponent(() => {
    run();
    return (): VNode => h('text', 'probe');
  });
  mount(ROOT_TAG, { render: (): VNode => h(Probe) });
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
      captured = hooks.useAutoDiscovery(DISCOVERY);
    });
    expect(captured?.value).toBeNull();
    await tick();
    expect(captured?.value).toEqual(DISCOVERY);
  });
});

describe('useAuthRequest', () => {
  it('loads the request once discovery is there, then prompts and publishes the result', async () => {
    openAuthSessionAsync.mockResolvedValue({
      type: 'success',
      url: 'app://cb?code=abc&state=x',
    });
    let captured: ReturnType<typeof hooks.useAuthRequest> | undefined;
    const discovery = ref<typeof DISCOVERY | null>(null);
    mountProbe(() => {
      captured = hooks.useAuthRequest(CONFIG, discovery);
    });
    await tick();
    expect(captured?.[0].value).toBeNull();

    discovery.value = DISCOVERY;
    await tick();
    const request = captured?.[0].value;
    expect(request?.clientId).toBe('client');
    expect(request?.url).toContain('https://example.com/authorize');

    expect(captured?.[1].value).toBeNull();
    const prompted = await captured?.[2]();
    expect(prompted?.type).toBe('error');
    expect(captured?.[1].value).toBe(prompted);
  });

  it('refuses to prompt before the request has loaded', async () => {
    let captured: ReturnType<typeof hooks.useAuthRequest> | undefined;
    mountProbe(() => {
      captured = hooks.useAuthRequest(CONFIG, null);
    });
    await expect(captured?.[2]()).rejects.toThrow(
      'Cannot prompt to authenticate until the request has finished loading.',
    );
  });
});

describe('provider hooks', () => {
  it('loads a Google request with the platform client id and the installed-app redirect', async () => {
    let captured: ReturnType<typeof hooks.useGoogleAuthRequest> | undefined;
    mountProbe(() => {
      captured = hooks.useGoogleAuthRequest({ iosClientId: 'ios-id' });
    });
    await tick();
    const request = captured?.[0].value;
    expect(request?.clientId).toBe('ios-id');
    expect(request?.redirectUri).toBe('com.example.app:/oauthredirect');
  });

  it('loads a Google id-token request over the default flow off web', async () => {
    let captured:
      ReturnType<typeof hooks.useGoogleIdTokenAuthRequest> | undefined;
    mountProbe(() => {
      captured = hooks.useGoogleIdTokenAuthRequest({ iosClientId: 'ios-id' });
    });
    await tick();
    expect(captured?.[0].value?.responseType).toBe('code');
  });

  it('loads a Facebook request with the fb-prefixed redirect', async () => {
    let captured: ReturnType<typeof hooks.useFacebookAuthRequest> | undefined;
    mountProbe(() => {
      captured = hooks.useFacebookAuthRequest({ iosClientId: 'fb-ios' });
    });
    await tick();
    expect(captured?.[0].value?.redirectUri).toBe('fbfb-ios://authorize');
  });
});
