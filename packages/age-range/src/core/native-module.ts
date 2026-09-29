import { requireNativeModule } from 'expo-modules-core';
import type {
  IAgeRangeRegulatoryFeature,
  IAgeRangeRequest,
  IAgeRangeResponse,
  IAgeSignalsStatus,
  IFakeAgeSignals,
} from './types';

const EXPO_AGE_RANGE_MODULE_NAME = 'ExpoAgeRange';

// The iOS-only and android-only methods stay optional here; age-range.ts checks Platform.OS
// before calling through, same convention as packages/application/src/core/native-module.ts
export type INativeAgeRangeModule = {
  requestAgeRangeAsync(options: IAgeRangeRequest): Promise<IAgeRangeResponse>;
  isEligibleForAgeFeaturesAsync(): Promise<boolean | null>;
  showSignificantUpdateAcknowledgmentAsync?(
    updateDescription: string,
  ): Promise<void>;
  getRequiredRegulatoryFeaturesAsync?(): Promise<
    IAgeRangeRegulatoryFeature[] | null
  >;
  requestAgeSignalsAccessAsync?(): Promise<IAgeSignalsStatus | null>;
  setFakeAgeSignals?(fake: IFakeAgeSignals | null): void;
};

export const expoAgeRange = requireNativeModule<INativeAgeRangeModule>(
  EXPO_AGE_RANGE_MODULE_NAME,
);
