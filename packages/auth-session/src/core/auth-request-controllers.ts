// Framework-agnostic halves of `useAutoDiscovery`, `useLoadedAuthRequest` and
// `useAuthRequestResult`. Each controller binds to an adapter's `createResourceHook`, and the value
// it hands back is a cell the adapter follows with its `createEventValueHook`

import type { IEventValueSource } from '@symbiote-native/engine';
import { createResourceController } from '@symbiote-native/engine';
import type {
  IAuthDiscoveryDocument,
  IAuthRequestConfig,
  IAuthRequestPromptOptions,
} from './auth-request.types';
import type { IAuthSessionResult } from './auth-session.types';
import type { IDiscoveryDocument, IIssuerOrDiscovery } from './discovery';
import { resolveDiscoveryAsync } from './discovery';
import { createPromptString } from './prompt-string';

export const AUTH_CELL_CHANGE = 'change';

export type IAuthCell<T> = IEventValueSource<T, typeof AUTH_CELL_CHANGE> & {
  getSnapshot: () => T;
};

type IWritableAuthCell<T> = IAuthCell<T> & { set: (value: T) => void };

export function createAuthCell<T>(initial: T): IWritableAuthCell<T> {
  let value = initial;
  const listeners = new Set<(next: T) => void>();
  return {
    getSnapshot: () => value,
    set(next) {
      value = next;
      for (const listener of [...listeners]) listener(next);
    },
    addListener(_event, listener) {
      listeners.add(listener);
      return { remove: () => void listeners.delete(listener) };
    },
  };
}

/** What a request has to offer for a hook to load it and prompt with it */
export type ILoadableRequest = {
  url: string | null;
  codeVerifier?: string;
  makeAuthUrlAsync: (discovery: IAuthDiscoveryDocument) => Promise<string>;
  promptAsync: (
    discovery: IAuthDiscoveryDocument,
    options?: IAuthRequestPromptOptions,
  ) => Promise<IAuthSessionResult>;
};

export type IAuthRequestClass<TRequest extends ILoadableRequest> = new (
  config: IAuthRequestConfig,
) => TRequest;

type ICellResourceController<TArgs extends unknown[], TValue> = {
  resolve: (...args: TArgs) => IAuthCell<TValue>;
  flushDispose: () => void;
  dispose: () => void;
};

type IAutoDiscoveryResource = {
  cell: IWritableAuthCell<IDiscoveryDocument | null>;
  stop: () => void;
};

export function createAutoDiscoveryController(): ICellResourceController<
  [IIssuerOrDiscovery],
  IDiscoveryDocument | null
> {
  const controller = createResourceController<
    IIssuerOrDiscovery,
    IAutoDiscoveryResource
  >(
    issuerOrDiscovery => {
      const cell = createAuthCell<IDiscoveryDocument | null>(null);
      let isAllowed = true;
      void resolveDiscoveryAsync(issuerOrDiscovery).then(discovery => {
        if (isAllowed) cell.set(discovery);
      });
      return {
        cell,
        stop: () => {
          isAllowed = false;
        },
      };
    },
    resource => resource.stop(),
  );
  return {
    resolve: issuerOrDiscovery => controller.resolve(issuerOrDiscovery).cell,
    flushDispose: controller.flushDispose,
    dispose: controller.dispose,
  };
}

// Everything upstream lists as the effect's dependencies, folded to primitives
function loadedRequestKey(
  config: IAuthRequestConfig,
  discovery: IDiscoveryDocument | null,
): string {
  return JSON.stringify([
    discovery?.authorizationEndpoint,
    config.clientId,
    config.redirectUri,
    config.responseType,
    config.clientSecret,
    config.codeChallenge,
    config.state,
    config.usePKCE,
    config.scopes?.join(' '),
    createPromptString(config.prompt),
    JSON.stringify(config.extraParams ?? {}),
  ]);
}

type ILoadedRequestKey = {
  key: string;
  config: IAuthRequestConfig;
  discovery: IDiscoveryDocument | null;
};

type ILoadedRequestResource<TRequest extends ILoadableRequest> = {
  cell: IWritableAuthCell<TRequest | null>;
  stop: () => void;
};

export function createLoadedRequestController<
  TRequest extends ILoadableRequest = ILoadableRequest,
>(): {
  resolve: (
    config: IAuthRequestConfig,
    discovery: IDiscoveryDocument | null,
    RequestClass: IAuthRequestClass<TRequest>,
  ) => IAuthCell<TRequest | null>;
  flushDispose: () => void;
  dispose: () => void;
} {
  // The request that finished loading last, shown while a changed config reloads
  let lastLoaded: TRequest | null = null;
  let RequestClassInUse: IAuthRequestClass<TRequest> | null = null;

  const controller = createResourceController<
    ILoadedRequestKey,
    ILoadedRequestResource<TRequest>
  >(
    ({ config, discovery }) => {
      const cell = createAuthCell<TRequest | null>(lastLoaded);
      let isMounted = true;
      if (discovery && RequestClassInUse) {
        const request = new RequestClassInUse(config);
        void request.makeAuthUrlAsync(discovery).then(() => {
          if (!isMounted) return;
          lastLoaded = request;
          cell.set(request);
        });
      }
      return {
        cell,
        stop: () => {
          isMounted = false;
        },
      };
    },
    resource => resource.stop(),
    (a, b) => a.key === b.key,
  );

  return {
    resolve(config, discovery, RequestClass) {
      RequestClassInUse = RequestClass;
      return controller.resolve({
        key: loadedRequestKey(config, discovery),
        config,
        discovery,
      }).cell;
    },
    flushDispose: controller.flushDispose,
    dispose: controller.dispose,
  };
}

export type IPromptMethod = (
  options?: IAuthRequestPromptOptions,
) => Promise<IAuthSessionResult>;

export type IRequestResultHolder = {
  result: IAuthCell<IAuthSessionResult | null>;
  promptAsync: IPromptMethod;
};

export function createRequestResultController(): {
  resolve: (
    request: ILoadableRequest | null,
    discovery: IDiscoveryDocument | null,
    customOptions?: IAuthRequestPromptOptions,
  ) => IRequestResultHolder;
  flushDispose: () => void;
  dispose: () => void;
} {
  const result = createAuthCell<IAuthSessionResult | null>(null);
  let latest: {
    request: ILoadableRequest | null;
    discovery: IDiscoveryDocument | null;
    customOptions: IAuthRequestPromptOptions;
  } = { request: null, discovery: null, customOptions: {} };

  // Reads the latest inputs when called, so one stable function serves every render
  const promptAsync: IPromptMethod = async (options = {}) => {
    const { request, discovery, customOptions } = latest;
    if (!discovery || !request) {
      throw new Error(
        'Cannot prompt to authenticate until the request has finished loading.',
      );
    }
    const prompted = await request.promptAsync(discovery, {
      ...customOptions,
      ...options,
    });
    result.set(prompted);
    return prompted;
  };
  const holder: IRequestResultHolder = { result, promptAsync };

  return {
    resolve(request, discovery, customOptions = {}) {
      latest = { request, discovery, customOptions };
      return holder;
    },
    flushDispose: () => undefined,
    dispose: () => undefined,
  };
}
