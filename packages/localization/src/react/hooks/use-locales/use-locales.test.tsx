// Co-located React-driven test (ADR 0025) for useLocales. Mocks `core`, not expo-modules-core
// internals — same pattern packages/battery's hook tests use. Native delegation is covered once
// in packages/localization/src/core/localization.test.ts.
//
// No Negative group: the hook has no guard clause or throwing path — getLocales() is a
// synchronous, always-succeeding native read.

import { createElement, type ReactElement } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, unmount, View } from '@symbiote-native/react';
import { installFabric } from '@symbiote-native/test-utils';
import type { Locale } from '../../../core';
import { useLocales } from './index';

const FAKE_LOCALES_INITIAL: Locale[] = [
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

const FAKE_LOCALES_UPDATED: Locale[] = [
  {
    languageTag: 'en-US',
    languageCode: 'en',
    languageScriptCode: 'Latn',
    regionCode: 'US',
    languageRegionCode: 'US',
    currencyCode: 'USD',
    currencySymbol: '$',
    languageCurrencyCode: 'USD',
    languageCurrencySymbol: '$',
    decimalSeparator: '.',
    digitGroupingSeparator: ',',
    textDirection: 'ltr',
    measurementSystem: 'us',
    temperatureUnit: 'fahrenheit',
  },
];

const { addListener, getLocales, remove } = vi.hoisted(() => {
  const remove = vi.fn();
  return {
    addListener: vi.fn((_listener: () => void) => ({ remove })),
    getLocales: vi.fn(),
    remove,
  };
});

vi.mock('../../../core', () => ({
  addLocaleListener: addListener,
  getLocales,
}));

const ROOT_TAG = 954;

const results: Locale[][] = [];

function Probe(): ReactElement {
  results.push(useLocales());
  return createElement(View);
}

const fabric = installFabric();

beforeEach(() => {
  fabric.reset();
  results.length = 0;
  vi.clearAllMocks();
  getLocales.mockReturnValue(FAKE_LOCALES_INITIAL);
});

afterEach(() => unmount(ROOT_TAG));

describe('useLocales', () => {
  it('reads the current locales synchronously on first render', () => {
    // why: getLocales() is a synchronous native read — useMemo must compute the real value on
    // the very first render, with no "loading" gap.
    mount(ROOT_TAG, createElement(Probe));

    expect(results[results.length - 1]).toEqual(FAKE_LOCALES_INITIAL);
  });

  it('recomputes locales when the native listener fires', async () => {
    // why: the hook's whole mechanism is a useReducer invalidation counter driving useMemo — the
    // registered listener must actually bump that counter, or a real device locale-settings
    // change would never reach the component.
    mount(ROOT_TAG, createElement(Probe));

    const invalidate = addListener.mock.calls[0][0];
    getLocales.mockReturnValue(FAKE_LOCALES_UPDATED);
    invalidate();

    await vi.waitFor(() =>
      expect(results[results.length - 1]).toEqual(FAKE_LOCALES_UPDATED),
    );
  });

  it('unsubscribes from the native listener on unmount', () => {
    // why: the effect's cleanup must run on unmount or the native listener leaks past the
    // component's lifetime.
    mount(ROOT_TAG, createElement(Probe));

    unmount(ROOT_TAG);

    expect(remove).toHaveBeenCalledTimes(1);
  });
});
