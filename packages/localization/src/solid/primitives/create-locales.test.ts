// Co-located Solid test for createLocales. Mocks the whole `core` barrel — the real
// getLocales/addLocaleListener delegation is proven once in
// packages/localization/src/core/localization.test.ts; what is exercised here is the reactive
// lifecycle: synchronous seed, synchronous subscribe, recompute, teardown.
//
// Driven with `createRoot` + an explicit dispose rather than a mounted component: a primitive
// needs an OWNER for `onCleanup`, not a host tree, and disposing by hand is what makes the
// teardown assertion possible at all.
//
// No Negative group: getLocales() is a synchronous, always-succeeding native read — the
// primitive has no guard clause or throwing path.

import { createEffect, createRoot, type Accessor } from 'solid-js';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Locale } from '../../core';
import { createLocales } from './create-locales';

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
// Playing native: `remove()` really unregisters, so a teardown that never ran is observable as
// the accessor still moving after dispose — not merely as a spy that went uncalled.
const removeMock = vi.fn(() => {
  registeredListener = undefined;
});
const addListenerMock = vi.fn((listener: () => void) => {
  registeredListener = listener;
  return { remove: removeMock };
});
const getLocalesMock = vi.fn(() => FAKE_LOCALES_INITIAL);

vi.mock('../../core', () => ({
  addLocaleListener: (listener: () => void) => addListenerMock(listener),
  getLocales: () => getLocalesMock(),
}));

// `createEffect` is a USER effect: Solid defers it to the end of the enclosing `runUpdates`, so
// one created inside `createRoot`'s callback has not run when that callback returns. Build inside
// the root, assert outside it — the same ordering a component gets.
function inRoot<T>(build: () => T): { value: T; dispose: () => void } {
  return createRoot(dispose => ({ value: build(), dispose }));
}

beforeEach(() => {
  registeredListener = undefined;
  addListenerMock.mockClear();
  removeMock.mockClear();
  getLocalesMock.mockClear();
  getLocalesMock.mockReturnValue(FAKE_LOCALES_INITIAL);
});

describe('createLocales (Solid)', () => {
  it('reads the current locales synchronously at call time', () => {
    // why: getLocales() is a synchronous native read, so the accessor must hold the real value
    // immediately, with no "loading" gap and no sentinel.
    const { value: locales, dispose } = inRoot(createLocales);

    expect(locales()).toEqual(FAKE_LOCALES_INITIAL);

    dispose();
  });

  it('recomputes the accessor when the native listener fires', () => {
    // why: locale settings can change while the app runs — the accessor must re-read getLocales()
    // off the native invalidation event, not cache the call-time value forever. It is also read
    // from a TRACKED scope: a value that only moved when polled would not re-run a consumer's
    // effect, which is the whole reason this returns an accessor.
    const seen: Locale[][] = [];
    const { value: locales, dispose } = inRoot<Accessor<Locale[]>>(() => {
      const current = createLocales();
      createEffect(() => {
        seen.push(current());
      });
      return current;
    });

    getLocalesMock.mockReturnValue(FAKE_LOCALES_UPDATED);
    registeredListener?.();

    expect(locales()).toEqual(FAKE_LOCALES_UPDATED);
    expect(seen).toEqual([FAKE_LOCALES_INITIAL, FAKE_LOCALES_UPDATED]);

    dispose();
  });

  it('is already subscribed before any effect has flushed', () => {
    // why: the ordering guarantee this primitive buys over its Vue/Svelte twins — the listener is
    // registered inline in the body, not deferred to onMounted/$effect, so an event firing in the
    // very same tick as the call cannot be missed.
    let locales: Accessor<Locale[]> | undefined;
    const dispose = createRoot(disposeRoot => {
      locales = createLocales();
      getLocalesMock.mockReturnValue(FAKE_LOCALES_UPDATED);
      registeredListener?.();
      return disposeRoot;
    });

    expect(locales?.()).toEqual(FAKE_LOCALES_UPDATED);

    dispose();
  });

  it('unsubscribes on dispose', () => {
    // why: a listener that outlives its owner writes into a disposed scope forever.
    const { value: locales, dispose } = inRoot(createLocales);

    dispose();
    getLocalesMock.mockReturnValue(FAKE_LOCALES_UPDATED);
    registeredListener?.();

    expect(removeMock).toHaveBeenCalledTimes(1);
    expect(locales()).toEqual(FAKE_LOCALES_INITIAL);
  });
});
