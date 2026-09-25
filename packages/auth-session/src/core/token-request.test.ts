import { describe, expect, it } from 'vitest';
import {
  AccessTokenRequest,
  RefreshTokenRequest,
  RevokeTokenRequest,
  TokenResponse,
  getCurrentTimeInSeconds,
} from './token-request';
import { TokenTypeHint } from './token-request.types';

const extraTestHeaders = Object.freeze({
  'my-tx-id': 'some-tx-id',
  otherTxId: 'other-tx-id',
  'Content-Type': "this won't apply",
  'content-type': "this won't apply either (headers are case-insensitive)",
});

describe('AccessTokenRequest', () => {
  it('creates a token exchange request', () => {
    const request = new AccessTokenRequest({
      code: 'bacon-some-code',
      redirectUri: 'bcn://oauth',
      clientId: 'my-client_id',
      scopes: ['test', 'value'],
    });
    expect(request.getQueryBody()).toStrictEqual({
      client_id: 'my-client_id',
      code: 'bacon-some-code',
      grant_type: 'authorization_code',
      redirect_uri: 'bcn://oauth',
      scope: 'test value',
    });
    expect(request.getRequestConfig()).toStrictEqual({
      clientId: 'my-client_id',
      code: 'bacon-some-code',
      grantType: 'authorization_code',
      redirectUri: 'bcn://oauth',
      scopes: ['test', 'value'],
      clientSecret: undefined,
      extraParams: undefined,
      extraHeaders: undefined,
    });
    expect(request.getHeaders()).toStrictEqual({
      'Content-Type': 'application/x-www-form-urlencoded',
    });
  });

  it('generates a fake Authorization header when the client secret is an empty string', () => {
    const request = new AccessTokenRequest({
      code: 'bacon-some-code',
      clientSecret: '',
      redirectUri: 'bcn://oauth',
      clientId: 'my-client_id',
    });
    expect(request.getHeaders()).toStrictEqual({
      Authorization: 'Basic bXktY2xpZW50X2lkOg==',
      'Content-Type': 'application/x-www-form-urlencoded',
    });
  });

  it('creates a token exchange request with a client secret', () => {
    const request = new AccessTokenRequest({
      code: 'bacon-some-code',
      clientSecret: 'secret',
      redirectUri: 'bcn://oauth',
      clientId: 'my-client_id',
    });
    expect(request.getQueryBody()).toStrictEqual({
      code: 'bacon-some-code',
      grant_type: 'authorization_code',
      redirect_uri: 'bcn://oauth',
    });
    expect(request.getHeaders()).toStrictEqual({
      Authorization: 'Basic bXktY2xpZW50X2lkOnNlY3JldA==',
      'Content-Type': 'application/x-www-form-urlencoded',
    });
  });

  it('creates a token exchange request with extra headers set', () => {
    const request = new AccessTokenRequest({
      code: 'odjie-some-code',
      redirectUri: 'bcn://oauth',
      clientId: 'my-client_id',
      extraHeaders: extraTestHeaders,
    });
    expect(request.getRequestConfig()).toStrictEqual({
      clientId: 'my-client_id',
      clientSecret: undefined,
      code: 'odjie-some-code',
      extraHeaders: { 'my-tx-id': 'some-tx-id', otherTxId: 'other-tx-id' },
      extraParams: undefined,
      grantType: 'authorization_code',
      redirectUri: 'bcn://oauth',
      scopes: undefined,
    });
    expect(request.getHeaders()).toStrictEqual({
      'Content-Type': 'application/x-www-form-urlencoded',
      'my-tx-id': 'some-tx-id',
      otherTxId: 'other-tx-id',
    });
  });

  it('throws when a discovery does not contain a tokenEndpoint', async () => {
    const request = new AccessTokenRequest({
      code: 'bacon-some-code',
      redirectUri: 'bcn://oauth',
      clientId: 'my-client_id',
    });
    await expect(
      request.performAsync({ tokenEndpoint: undefined }),
    ).rejects.toThrow('without a valid tokenEndpoint');
  });
});

describe('RefreshTokenRequest', () => {
  it('creates a token refresh request', () => {
    const request = new RefreshTokenRequest({
      refreshToken: 'refresh-token',
      clientId: 'my-client_id',
      scopes: ['test', 'value'],
      extraParams: { batman: 'and-robin' },
      extraHeaders: extraTestHeaders,
    });
    expect(request.getQueryBody()).toStrictEqual({
      client_id: 'my-client_id',
      grant_type: 'refresh_token',
      refresh_token: 'refresh-token',
      scope: 'test value',
      batman: 'and-robin',
    });
    expect(request.getRequestConfig()).toStrictEqual({
      clientId: 'my-client_id',
      grantType: 'refresh_token',
      refreshToken: 'refresh-token',
      scopes: ['test', 'value'],
      clientSecret: undefined,
      extraParams: { batman: 'and-robin' },
      extraHeaders: { 'my-tx-id': 'some-tx-id', otherTxId: 'other-tx-id' },
    });
    expect(request.getHeaders()).toStrictEqual({
      'Content-Type': 'application/x-www-form-urlencoded',
      'my-tx-id': 'some-tx-id',
      otherTxId: 'other-tx-id',
    });
  });

  it('throws when a discovery does not contain a tokenEndpoint', async () => {
    const request = new RefreshTokenRequest({
      refreshToken: 'refresh-token',
      clientId: 'my-client_id',
      scopes: ['test', 'value'],
    });
    await expect(
      request.performAsync({ tokenEndpoint: undefined }),
    ).rejects.toThrow('without a valid tokenEndpoint');
  });
});

describe('RevokeTokenRequest', () => {
  it('creates a token revocation request', () => {
    const request = new RevokeTokenRequest({
      token: 'my-token',
      tokenTypeHint: TokenTypeHint.AccessToken,
      clientId: 'my-client_id',
      scopes: ['test', 'value'],
      extraHeaders: extraTestHeaders,
    });
    expect(request.getQueryBody()).toStrictEqual({
      client_id: 'my-client_id',
      token: 'my-token',
      token_type_hint: 'access_token',
    });
    expect(request.getRequestConfig()).toStrictEqual({
      clientId: 'my-client_id',
      clientSecret: undefined,
      token: 'my-token',
      tokenTypeHint: 'access_token',
      extraHeaders: { 'my-tx-id': 'some-tx-id', otherTxId: 'other-tx-id' },
    });
    expect(request.getHeaders()).toStrictEqual({
      'Content-Type': 'application/x-www-form-urlencoded',
      'my-tx-id': 'some-tx-id',
      otherTxId: 'other-tx-id',
    });
  });

  it('creates a token revocation request with a client secret', () => {
    const request = new RevokeTokenRequest({
      token: 'my-token',
      tokenTypeHint: TokenTypeHint.AccessToken,
      clientId: 'my-client_id',
      clientSecret: 'my-client_secret',
      extraHeaders: { authorization: 'attempt-to-overwrite-auth-is-ignored' },
    });
    expect(request.getQueryBody()).toStrictEqual({
      client_id: 'my-client_id',
      client_secret: 'my-client_secret',
      token: 'my-token',
      token_type_hint: 'access_token',
    });
    expect(request.getHeaders()).toStrictEqual({
      Authorization: 'Basic bXktY2xpZW50X2lkOm15LWNsaWVudF9zZWNyZXQ=',
      'Content-Type': 'application/x-www-form-urlencoded',
    });
  });

  it('throws when a discovery does not contain a revocationEndpoint', async () => {
    const request = new RevokeTokenRequest({
      token: 'my-token',
      tokenTypeHint: TokenTypeHint.AccessToken,
      clientId: 'my-client_id',
    });
    await expect(
      request.performAsync({ revocationEndpoint: undefined }),
    ).rejects.toThrow('without a valid revocationEndpoint');
  });
});

describe('TokenResponse', () => {
  it('can always refresh when no expiresIn attribute was provided', () => {
    const tenMinsAgo = getCurrentTimeInSeconds() - 3600;
    const freshToken = new TokenResponse({
      accessToken: '',
      issuedAt: tenMinsAgo,
    });
    expect(TokenResponse.isTokenFresh(freshToken)).toBe(true);
  });

  it('supports reading non-spec fields via rawResponse', () => {
    const rawResponse = {
      access_token: 'access-token',
      refresh_token_expires_in: 525_600,
    };
    const response = new TokenResponse(
      { accessToken: rawResponse.access_token },
      rawResponse,
    );
    expect(response.rawResponse).toBe(rawResponse);
  });

  it('knows a token is not fresh', () => {
    const fiveMins = 1800;
    const tenMinsAgo = getCurrentTimeInSeconds() - 3600;
    const freshToken = new TokenResponse({
      accessToken: '',
      issuedAt: tenMinsAgo,
      expiresIn: fiveMins,
    });
    expect(TokenResponse.isTokenFresh(freshToken, 0)).toBe(false);
  });
});
