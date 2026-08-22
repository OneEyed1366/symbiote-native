import { requireNativeModule } from 'expo-modules-core';
import type { ISharingOptions } from './types';

const EXPO_SHARING_MODULE_NAME = 'ExpoSharing';

// Every member is optional — each call site checks for its presence before calling through and
// throws an UnavailabilityError itself, matching upstream's own per-platform capability checks
// rather than assuming the native module implements the whole surface.
//
// `isAvailableAsync` is genuinely absent from both native modules in expo-sharing@57.0.8: only
// the web module (which this package does not ship) defines it. Presence of the module itself is
// therefore what availability is read from — see isAvailableAsync in ./sharing.
//
// The incoming-share methods (getSharedPayloads, getResolvedSharedPayloadsAsync,
// clearSharedPayloads) are deliberately absent from this type: reaching them needs an iOS Share
// Extension target this package does not ship. See the README.
export type INativeSharingModule = {
  isAvailableAsync?(): Promise<boolean>;
  shareAsync?(url: string, options: ISharingOptions): Promise<void>;
};

export const expoSharing = requireNativeModule<INativeSharingModule>(
  EXPO_SHARING_MODULE_NAME,
);
