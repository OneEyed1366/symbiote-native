// Ported from expo-asset/src/PlatformUtils.ts (sdk-57) — real logic, not a stub. Every check
// here (ExpoGo/expo-updates native modules, the classic-updates manifest) naturally resolves to
// "absent" in a bare app that ships neither, matching upstream's own designed fallback.
import Constants from 'expo-constants';
import {
  requireNativeModule,
  requireOptionalNativeModule,
} from 'expo-modules-core';

import { getManifestBaseUrl } from './asset-uris';

type IExpoUpdatesModule = {
  isEnabled?: boolean;
  isUsingEmbeddedAssets?: boolean;
  localAssets?: Record<string, string>;
};

const ExpoUpdates =
  requireOptionalNativeModule<IExpoUpdatesModule>('ExpoUpdates');

function isRunningInExpoGo(): boolean {
  try {
    return requireNativeModule('ExpoGo') != null;
  } catch {
    return false;
  }
}

const expoUpdatesIsInstalledAndEnabled = !!ExpoUpdates?.isEnabled;
const expoUpdatesIsUsingEmbeddedAssets = ExpoUpdates?.isUsingEmbeddedAssets;
const shouldUseUpdatesAssetResolution =
  expoUpdatesIsInstalledAndEnabled && !expoUpdatesIsUsingEmbeddedAssets;

export const IS_ENV_WITH_LOCAL_ASSETS =
  isRunningInExpoGo() || shouldUseUpdatesAssetResolution;

export function getLocalAssets(): Record<string, string> {
  return ExpoUpdates?.localAssets ?? {};
}

export function getManifest2(): typeof Constants.__unsafeNoWarnManifest2 {
  return Constants.__unsafeNoWarnManifest2;
}

export const manifestBaseUrl = Constants.experienceUrl
  ? getManifestBaseUrl(Constants.experienceUrl)
  : null;
