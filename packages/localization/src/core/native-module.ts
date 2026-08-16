// Hand-ported from .vendors/expo/packages/expo-localization/src/ExpoLocalization.native.ts
// (sdk-57). getLocales()/getCalendars() are synchronous, JSI-bridged native calls (no await) -
// same constants-style read pattern as expo-device's eagerly-resolved fields
// (packages/device/src/core/native-module.ts). One native module fans out two independent event
// streams (locale vs calendar settings) through the same addListener, keyed by event name -
// mirrors the overload trick in packages/battery/src/core/native-module.ts.
import { type EventSubscription, requireNativeModule } from 'expo-modules-core';
import type { Calendar, Locale } from './types';

const EXPO_LOCALIZATION_MODULE_NAME = 'ExpoLocalization';

export type INativeLocalizationModule = {
  getLocales(): Locale[];
  getCalendars(): Calendar[];
  addListener(
    eventName: 'onLocaleSettingsChanged',
    listener: (event?: unknown) => void,
  ): EventSubscription;
  addListener(
    eventName: 'onCalendarSettingsChanged',
    listener: (event?: unknown) => void,
  ): EventSubscription;
};

const ExpoLocalizationModule = requireNativeModule<INativeLocalizationModule>(
  EXPO_LOCALIZATION_MODULE_NAME,
);

export function addLocaleListener(
  // NOTE: upstream never uses the event's data — the listener is invoked purely as an
  // invalidate signal for useLocales/the Vue composable/the Angular service below.
  listener: (event?: unknown) => void,
): EventSubscription {
  return ExpoLocalizationModule.addListener('onLocaleSettingsChanged', listener);
}

export function addCalendarListener(listener: (event?: unknown) => void): EventSubscription {
  return ExpoLocalizationModule.addListener('onCalendarSettingsChanged', listener);
}

export default ExpoLocalizationModule;
