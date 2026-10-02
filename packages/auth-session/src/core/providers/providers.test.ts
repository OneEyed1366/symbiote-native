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
vi.mock('react-native', () => ({ Platform: { OS: 'ios' } }));

const { GoogleAuthRequest } = await import('./google');
const { FacebookAuthRequest } = await import('./facebook');

describe('GoogleAuthRequest', () => {
  it('merges the minimum Google scopes with the caller-provided ones', () => {
    const request = new GoogleAuthRequest({
      clientId: 'client',
      redirectUri: 'com.app:/oauth',
      scopes: ['extra-scope'],
    });
    expect(request.scopes).toEqual(
      expect.arrayContaining([
        'extra-scope',
        'openid',
        'https://www.googleapis.com/auth/userinfo.profile',
        'https://www.googleapis.com/auth/userinfo.email',
      ]),
    );
  });

  it('applies selectAccount as the select_account prompt', () => {
    const request = new GoogleAuthRequest({
      clientId: 'client',
      redirectUri: 'com.app:/oauth',
      selectAccount: true,
    });
    expect(request.extraParams.prompt).toBe('select_account');
  });
});

describe('FacebookAuthRequest', () => {
  it('defaults to the implicit token response type', () => {
    const request = new FacebookAuthRequest({
      clientId: 'client',
      redirectUri: 'fb1:/authorize',
    });
    expect(request.responseType).toBe('token');
  });

  it('merges the minimum Facebook scopes with the caller-provided ones', () => {
    const request = new FacebookAuthRequest({
      clientId: 'client',
      redirectUri: 'fb1:/authorize',
      scopes: ['extra-scope'],
    });
    expect(request.scopes).toEqual(
      expect.arrayContaining(['extra-scope', 'public_profile', 'email']),
    );
  });
});
