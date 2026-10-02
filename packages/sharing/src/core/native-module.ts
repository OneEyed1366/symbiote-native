import { requireNativeModule } from 'expo-modules-core';
import type {
  IResolvedSharePayload,
  ISharePayload,
  ISharingOptions,
} from './types';

const EXPO_SHARING_MODULE_NAME = 'ExpoSharing';

// Every member is optional — each call site checks for its presence before calling through and
// throws an UnavailabilityError itself, matching upstream's own per-platform capability checks
// rather than assuming the native module implements the whole surface.
//
// `isAvailableAsync` is genuinely absent from both native modules in expo-sharing@57.0.8: only
// the web module (which this package does not ship) defines it. Presence of the module itself is
// therefore what availability is read from — see isAvailableAsync in ./sharing.
//
// The incoming-share methods exist on the native module, but return data only once the host app
// carries the share target (iOS Share Extension, Android intent filters), see the README
export type INativeSharingModule = {
  isAvailableAsync?(): Promise<boolean>;
  shareAsync?(url: string, options: ISharingOptions): Promise<void>;
  getSharedPayloads?(): ISharePayload[];
  getResolvedSharedPayloadsAsync?(): Promise<IResolvedSharePayload[]>;
  clearSharedPayloads?(): void;
};

export const expoSharing = requireNativeModule<INativeSharingModule>(
  EXPO_SHARING_MODULE_NAME,
);
