import { describe, expect, it, vi } from 'vitest';
import {
  fetchDiscoveryAsync,
  issuerWithWellKnownUrl,
  resolveDiscoveryAsync,
} from './discovery';

describe('issuerWithWellKnownUrl', () => {
  it('appends the well-known discovery path', () => {
    expect(issuerWithWellKnownUrl('https://example.com/auth')).toBe(
      'https://example.com/auth/.well-known/openid-configuration',
    );
  });
});

describe('fetchDiscoveryAsync', () => {
  it('maps the provider metadata onto camelCase endpoint fields', async () => {
    const fetchMock = vi.fn(async () => ({
      json: async () => ({
        authorization_endpoint: 'https://example.com/authorize',
        token_endpoint: 'https://example.com/token',
        revocation_endpoint: 'https://example.com/revoke',
        userinfo_endpoint: 'https://example.com/userinfo',
      }),
      headers: { get: () => 'application/json' },
    }));
    vi.stubGlobal('fetch', fetchMock);

    const discovery = await fetchDiscoveryAsync('https://example.com/auth');
    expect(discovery.authorizationEndpoint).toBe(
      'https://example.com/authorize',
    );
    expect(discovery.tokenEndpoint).toBe('https://example.com/token');
    expect(discovery.revocationEndpoint).toBe('https://example.com/revoke');
    expect(discovery.userInfoEndpoint).toBe('https://example.com/userinfo');
    expect(fetchMock).toHaveBeenCalledWith(
      'https://example.com/auth/.well-known/openid-configuration',
      expect.objectContaining({ method: 'GET' }),
    );

    vi.unstubAllGlobals();
  });
});

describe('resolveDiscoveryAsync', () => {
  it('passes a discovery document object straight through', async () => {
    const discovery = {
      authorizationEndpoint: 'https://example.com/authorize',
    };
    await expect(resolveDiscoveryAsync(discovery)).resolves.toBe(discovery);
  });

  it('rejects a non-string, non-object issuer', async () => {
    await expect(resolveDiscoveryAsync(42 as never)).rejects.toThrow(
      /Expected a valid discovery object or issuer URL/,
    );
  });
});
