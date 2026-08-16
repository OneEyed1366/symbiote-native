// Co-located Vue-driven test (ADR 0025) for useLocales. `core` is mocked wholesale (the real
// getLocales/addLocaleListener delegation is covered once in
// packages/localization/src/core/localization.test.ts) — see packages/battery's
// use-battery-state.test.ts for the shared mounting rationale.
//
// No Negative group: the composable has no guard clause or throwing path — getLocales() is a
// synchronous, always-succeeding native read.

import { defineComponent, h, type Ref } from '@vue/runtime-core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, unmount } from '@symbiote-native/vue';
import { installFabric } from '@symbiote-native/test-utils';
import type { Locale } from '../../../core';
import { useLocales } from './index';

const ROOT_TAG = 9954;

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

let registeredListener: (() => void) | undefined;
const removeMock = vi.fn();
const addListenerMock = vi.fn((listener: () => void) => {
  registeredListener = listener;
  return { remove: removeMock };
});
const getLocalesMock = vi.fn(() => FAKE_LOCALES_INITIAL);

vi.mock('../../../core', () => ({
  addLocaleListener: (listener: () => void) => addListenerMock(listener),
  getLocales: () => getLocalesMock(),
}));

const fabric = installFabric();

beforeEach(() => {
  fabric.reset();
  registeredListener = undefined;
  addListenerMock.mockClear();
  removeMock.mockClear();
  getLocalesMock.mockClear();
  getLocalesMock.mockReturnValue(FAKE_LOCALES_INITIAL);
});

afterEach(() => unmount(ROOT_TAG));

function mountLocales(): Ref<Locale[]> {
  let locales: Ref<Locale[]> | undefined;
  mount(
    ROOT_TAG,
    defineComponent({
      setup: () => {
        locales = useLocales();
        return () => h('symbiote-text', {}, 'locales');
      },
    }),
  );
  if (locales === undefined) {
    throw new Error('setup() did not run');
  }
  return locales;
}

describe('useLocales (Vue)', () => {
  it('reads the current locales synchronously at setup', () => {
    // why: getLocales() is called directly at ref() initialization (not inside onMounted) — the
    // ref must hold the real value immediately, with no "loading" gap.
    const locales = mountLocales();

    expect(locales.value).toEqual(FAKE_LOCALES_INITIAL);
  });

  it('recomputes the ref when the native listener fires', () => {
    // why: locale settings can change while the app runs — the ref must re-read getLocales() off
    // the native invalidation event registered in onMounted, not cache the setup-time value
    // forever.
    const locales = mountLocales();

    getLocalesMock.mockReturnValue(FAKE_LOCALES_UPDATED);
    registeredListener?.();

    expect(locales.value).toEqual(FAKE_LOCALES_UPDATED);
  });

  it('removes the subscription on unmount', () => {
    // why: onUnmounted must call subscription.remove(), or the native listener leaks past the
    // component's lifetime.
    mountLocales();
    unmount(ROOT_TAG);

    expect(removeMock).toHaveBeenCalledTimes(1);
  });
});
