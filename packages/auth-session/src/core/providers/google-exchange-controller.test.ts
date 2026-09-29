import { describe, expect, it, vi } from 'vitest';
import type { IAuthSessionResult } from '../auth-session.types';

const performAsync = vi.fn();
const accessTokenRequestConfigs: unknown[] = [];
vi.mock('../token-request', () => ({
  AccessTokenRequest: class {
    constructor(config: unknown) {
      accessTokenRequestConfigs.push(config);
    }
    performAsync = performAsync;
  },
}));
vi.mock('./google', () => ({
  discovery: { authorizationEndpoint: 'https://google/auth' },
}));

const { createGoogleExchangeController } =
  await import('./google-exchange-controller');

const EXCHANGE = {
  clientId: 'client',
  clientSecret: undefined,
  redirectUri: 'app://cb',
  scopes: ['openid'],
  shouldAutoExchangeCode: undefined,
};
const REQUEST = { codeVerifier: 'verifier' };
const flush = (): Promise<void> =>
  new Promise(resolve => setTimeout(resolve, 0));

function success(params: Record<string, string>): IAuthSessionResult {
  return {
    type: 'success',
    errorCode: null,
    params,
    authentication: null,
    url: 'app://cb',
  };
}

describe('createGoogleExchangeController', () => {
  it('passes a result through untouched when there is no code to exchange', () => {
    const controller = createGoogleExchangeController();
    const result = success({ access_token: 'token' });
    expect(controller.resolve(result, REQUEST, EXCHANGE).getSnapshot()).toBe(
      result,
    );
    expect(performAsync).not.toHaveBeenCalled();
  });

  it('exchanges the code and publishes the merged authentication', async () => {
    performAsync.mockResolvedValue({ accessToken: 'access', idToken: 'id' });
    const controller = createGoogleExchangeController();
    const result = success({ code: 'abc' });
    const cell = controller.resolve(result, REQUEST, EXCHANGE);
    await flush();
    expect(accessTokenRequestConfigs.at(-1)).toEqual({
      clientId: 'client',
      clientSecret: undefined,
      redirectUri: 'app://cb',
      scopes: ['openid'],
      code: 'abc',
      extraParams: { code_verifier: 'verifier' },
    });
    expect(cell.getSnapshot()).toEqual({
      ...result,
      params: { id_token: 'id', access_token: 'access', code: 'abc' },
      authentication: { accessToken: 'access', idToken: 'id' },
    });
  });

  it('honours an explicit shouldAutoExchangeCode of false', async () => {
    performAsync.mockClear();
    const controller = createGoogleExchangeController();
    const result = success({ code: 'abc' });
    const cell = controller.resolve(result, REQUEST, {
      ...EXCHANGE,
      shouldAutoExchangeCode: false,
    });
    await flush();
    expect(performAsync).not.toHaveBeenCalled();
    expect(cell.getSnapshot()).toBe(result);
  });

  it('keeps the same cell while the result and exchange inputs are unchanged', () => {
    const controller = createGoogleExchangeController();
    const result = success({ access_token: 'token' });
    const first = controller.resolve(result, REQUEST, EXCHANGE);
    expect(controller.resolve(result, REQUEST, { ...EXCHANGE })).toBe(first);
  });

  it('ignores an exchange that finishes after dispose', async () => {
    performAsync.mockResolvedValue({ accessToken: 'late' });
    const controller = createGoogleExchangeController();
    const cell = controller.resolve(
      success({ code: 'abc' }),
      REQUEST,
      EXCHANGE,
    );
    controller.dispose();
    await flush();
    expect(cell.getSnapshot()).toBeNull();
  });

  it('has nothing to show before any prompt result exists', () => {
    const controller = createGoogleExchangeController();
    expect(controller.resolve(null, null, EXCHANGE).getSnapshot()).toBeNull();
  });
});
