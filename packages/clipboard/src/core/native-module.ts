import { requireNativeModule } from 'expo-modules-core';
import type { EventSubscription } from 'expo-modules-core';
import type {
  IClipboardEvent,
  IClipboardImage,
  IGetImageOptions,
  IGetStringOptions,
  ISetStringOptions,
} from './types';

const EXPO_CLIPBOARD_MODULE_NAME = 'ExpoClipboard';

// The event name upstream's own ExpoClipboard.ts pairs with the native module's event map —
// kept here, next to the module resolution, since core/clipboard.ts's addClipboardListener is
// the only caller.
export const CLIPBOARD_CHANGED_EVENT_NAME = 'onClipboardChanged';

// addListener/removeAllListeners come from expo-modules-core's own NativeModule<Events> base
// class (an EventEmitter) — always present, unlike the async methods below, each of which is
// optional and checked at its own call site before throwing an UnavailabilityError, mirroring
// @symbiote-native/local-auth's native-module.ts and upstream's own per-platform capability
// checks (getUrlAsync/setUrlAsync/hasUrlAsync are iOS-only, hence optional there too).
export type INativeClipboardModule = {
  addListener(
    eventName: typeof CLIPBOARD_CHANGED_EVENT_NAME,
    listener: (event: IClipboardEvent) => void,
  ): EventSubscription;
  removeAllListeners(eventName: typeof CLIPBOARD_CHANGED_EVENT_NAME): void;
  getStringAsync?(options?: IGetStringOptions): Promise<string>;
  setStringAsync?(text: string, options?: ISetStringOptions): Promise<boolean>;
  hasStringAsync?(): Promise<boolean>;
  getUrlAsync?(): Promise<string | null>;
  setUrlAsync?(url: string): Promise<void>;
  hasUrlAsync?(): Promise<boolean>;
  getImageAsync?(options: IGetImageOptions): Promise<IClipboardImage | null>;
  setImageAsync?(base64Image: string): Promise<void>;
  hasImageAsync?(): Promise<boolean>;
};

export const expoClipboard = requireNativeModule<INativeClipboardModule>(
  EXPO_CLIPBOARD_MODULE_NAME,
);
