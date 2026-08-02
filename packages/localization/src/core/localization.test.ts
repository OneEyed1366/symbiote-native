import { afterEach, describe, expect, it, vi } from 'vitest';
import { CalendarIdentifier, Weekday, type Calendar, type Locale } from './types';

const FAKE_LOCALES: Locale[] = [
  {
    languageTag: 'pl-PL',
    languageCode: 'pl',
    languageScriptCode: 'Latn',
    regionCode: 'PL',
    languageRegionCode: 'PL',
    currencyCode: 'PLN',
    currencySymbol: 'zł',
    languageCurrencyCode: 'PLN',
    languageCurrencySymbol: 'zł',
    decimalSeparator: ',',
    digitGroupingSeparator: ' ',
    textDirection: 'ltr',
    measurementSystem: 'metric',
    temperatureUnit: 'celsius',
  },
];

const FAKE_CALENDARS: Calendar[] = [
  {
    calendar: CalendarIdentifier.GREGORY,
    uses24hourClock: true,
    firstWeekday: Weekday.MONDAY,
    timeZone: 'Europe/Warsaw',
  },
];

const getLocalesMock = vi.fn(() => FAKE_LOCALES);
const getCalendarsMock = vi.fn(() => FAKE_CALENDARS);

// The real ExpoLocalization native module only exists on device — resolving it via
// requireNativeModule() at import time would throw in this headless test run, so the
// module-lookup file is faked in place of expo-modules-core's runtime resolution, the same
// pattern packages/battery/src/core/battery.test.ts uses.
vi.mock('./native-module', () => ({
  default: {
    getLocales: getLocalesMock,
    getCalendars: getCalendarsMock,
  },
}));

const { getLocales, getCalendars } = await import('./localization');

afterEach(() => {
  vi.clearAllMocks();
});

describe('getLocales', () => {
  it('delegates to the native module', () => {
    expect(getLocales()).toEqual(FAKE_LOCALES);
    expect(getLocalesMock).toHaveBeenCalledOnce();
  });
});

describe('getCalendars', () => {
  it('delegates to the native module', () => {
    expect(getCalendars()).toEqual(FAKE_CALENDARS);
    expect(getCalendarsMock).toHaveBeenCalledOnce();
  });
});
