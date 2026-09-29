import { Platform } from 'expo-modules-core';
import { expoAgeRange } from './native-module';
import type {
  IAgeRangeRegulatoryFeature,
  IAgeRangeRequest,
  IAgeRangeResponse,
  IAgeSignalsStatus,
  IFakeAgeSignals,
} from './types';

/** Prompts the user to share their age range; the OS may cache the response for later requests */
export async function requestAgeRangeAsync(
  options: IAgeRangeRequest,
): Promise<IAgeRangeResponse> {
  return expoAgeRange.requestAgeRangeAsync(options);
}

export async function isEligibleForAgeFeaturesAsync(): Promise<boolean | null> {
  return expoAgeRange.isEligibleForAgeFeaturesAsync();
}

/** @platform ios, no-op elsewhere */
export async function showSignificantUpdateAcknowledgmentAsync(
  updateDescription: string,
): Promise<void> {
  if (
    Platform.OS !== 'ios' ||
    !expoAgeRange.showSignificantUpdateAcknowledgmentAsync
  ) {
    return;
  }
  await expoAgeRange.showSignificantUpdateAcknowledgmentAsync(
    updateDescription,
  );
}

/** @platform ios, `null` elsewhere means unknown rather than none required */
export async function getRequiredRegulatoryFeaturesAsync(): Promise<
  IAgeRangeRegulatoryFeature[] | null
> {
  if (
    Platform.OS !== 'ios' ||
    !expoAgeRange.getRequiredRegulatoryFeaturesAsync
  ) {
    return null;
  }
  return expoAgeRange.getRequiredRegulatoryFeaturesAsync();
}

/** @platform android, `null` elsewhere means unknown rather than not shared */
export async function requestAgeSignalsAccessAsync(): Promise<IAgeSignalsStatus | null> {
  if (Platform.OS !== 'android' || !expoAgeRange.requestAgeSignalsAccessAsync) {
    return null;
  }
  return expoAgeRange.requestAgeSignalsAccessAsync();
}

/** @platform android, no-op elsewhere; throws off a non-debuggable build unless `fake` is `null` */
export function setFakeAgeSignals(fake: IFakeAgeSignals | null): void {
  if (Platform.OS !== 'android' || !expoAgeRange.setFakeAgeSignals) return;
  expoAgeRange.setFakeAgeSignals(fake);
}
