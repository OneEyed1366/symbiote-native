// Framework-agnostic native-module wrapper coverage (see core/localization.ts,
// core/native-module.ts). Every Angular service / React hook / Vue composable in this package
// mocks this whole `core` barrel away and tests only its own mount/subscribe/unmount lifecycle
// — so the real delegation to the native module (which literal event name is used, which native
// function backs which export) is proven exactly once, here.
//
// No Negative group: getLocales/getCalendars/addLocaleListener/addCalendarListener have no
// guard clause and nothing to fall back from (unlike packages/battery, which documents a
// fallback sentinel per function) — every path is a direct delegation. See getLocales'/
// getCalendars' own comment in localization.ts: "no extra wrapping needed beyond typing".

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

const FAKE_NATIVE_LOCALIZATION = {
  getLocales: vi.fn(() => FAKE_LOCALES),
  getCalendars: vi.fn(() => FAKE_CALENDARS),
  addListener: vi.fn(() => ({ remove: vi.fn() })),
};

// Unlike every sibling package (battery, network, haptics…), addLocaleListener/
// addCalendarListener are defined and exported straight from native-module.ts, not from
// localization.ts — so mocking './native-module' the usual way would mock away the very
// functions under test. Faking expo-modules-core's requireNativeModule() instead lets both
// native-module.ts and localization.ts load for real, resolving to this fake native object.
vi.mock('expo-modules-core', () => ({
  requireNativeModule: () => FAKE_NATIVE_LOCALIZATION,
}));

const { getLocales, getCalendars } = await import('./localization');
const { addLocaleListener, addCalendarListener } = await import('./native-module');

afterEach(() => {
  vi.clearAllMocks();
});

describe('getLocales', () => {
  it('delegates to the native module', () => {
    // why: getLocales is a direct assignment to the native function
    // (`export const getLocales: () => Locale[] = ExpoLocalizationModule.getLocales`), not a
    // wrapper call — this proves the export actually resolves through the native module rather
    // than silently binding to an undefined/stale reference.
    expect(getLocales()).toEqual(FAKE_LOCALES);
    expect(FAKE_NATIVE_LOCALIZATION.getLocales).toHaveBeenCalledOnce();
  });
});

describe('getCalendars', () => {
  it('delegates to the native module', () => {
    // why: same direct-assignment contract as getLocales, for the calendar list.
    expect(getCalendars()).toEqual(FAKE_CALENDARS);
    expect(FAKE_NATIVE_LOCALIZATION.getCalendars).toHaveBeenCalledOnce();
  });
});

describe('addLocaleListener', () => {
  it('subscribes through the onLocaleSettingsChanged event name', () => {
    // why: every adapter (Angular/React/Vue useLocales) invalidates its cached locale snapshot
    // off this exact literal — a typo here means locale-setting changes silently never
    // propagate to the app, undetectable by any adapter test since they all mock this call away.
    const listener = vi.fn();
    addLocaleListener(listener);

    expect(FAKE_NATIVE_LOCALIZATION.addListener).toHaveBeenCalledWith(
      'onLocaleSettingsChanged',
      listener,
    );
  });
});

describe('addCalendarListener', () => {
  it('subscribes through the onCalendarSettingsChanged event name', () => {
    // why: same contract as addLocaleListener, for the calendar-settings stream — one native
    // module fans out two independent event streams through the same addListener, keyed by
    // event name (see native-module.ts's own comment), so getting either literal wrong breaks
    // only that one stream, silently.
    const listener = vi.fn();
    addCalendarListener(listener);

    expect(FAKE_NATIVE_LOCALIZATION.addListener).toHaveBeenCalledWith(
      'onCalendarSettingsChanged',
      listener,
    );
  });
});
