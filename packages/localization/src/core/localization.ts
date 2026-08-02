// Hand-ported from .vendors/expo/packages/expo-localization/src/Localization.ts (sdk-57) —
// both functions delegate straight to the native module, no extra wrapping needed beyond typing
// them as synchronous getters.
import ExpoLocalizationModule from './native-module';
import type { Calendar, Locale } from './types';

/**
 * List of user's locales, returned as an array of objects of type `Locale`.
 * Guaranteed to contain at least 1 element.
 * These are returned in the order the user defines in their device settings.
 * On the web currency and measurements systems are not provided, instead returned as null.
 * If needed, you can infer them from the current region using a lookup table.
 * @example
 * ```js
 * [{
 *   "languageTag": "pl-PL",
 *   "languageCode": "pl",
 *   "textDirection": "ltr",
 *   "digitGroupingSeparator": " ",
 *   "decimalSeparator": ",",
 *   "measurementSystem": "metric",
 *   "currencyCode": "PLN",
 *   "currencySymbol": "zł",
 *   "regionCode": "PL",
 *   "temperatureUnit": "celsius"
 * }]
 * ```
 */
export const getLocales: () => Locale[] = ExpoLocalizationModule.getLocales;

/**
 * List of user's preferred calendars, returned as an array of objects of type `Calendar`.
 * Guaranteed to contain at least 1 element.
 * For now always returns a single element, but it's likely to return a user preference list on some platforms in the future.
 * @example
 * ```js
 * [{
 *   "calendar": "gregory",
 *   "timeZone": "Europe/Warsaw",
 *   "uses24hourClock": true,
 *   "firstWeekday": 1
 * }]
 * ```
 */
export const getCalendars: () => Calendar[] = ExpoLocalizationModule.getCalendars;
