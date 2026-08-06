// Co-located Angular-driven test (ADR 0025) for LocalesService. See packages/battery's
// battery-state.service.test.ts for the shared rationale.

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
const tick = (): Promise<void> => new Promise(resolve => setTimeout(resolve, 0));

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
    mount(ROOT_TAG, LocalesHost);

    expect(capturedResult?.()).toEqual(FAKE_LOCALES_INITIAL);
  });

  it('recomputes the signal when the registered listener fires', async () => {
    mount(ROOT_TAG, LocalesHost);
    await tick();

    if (capturedListener === undefined) throw new Error('addListener callback was not captured');
    getLocalesMock.mockReturnValue(FAKE_LOCALES_UPDATED);
    capturedListener();

    expect(capturedResult?.()).toEqual(FAKE_LOCALES_UPDATED);
  });

  it('removes the subscription when the host component is unmounted', async () => {
    mount(ROOT_TAG, LocalesHost);
    await tick();

    unmount(ROOT_TAG);
    await tick();

    expect(removeMock).toHaveBeenCalledOnce();
  });
});
