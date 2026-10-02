import { describe, expect, it, vi } from 'vitest';

const dismissAuthSession = vi.fn();
vi.mock('@symbiote-native/web-browser', () => ({
  dismissAuthSession,
  openAuthSessionAsync: vi.fn(),
}));
vi.mock('@symbiote-native/crypto', () => ({
  getRandomValues: (typedArray: Uint8Array) => typedArray,
  digestStringAsync: async () => '',
  CryptoDigestAlgorithm: { SHA256: 'SHA256' },
  CryptoEncoding: { BASE64: 'BASE64', HEX: 'HEX' },
}));

let platformOS = 'ios';
vi.mock('react-native', () => ({
  get Platform() {
    return { OS: platformOS };
  },
}));

const { dismiss, makeRedirectUri } = await import('./auth-session');

describe('dismiss', () => {
  it('delegates to the web-browser package', () => {
    dismiss();
    expect(dismissAuthSession).toHaveBeenCalledTimes(1);
  });
});

describe('makeRedirectUri', () => {
  it('returns the native scheme as-is on a native platform', () => {
    platformOS = 'ios';
    expect(makeRedirectUri({ native: 'com.my.app:/oauthredirect' })).toBe(
      'com.my.app:/oauthredirect',
    );
  });

  it('ignores native and requires scheme on web', () => {
    platformOS = 'web';
    expect(() =>
      makeRedirectUri({ native: 'com.my.app:/oauthredirect' }),
    ).toThrow(/requires a `scheme`/);
    platformOS = 'ios';
  });

  it('builds a double-slashed URI from scheme + path by default', () => {
    expect(makeRedirectUri({ scheme: 'myapp', path: 'redirect' })).toBe(
      'myapp://redirect',
    );
  });

  it('builds a triple-slashed URI when requested', () => {
    expect(makeRedirectUri({ scheme: 'myapp', isTripleSlashed: true })).toBe(
      'myapp:///',
    );
  });

  it('appends query params, dropping nullish values', () => {
    expect(
      makeRedirectUri({
        scheme: 'myapp',
        path: 'redirect',
        queryParams: { a: '1', b: undefined },
      }),
    ).toBe('myapp://redirect?a=1');
  });

  it('throws when neither native nor scheme is provided', () => {
    expect(() => makeRedirectUri()).toThrow(/requires a `scheme`/);
  });

  it('rewrites a matched IPv4 host to localhost when preferLocalhost is set', () => {
    expect(
      makeRedirectUri({
        scheme: 'myapp',
        path: '192.168.1.5:8081/redirect',
        preferLocalhost: true,
      }),
    ).toBe('myapp://localhost:8081/redirect');
  });
});
