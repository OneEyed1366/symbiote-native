// Shared core of the Linking module: everything that does NOT differ by platform:
// the public contract, the lazy native-module resolver, the `url` device-event
// subscription, URL validation, and payload narrowing. The per-platform files
// (linking.ios.ts / linking.android.ts) supply ONLY what genuinely diverges (the
// native module NAME and the `sendIntent` strategy) and hand them to `createLinking`.
//
// Metro selects the platform file on a real host (linking.android.ts > linking.ts);
// the base linking.ts re-exports the iOS build for web/headless. There is no runtime
// `Platform.OS` read; the filename is the selector.

import {
  installDeviceEventHub,
  NativeEventEmitter,
  type IEventEmitterModule,
  type IEventSubscription,
} from '../native-events';
import { getNativeModule } from '../native-modules';
import { dlog } from '../debug';

// The one event symbiote observes: an incoming deep link. RN's LinkingEventDefinitions.
const URL_EVENT = 'url';

// The `nullthrows` package's message, which RN's Linking surfaces for a missing native module.
const NULLTHROWS_MESSAGE = 'Got unexpected null or undefined';

export type IUrlEvent = {
  url: string;
};

// Элемент extras для Android `sendIntent`, как в RN
export type IIntentExtra = {
  key: string;
  value: string | number | boolean;
};

// Нативный модуль: URL-методы, счётчики подписки и `sendIntent` только для Android
export type INativeLinkingModule = IEventEmitterModule & {
  getInitialURL(): Promise<string | null>;
  canOpenURL(url: string): Promise<boolean>;
  openURL(url: string): Promise<void>;
  openSettings(): Promise<void>;
  sendIntent?(action: string, extras?: IIntentExtra[]): Promise<void>;
  addListener(eventName: string): void;
  removeListeners(count: number): void;
};

export type ILinkingStatic = {
  addEventListener(
    eventType: typeof URL_EVENT,
    listener: (event: IUrlEvent) => void,
  ): IEventSubscription;
  openURL(url: string): Promise<void>;
  canOpenURL(url: string): Promise<boolean>;
  getInitialURL(): Promise<string | null>;
  openSettings(): Promise<void>;
  sendIntent(action: string, extras?: IIntentExtra[]): Promise<void>;
};

// Платформа задаёт имя модуля и `sendIntent`: на Android это intent, на iOS отказ `Unsupported`
export type ILinkingPlatform = {
  moduleName: string;
  // RN builds the emitter over the module on iOS only: IntentAndroid has no observe counters
  isObservedByModule: boolean;
  sendIntent(
    requireModule: () => INativeLinkingModule,
    action: string,
    extras?: IIntentExtra[],
  ): Promise<void>;
};

// RN `_validateURL`: опечатка или пустой URL падают на вызове и не доходят до native
function validateUrl(url: string): void {
  if (typeof url !== 'string') {
    throw new Error(`Invalid URL: should be a string. Was: ${url}`);
  }
  if (url.length === 0) {
    throw new Error('Invalid URL: cannot be empty');
  }
}

// Narrow the native event payload to IUrlEvent at the trust boundary, no `as`.
function toUrlEvent(payload: unknown): IUrlEvent {
  if (typeof payload === 'object' && payload !== null && 'url' in payload) {
    const { url } = payload;
    if (typeof url === 'string') return { url };
  }
  dlog('Linking: url event payload missing string url');
  return { url: '' };
}

// Build a platform's Linking from its module name + sendIntent strategy. Each call owns
// its own lazy module/emitter cache, so importing both platform builds in a smoke keeps
// them independent. On a real host only one platform file is ever bundled.
export function createLinking(platform: ILinkingPlatform): ILinkingStatic {
  let linkingModule: INativeLinkingModule | null | undefined;
  let emitter: NativeEventEmitter | undefined;

  function getModule(): INativeLinkingModule | null {
    if (linkingModule === undefined) {
      linkingModule = getNativeModule<INativeLinkingModule>(
        platform.moduleName,
      );
      dlog(
        `Linking: ${platform.moduleName} module ${linkingModule ? 'resolved' : 'NOT resolved (null)'}`,
      );
    }
    return linkingModule;
  }

  function getEmitter(): NativeEventEmitter {
    if (emitter === undefined) {
      // Lazy install on first subscribe: the hub exists before native emits without a
      // hard bootstrap-order dependency. Idempotent.
      installDeviceEventHub();
      emitter = new NativeEventEmitter(
        platform.isObservedByModule ? (getModule() ?? undefined) : undefined,
      );
    }
    return emitter;
  }

  // RN's `nullthrows(NativeModule)`: a missing module throws SYNCHRONOUSLY, with that package's
  // message, from every method (Linking.js).
  function requireModule(): INativeLinkingModule {
    const module = getModule();
    if (module === null) {
      dlog(`Linking: ${platform.moduleName} unavailable -> throw`);
      throw new Error(NULLTHROWS_MESSAGE);
    }
    return module;
  }

  return {
    addEventListener(eventType, listener) {
      dlog(`Linking.addEventListener -> ${eventType}`);
      return getEmitter().addListener(eventType, payload => {
        listener(toUrlEvent(payload));
      });
    },

    openURL(url) {
      validateUrl(url);
      dlog(`Linking.openURL -> ${url}`);
      return requireModule().openURL(url);
    },

    canOpenURL(url) {
      validateUrl(url);
      dlog(`Linking.canOpenURL -> ${url}`);
      return requireModule().canOpenURL(url);
    },

    getInitialURL() {
      dlog('Linking.getInitialURL');
      return requireModule().getInitialURL();
    },

    openSettings() {
      dlog('Linking.openSettings');
      return requireModule().openSettings();
    },

    sendIntent(action, extras) {
      dlog(`Linking.sendIntent -> ${action}`);
      return platform.sendIntent(requireModule, action, extras);
    },
  };
}
