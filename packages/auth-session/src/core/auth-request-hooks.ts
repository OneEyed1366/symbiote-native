// The auth request hooks written once for every adapter whose hooks take getters (Vue, Solid,
// Svelte, Angular), React keeps its own wiring. An adapter's boxes (`ShallowRef`, `Accessor`,
// `{ current }`, `Signal`) are type-level functions here, since one hook returns several box types

import { AuthRequest } from './auth-request';
import type {
  IAuthCell,
  IAuthRequestClass,
  IPromptMethod,
} from './auth-request-controllers';
import {
  AUTH_CELL_CHANGE,
  createAutoDiscoveryController,
  createLoadedRequestController,
  createRequestResultController,
} from './auth-request-controllers';
import type {
  IAuthRequestConfig,
  IAuthRequestPromptOptions,
} from './auth-request.types';
import type {
  IAuthSessionRedirectUriOptions,
  IAuthSessionResult,
} from './auth-session.types';
import type { IDiscoveryDocument, IIssuerOrDiscovery } from './discovery';
import type {
  FacebookAuthRequest,
  IFacebookAuthRequestConfig,
} from './providers/facebook';
import {
  discovery as facebookDiscovery,
  FacebookAuthRequest as FacebookRequest,
} from './providers/facebook';
import { createGoogleExchangeController } from './providers/google-exchange-controller';
import type {
  GoogleAuthRequest,
  IGoogleAuthRequestConfig,
} from './providers/google';
import {
  discovery as googleDiscovery,
  GoogleAuthRequest as GoogleRequest,
} from './providers/google';
import {
  resolveFacebookRequestSetup,
  resolveGoogleRequestSetup,
  toGoogleIdTokenConfig,
} from './providers/provider-hook-setup';

/** A type-level function, how an adapter says "its box of `T`" */
export interface IHkt {
  readonly input: unknown;
  readonly output: unknown;
}
export type IApply<F extends IHkt, T> = (F & { readonly input: T })['output'];

/** A plain getter, the argument shape of Solid, Svelte and Angular */
export interface IGetterKind extends IHkt {
  readonly output: () => this['input'];
}

type IBoxed<T> = { readonly current: T };

/** A `{ current }` box, Svelte's result shape */
export interface IBoxedKind extends IHkt {
  readonly output: IBoxed<this['input']>;
}

/** The argument half of a kit for adapters whose arguments are plain getters */
export const GETTER_ARGS = {
  toGetter: <T>(arg: () => T): (() => T) => arg,
  constant:
    <T>(value: T): (() => T) =>
    () =>
      value,
};

type IDiscoveryValue = IDiscoveryDocument | null;
type IResultValue = IAuthSessionResult | null;

export type IAuthResourceController<TArgs extends unknown[], TResource> = {
  resolve: (...args: TArgs) => TResource;
  flushDispose: () => void;
  dispose: () => void;
};

/** The adapter's own primitives the hooks are built from */
export type IAuthHooksKit<
  FResource extends IHkt,
  FValue extends IHkt,
  FArg extends IHkt,
> = {
  createResourceHook: <TArgs extends unknown[], TResource>(
    createController: () => IAuthResourceController<TArgs, TResource>,
  ) => (getArgs: () => TArgs) => IApply<FResource, TResource>;
  readResource: <T>(box: IApply<FResource, T>) => T;
  createEventValueHook: <TValue>(
    event: typeof AUTH_CELL_CHANGE,
    getValue: (source: IAuthCell<TValue>) => TValue,
  ) => (getSource: () => IAuthCell<TValue>) => IApply<FValue, TValue>;
  readValue: <T>(box: IApply<FValue, T>) => T;
  /** Turns whatever the adapter accepts as an argument into a getter */
  toGetter: <T>(arg: IApply<FArg, T>) => () => T;
  /** Wraps a fixed value in the adapter's argument shape */
  constant: <T>(value: T) => IApply<FArg, T>;
};

type IUseAuthRequestBoxes<
  FValue extends IHkt,
  TRequest extends AuthRequest,
> = readonly [
  IApply<FValue, TRequest | null>,
  IApply<FValue, IResultValue>,
  IPromptMethod,
];

type IAnyKit = IAuthHooksKit<IHkt, IHkt, IHkt>;

function readAuthCell<T>(cell: IAuthCell<T>): T {
  return cell.getSnapshot();
}

function valueHook<
  FResource extends IHkt,
  FValue extends IHkt,
  FArg extends IHkt,
  T,
>(
  kit: IAuthHooksKit<FResource, FValue, FArg>,
): (getSource: () => IAuthCell<T>) => IApply<FValue, T> {
  return kit.createEventValueHook<T>(AUTH_CELL_CHANGE, readAuthCell);
}

function discoveryOf<
  FResource extends IHkt,
  FValue extends IHkt,
  FArg extends IHkt,
>(
  kit: IAuthHooksKit<FResource, FValue, FArg>,
  getIssuer: () => IIssuerOrDiscovery,
): IApply<FValue, IDiscoveryValue> {
  const cell = kit.createResourceHook(createAutoDiscoveryController)(() => [
    getIssuer(),
  ]);
  return valueHook<FResource, FValue, FArg, IDiscoveryValue>(kit)(() =>
    kit.readResource(cell),
  );
}

function loadedRequestOf<
  FResource extends IHkt,
  FValue extends IHkt,
  FArg extends IHkt,
  TRequest extends AuthRequest,
>(
  kit: IAuthHooksKit<FResource, FValue, FArg>,
  getConfig: () => IAuthRequestConfig,
  getDiscovery: () => IDiscoveryValue,
  RequestClass: IAuthRequestClass<TRequest>,
): IApply<FValue, TRequest | null> {
  const useCell = kit.createResourceHook(() =>
    createLoadedRequestController<TRequest>(),
  );
  const cell = useCell(() => [getConfig(), getDiscovery(), RequestClass]);
  return valueHook<FResource, FValue, FArg, TRequest | null>(kit)(() =>
    kit.readResource(cell),
  );
}

function resultOf<
  FResource extends IHkt,
  FValue extends IHkt,
  FArg extends IHkt,
>(
  kit: IAuthHooksKit<FResource, FValue, FArg>,
  getRequest: () => AuthRequest | null,
  getDiscovery: () => IDiscoveryValue,
  getOptions: () => IAuthRequestPromptOptions,
): readonly [IApply<FValue, IResultValue>, IPromptMethod] {
  const useHolder = kit.createResourceHook(createRequestResultController);
  const holder = useHolder(() => [getRequest(), getDiscovery(), getOptions()]);
  const result = valueHook<FResource, FValue, FArg, IResultValue>(kit)(
    () => kit.readResource(holder).result,
  );
  return [result, options => kit.readResource(holder).promptAsync(options)];
}

function baseRequestOf<
  FResource extends IHkt,
  FValue extends IHkt,
  FArg extends IHkt,
>(
  kit: IAuthHooksKit<FResource, FValue, FArg>,
  getConfig: () => IAuthRequestConfig,
  getDiscovery: () => IDiscoveryValue,
): IUseAuthRequestBoxes<FValue, AuthRequest> {
  const request = loadedRequestOf(kit, getConfig, getDiscovery, AuthRequest);
  const [result, promptAsync] = resultOf(
    kit,
    () => kit.readValue(request),
    getDiscovery,
    () => ({}),
  );
  return [request, result, promptAsync];
}

function googleRequestOf<
  FResource extends IHkt,
  FValue extends IHkt,
  FArg extends IHkt,
>(
  kit: IAuthHooksKit<FResource, FValue, FArg>,
  getConfig: () => Partial<IGoogleAuthRequestConfig>,
  getRedirectUriOptions: () => Partial<IAuthSessionRedirectUriOptions>,
): IUseAuthRequestBoxes<FValue, GoogleAuthRequest> {
  const getSetup = (): ReturnType<typeof resolveGoogleRequestSetup> =>
    resolveGoogleRequestSetup(getConfig(), getRedirectUriOptions());
  const request = loadedRequestOf(
    kit,
    () => getSetup().requestConfig,
    () => googleDiscovery,
    GoogleRequest,
  );
  const [result, promptAsync] = resultOf(
    kit,
    () => kit.readValue(request),
    () => googleDiscovery,
    () => ({}),
  );
  const useExchange = kit.createResourceHook(createGoogleExchangeController);
  const exchanged = useExchange(() => [
    kit.readValue(result),
    kit.readValue(request),
    getSetup().exchange,
  ]);
  const fullResult = valueHook<FResource, FValue, FArg, IResultValue>(kit)(() =>
    kit.readResource(exchanged),
  );
  return [request, fullResult, promptAsync];
}

function facebookRequestOf<
  FResource extends IHkt,
  FValue extends IHkt,
  FArg extends IHkt,
>(
  kit: IAuthHooksKit<FResource, FValue, FArg>,
  getConfig: () => Partial<IFacebookAuthRequestConfig>,
  getRedirectUriOptions: () => Partial<IAuthSessionRedirectUriOptions>,
): IUseAuthRequestBoxes<FValue, FacebookAuthRequest> {
  const request = loadedRequestOf(
    kit,
    () => resolveFacebookRequestSetup(getConfig(), getRedirectUriOptions()),
    () => facebookDiscovery,
    FacebookRequest,
  );
  const [result, promptAsync] = resultOf(
    kit,
    () => kit.readValue(request),
    () => facebookDiscovery,
    () => ({}),
  );
  return [request, result, promptAsync];
}

export type IAuthRequestHooks<FValue extends IHkt, FArg extends IHkt> = {
  useAutoDiscovery: (
    issuerOrDiscovery: IApply<FArg, IIssuerOrDiscovery>,
  ) => IApply<FValue, IDiscoveryValue>;
  useLoadedAuthRequest: (
    config: IApply<FArg, IAuthRequestConfig>,
    discovery: IApply<FArg, IDiscoveryValue>,
    RequestClass: IAuthRequestClass<AuthRequest>,
  ) => IApply<FValue, AuthRequest | null>;
  useAuthRequestResult: (
    request: IApply<FArg, AuthRequest | null>,
    discovery: IApply<FArg, IDiscoveryValue>,
    customOptions?: IApply<FArg, IAuthRequestPromptOptions>,
  ) => readonly [IApply<FValue, IResultValue>, IPromptMethod];
  useAuthRequest: (
    config: IApply<FArg, IAuthRequestConfig>,
    discovery: IApply<FArg, IDiscoveryValue>,
  ) => IUseAuthRequestBoxes<FValue, AuthRequest>;
  useGoogleAuthRequest: (
    config?: IApply<FArg, Partial<IGoogleAuthRequestConfig>>,
    redirectUriOptions?: IApply<FArg, Partial<IAuthSessionRedirectUriOptions>>,
  ) => IUseAuthRequestBoxes<FValue, GoogleAuthRequest>;
  useGoogleIdTokenAuthRequest: (
    config: IApply<FArg, Partial<IGoogleAuthRequestConfig>>,
    redirectUriOptions?: IApply<FArg, Partial<IAuthSessionRedirectUriOptions>>,
  ) => IUseAuthRequestBoxes<FValue, GoogleAuthRequest>;
  useFacebookAuthRequest: (
    config?: IApply<FArg, Partial<IFacebookAuthRequestConfig>>,
    redirectUriOptions?: IApply<FArg, Partial<IAuthSessionRedirectUriOptions>>,
  ) => IUseAuthRequestBoxes<FValue, FacebookAuthRequest>;
};

export function createAuthRequestHooks<
  FResource extends IHkt,
  FValue extends IHkt,
  FArg extends IHkt,
>(
  kit: IAuthHooksKit<FResource, FValue, FArg>,
): IAuthRequestHooks<FValue, FArg> {
  const noOptions = kit.constant<Partial<IAuthSessionRedirectUriOptions>>({});
  return {
    useAutoDiscovery: issuer => discoveryOf(kit, kit.toGetter(issuer)),
    useLoadedAuthRequest: (config, discovery, RequestClass) =>
      loadedRequestOf(
        kit,
        kit.toGetter(config),
        kit.toGetter(discovery),
        RequestClass,
      ),
    useAuthRequestResult: (
      request,
      discovery,
      customOptions = kit.constant({}),
    ) =>
      resultOf(
        kit,
        kit.toGetter(request),
        kit.toGetter(discovery),
        kit.toGetter(customOptions),
      ),
    useAuthRequest: (config, discovery) =>
      baseRequestOf(kit, kit.toGetter(config), kit.toGetter(discovery)),
    useGoogleAuthRequest: (config = kit.constant({}), redirect = noOptions) =>
      googleRequestOf(kit, kit.toGetter(config), kit.toGetter(redirect)),
    useGoogleIdTokenAuthRequest: (config, redirect = noOptions) => {
      const getConfig = kit.toGetter(config);
      return googleRequestOf(
        kit,
        () => toGoogleIdTokenConfig(getConfig()),
        kit.toGetter(redirect),
      );
    },
    useFacebookAuthRequest: (config = kit.constant({}), redirect = noOptions) =>
      facebookRequestOf(kit, kit.toGetter(config), kit.toGetter(redirect)),
  };
}

export type { IAnyKit as IAuthHooksAnyKit };
