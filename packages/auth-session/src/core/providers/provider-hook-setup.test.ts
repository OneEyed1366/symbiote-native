import { describe, expect, it, vi } from 'vitest';

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

const {
  resolveFacebookRequestSetup,
  resolveGoogleRequestSetup,
  toGoogleIdTokenConfig,
} = await import('./provider-hook-setup');
const { Prompt, ResponseType } = await import('../auth-request.types');

describe('resolveGoogleRequestSetup', () => {
  it('picks the client id for the running platform, falling back to clientId', () => {
    const platform = resolveGoogleRequestSetup({
      iosClientId: 'ios-id',
      clientId: 'generic',
    });
    expect(platform.requestConfig.clientId).toBe('ios-id');
    const generic = resolveGoogleRequestSetup({ clientId: 'generic' });
    expect(generic.requestConfig.clientId).toBe('generic');
  });

  it('demands a client id for the platform', () => {
    expect(() => resolveGoogleRequestSetup({})).toThrow(
      'Client Id property `iosClientId` must be defined to use Google auth on this platform.',
    );
  });

  it('defaults to the code flow and keeps an explicit response type', () => {
    expect(
      resolveGoogleRequestSetup({ clientId: 'c' }).requestConfig.responseType,
    ).toBe(ResponseType.Code);
    expect(
      resolveGoogleRequestSetup({ clientId: 'c', responseType: 'token' })
        .requestConfig.responseType,
    ).toBe('token');
  });

  it('builds the installed-app redirect uri from the application id', () => {
    expect(
      resolveGoogleRequestSetup({ clientId: 'c' }).requestConfig.redirectUri,
    ).toBe('com.example.app:/oauthredirect');
    expect(
      resolveGoogleRequestSetup({ clientId: 'c', redirectUri: 'app://cb' })
        .requestConfig.redirectUri,
    ).toBe('app://cb');
  });

  it('maps language, login hint and account selection onto extra params', () => {
    const { requestConfig } = resolveGoogleRequestSetup({
      clientId: 'c',
      extraParams: { keep: '1' },
      language: 'it',
      loginHint: 'me@example.com',
      selectAccount: true,
    });
    expect(requestConfig.extraParams).toEqual({
      keep: '1',
      hl: 'it',
      login_hint: 'me@example.com',
      prompt: Prompt.SelectAccount,
    });
  });

  it('carries what the code exchange needs', () => {
    const { exchange, requestConfig } = resolveGoogleRequestSetup({
      clientId: 'c',
      clientSecret: 's',
      scopes: ['a'],
      shouldAutoExchangeCode: false,
    });
    expect(exchange).toEqual({
      clientId: 'c',
      clientSecret: 's',
      redirectUri: requestConfig.redirectUri,
      scopes: ['a'],
      shouldAutoExchangeCode: false,
    });
  });
});

describe('toGoogleIdTokenConfig', () => {
  it('clears the response type so the default flow applies off web', () => {
    expect(
      toGoogleIdTokenConfig({ clientId: 'c', responseType: 'token' }),
    ).toEqual({ clientId: 'c', responseType: undefined });
  });
});

describe('resolveFacebookRequestSetup', () => {
  it('builds the fb-prefixed native redirect uri and maps language to locale', () => {
    const { clientId, redirectUri, extraParams } = resolveFacebookRequestSetup({
      iosClientId: 'fb-ios',
      language: 'it',
    });
    expect(clientId).toBe('fb-ios');
    expect(redirectUri).toBe('fbfb-ios://authorize');
    expect(extraParams).toEqual({ locale: 'it' });
  });

  it('demands a client id for the platform', () => {
    expect(() => resolveFacebookRequestSetup({})).toThrow(
      'Client Id property `iosClientId` must be defined to use Facebook auth on this platform.',
    );
  });
});
