import type { IScreenOptions } from '@symbiote-native/navigation/react';
import { isParamsRecord, readFlag } from '../read-params';

// The panel state, written to the route params and read back by the options resolver
export type ITransitionSettings = {
  isTranslucent: boolean;
  isLargeTitle: boolean;
};

export const DEFAULT_TRANSITION_SETTINGS: ITransitionSettings = {
  isTranslucent: false,
  isLargeTitle: false,
};

export function readTransitionSettings(params: unknown): ITransitionSettings {
  if (!isParamsRecord(params)) return DEFAULT_TRANSITION_SETTINGS;
  return {
    isTranslucent: readFlag(
      params,
      'isTranslucent',
      DEFAULT_TRANSITION_SETTINGS.isTranslucent,
    ),
    isLargeTitle: readFlag(
      params,
      'isLargeTitle',
      DEFAULT_TRANSITION_SETTINGS.isLargeTitle,
    ),
  };
}

export function transitionOptionsOf(
  settings: ITransitionSettings,
): IScreenOptions {
  return {
    headerTranslucent: settings.isTranslucent,
    headerLargeTitle: settings.isLargeTitle,
  };
}
