// React twins of `expo-auth-session`'s auth request hooks. The load, prompt and code-exchange
// logic is the shared controllers in `core/`, React only supplies the lifecycle

import {
  createEventValueHook,
  createResourceHook,
} from '@symbiote-native/react';
import {
  AUTH_CELL_CHANGE,
  AuthRequest,
  FacebookAuthRequest,
  GoogleAuthRequest,
  createAutoDiscoveryController,
  createGoogleExchangeController,
  createLoadedRequestController,
  createRequestResultController,
  facebookDiscovery,
  googleDiscovery,
  resolveFacebookRequestSetup,
  resolveGoogleRequestSetup,
  toGoogleIdTokenConfig,
} from '../core';
import type {
  IAuthCell,
  IAuthRequestClass,
  IAuthRequestConfig,
  IAuthRequestPromptOptions,
  IAuthSessionRedirectUriOptions,
  IAuthSessionResult,
  IDiscoveryDocument,
  IFacebookAuthRequestConfig,
  IGoogleAuthRequestConfig,
  IIssuerOrDiscovery,
  IPromptMethod,
} from '../core';

type IDiscoveryValue = IDiscoveryDocument | null;
type IResultValue = IAuthSessionResult | null;

export type IUseAuthRequestResult<TRequest extends AuthRequest = AuthRequest> =
  readonly [TRequest | null, IResultValue, IPromptMethod];

function readAuthCell<T>(cell: IAuthCell<T>): T {
  return cell.getSnapshot();
}

const useDiscoveryCell = createResourceHook(createAutoDiscoveryController);
const useLoadedCell = createResourceHook(() =>
  createLoadedRequestController<AuthRequest>(),
);
const useResultHolder = createResourceHook(createRequestResultController);
const useExchangeCell = createResourceHook(createGoogleExchangeController);
const useDiscoveryValue = createEventValueHook<
  IAuthCell<IDiscoveryValue>,
  IDiscoveryValue,
  typeof AUTH_CELL_CHANGE
>(AUTH_CELL_CHANGE, readAuthCell);
const useRequestValue = createEventValueHook<
  IAuthCell<AuthRequest | null>,
  AuthRequest | null,
  typeof AUTH_CELL_CHANGE
>(AUTH_CELL_CHANGE, readAuthCell);
const useResultValue = createEventValueHook<
  IAuthCell<IResultValue>,
  IResultValue,
  typeof AUTH_CELL_CHANGE
>(AUTH_CELL_CHANGE, readAuthCell);

/** React twin of `useAutoDiscovery`, `null` until the discovery document has loaded */
export function useAutoDiscovery(
  issuerOrDiscovery: IIssuerOrDiscovery,
): IDiscoveryValue {
  return useDiscoveryValue(useDiscoveryCell(issuerOrDiscovery));
}

/** React twin of `useLoadedAuthRequest`, `null` until the request url has loaded */
export function useLoadedAuthRequest(
  config: IAuthRequestConfig,
  discovery: IDiscoveryValue,
  RequestClass: IAuthRequestClass<AuthRequest>,
): AuthRequest | null {
  return useRequestValue(useLoadedCell(config, discovery, RequestClass));
}

/** React twin of `useAuthRequestResult`, the result and the prompt method */
export function useAuthRequestResult(
  request: AuthRequest | null,
  discovery: IDiscoveryValue,
  customOptions: IAuthRequestPromptOptions = {},
): readonly [IResultValue, IPromptMethod] {
  const holder = useResultHolder(request, discovery, customOptions);
  return [useResultValue(holder.result), holder.promptAsync];
}

/** React twin of `useAuthRequest`: the loaded request, the result and the prompt method */
export function useAuthRequest(
  config: IAuthRequestConfig,
  discovery: IDiscoveryValue,
): IUseAuthRequestResult {
  const request = useLoadedAuthRequest(config, discovery, AuthRequest);
  const [result, promptAsync] = useAuthRequestResult(request, discovery);
  return [request, result, promptAsync];
}

/** React twin of Google's `useAuthRequest`, exchanges the code for a token by default */
export function useGoogleAuthRequest(
  config: Partial<IGoogleAuthRequestConfig> = {},
  redirectUriOptions: Partial<IAuthSessionRedirectUriOptions> = {},
): IUseAuthRequestResult<GoogleAuthRequest> {
  const { requestConfig, exchange } = resolveGoogleRequestSetup(
    config,
    redirectUriOptions,
  );
  const request = useLoadedAuthRequest(
    requestConfig,
    googleDiscovery,
    GoogleAuthRequest,
  );
  const [result, promptAsync] = useAuthRequestResult(request, googleDiscovery);
  const fullResult = useResultValue(useExchangeCell(result, request, exchange));
  return [request, fullResult, promptAsync];
}

/** React twin of Google's `useIdTokenAuthRequest`, the id token is in `params.id_token` */
export function useGoogleIdTokenAuthRequest(
  config: Partial<IGoogleAuthRequestConfig>,
  redirectUriOptions: Partial<IAuthSessionRedirectUriOptions> = {},
): IUseAuthRequestResult<GoogleAuthRequest> {
  return useGoogleAuthRequest(
    toGoogleIdTokenConfig(config),
    redirectUriOptions,
  );
}

/** React twin of Facebook's `useAuthRequest` */
export function useFacebookAuthRequest(
  config: Partial<IFacebookAuthRequestConfig> = {},
  redirectUriOptions: Partial<IAuthSessionRedirectUriOptions> = {},
): IUseAuthRequestResult<FacebookAuthRequest> {
  const requestConfig = resolveFacebookRequestSetup(config, redirectUriOptions);
  const request = useLoadedAuthRequest(
    requestConfig,
    facebookDiscovery,
    FacebookAuthRequest,
  );
  const [result, promptAsync] = useAuthRequestResult(
    request,
    facebookDiscovery,
  );
  return [request, result, promptAsync];
}
