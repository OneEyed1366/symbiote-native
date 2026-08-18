// Co-located Angular-driven test (ADR 0025) for LocalesService. `core` is mocked wholesale (the
// real getLocales/addLocaleListener delegation is covered once in
// packages/localization/src/core/localization.test.ts), this file proves only connect()'s own
// read/subscribe/recompute/unsubscribe lifecycle — see packages/battery's
// battery-state.service.test.ts for the shared mounting rationale.
//
// No Negative group: connect() has no guard clause or throwing path — getLocales() is a
// synchronous, always-succeeding native read.

import '@angular/compiler';
import { Component, inject, type Signal } from '@angular/core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, unmount } from '@symbiote-native/angular';
import { installFabric } from '@symbiote-native/test-utils';
import type { Locale } from '../../../core';
import { LocalesService } from './index';

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

const addListenerMock = vi.fn();
const removeMock = vi.fn();
const getLocalesMock = vi.fn(() => FAKE_LOCALES_INITIAL);

vi.mock('../../../core', () => ({
  addLocaleListener: (listener: () => void) => addListenerMock(listener),
  getLocales: () => getLocalesMock(),
}));

const ROOT_TAG = 974;
const fabric = installFabric();
const tick = (): Promise<void> =>
  new Promise(resolve => setTimeout(resolve, 0));

let capturedResult: Signal<Locale[]> | undefined;
let capturedListener: (() => void) | undefined;

@Component({
  selector: 'symbiote-locales-host',
  standalone: true,
  template: '',
})
class LocalesHost {
  readonly locales = inject(LocalesService).connect();

  constructor() {
    capturedResult = this.locales;
  }
}

beforeEach(() => {
  capturedResult = undefined;
  capturedListener = undefined;
  getLocalesMock.mockReturnValue(FAKE_LOCALES_INITIAL);
  addListenerMock.mockImplementation(listener => {
    capturedListener = listener;
    return { remove: removeMock };
  });
});

afterEach(() => {
  unmount(ROOT_TAG);
  fabric.reset();
  vi.clearAllMocks();
});

describe('LocalesService.connect', () => {
  it('reads the current locales synchronously', () => {
    // why: getLocales() is a synchronous native read — the signal must hold the real value on
    // the very first read, with no "loading" gap.
    mount(ROOT_TAG, LocalesHost);

    expect(capturedResult?.()).toEqual(FAKE_LOCALES_INITIAL);
  });

  it('recomputes the signal when the registered listener fires', async () => {
    // why: locale settings can change while the app runs (device Language & Region change) —
    // the signal must re-read getLocales() off the native invalidation event, not cache the
    // initial snapshot forever.
    mount(ROOT_TAG, LocalesHost);
    await tick();

    if (capturedListener === undefined)
      throw new Error('addListener callback was not captured');
    getLocalesMock.mockReturnValue(FAKE_LOCALES_UPDATED);
    capturedListener();

    expect(capturedResult?.()).toEqual(FAKE_LOCALES_UPDATED);
  });

  it('removes the subscription when the host component is unmounted', async () => {
    // why: a leaked subscription keeps re-reading locales for a signal no component observes,
    // and leaks the native listener — the effect's onCleanup must run on teardown.
    mount(ROOT_TAG, LocalesHost);
    await tick();

    unmount(ROOT_TAG);
    await tick();

    expect(removeMock).toHaveBeenCalledOnce();
  });
});
