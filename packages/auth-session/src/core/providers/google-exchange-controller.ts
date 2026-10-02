// The automatic code exchange of upstream's Google `useAuthRequest`, as a cell that follows the
// prompt result and swaps in the exchanged authentication once it arrives

import { createResourceController } from '@symbiote-native/engine';
import type { IAuthCell, ILoadableRequest } from '../auth-request-controllers';
import { createAuthCell } from '../auth-request-controllers';
import type { IAuthSessionResult } from '../auth-session.types';
import type { IAuthSessionParamsResult } from '../session-result';
import { isSuccessResult } from '../session-result';
import { AccessTokenRequest } from '../token-request';
import { discovery as googleDiscovery } from './google';
import type { IGoogleExchangeParams } from './provider-hook-setup';

type ICodeSource = Pick<ILoadableRequest, 'codeVerifier'>;
type IExchangeKey = {
  result: IAuthSessionResult | null;
  request: ICodeSource | null;
  exchange: IGoogleExchangeParams;
};
type IResultCell = ReturnType<typeof createAuthCell<IAuthSessionResult | null>>;
type IExchangeResource = { cell: IResultCell; stop: () => void };

// The result to exchange, or null when there is nothing to do: a code and no authentication yet,
// unless the caller decided explicitly
function exchangeableResult(
  result: IAuthSessionResult | null,
  override: boolean | undefined,
): IAuthSessionParamsResult | null {
  if (!isSuccessResult(result)) return null;
  const shouldExchange =
    override ?? (Boolean(result.params.code) && !result.authentication);
  return shouldExchange ? result : null;
}

// Trades the code for tokens and folds them into the result, as the hook does upstream
async function exchangeCode(
  toExchange: IAuthSessionParamsResult,
  request: ICodeSource | null,
  exchange: IGoogleExchangeParams,
): Promise<IAuthSessionResult> {
  const exchangeRequest = new AccessTokenRequest({
    clientId: exchange.clientId,
    clientSecret: exchange.clientSecret,
    redirectUri: exchange.redirectUri,
    scopes: exchange.scopes,
    code: toExchange.params.code ?? '',
    extraParams: { code_verifier: request?.codeVerifier || '' },
  });
  const authentication = await exchangeRequest.performAsync(googleDiscovery);
  return {
    ...toExchange,
    params: {
      id_token: authentication?.idToken || '',
      access_token: authentication.accessToken,
      ...toExchange.params,
    },
    authentication,
  };
}

function isSameKey(a: IExchangeKey, b: IExchangeKey): boolean {
  return (
    a.result === b.result &&
    a.request?.codeVerifier === b.request?.codeVerifier &&
    a.exchange.clientId === b.exchange.clientId &&
    a.exchange.redirectUri === b.exchange.redirectUri &&
    a.exchange.clientSecret === b.exchange.clientSecret &&
    a.exchange.shouldAutoExchangeCode === b.exchange.shouldAutoExchangeCode &&
    a.exchange.scopes?.join(',') === b.exchange.scopes?.join(',')
  );
}

export function createGoogleExchangeController(): {
  resolve: (
    result: IAuthSessionResult | null,
    request: ICodeSource | null,
    exchange: IGoogleExchangeParams,
  ) => IAuthCell<IAuthSessionResult | null>;
  flushDispose: () => void;
  dispose: () => void;
} {
  // The last published value stays visible while the next exchange runs
  let lastPublished: IAuthSessionResult | null = null;

  const controller = createResourceController<IExchangeKey, IExchangeResource>(
    ({ result, request, exchange }) => {
      let isMounted = true;
      const stop = (): void => {
        isMounted = false;
      };
      const toExchange = exchangeableResult(
        result,
        exchange.shouldAutoExchangeCode,
      );
      if (!toExchange) {
        lastPublished = result;
        return { cell: createAuthCell(result), stop };
      }
      const cell = createAuthCell<IAuthSessionResult | null>(lastPublished);
      void exchangeCode(toExchange, request, exchange).then(merged => {
        if (!isMounted) return;
        lastPublished = merged;
        cell.set(merged);
      });
      return { cell, stop };
    },
    resource => resource.stop(),
    isSameKey,
  );

  return {
    resolve: (result, request, exchange) =>
      controller.resolve({ result, request, exchange }).cell,
    flushDispose: controller.flushDispose,
    dispose: controller.dispose,
  };
}
