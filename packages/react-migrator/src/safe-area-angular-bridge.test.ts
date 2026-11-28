// The expected Angular output for react-native-safe-area-context, run in a real injection context
import { Injector, runInInjectionContext, signal } from '@angular/core';
import type { Provider } from '@angular/core';
import { describe, expect, it } from 'vitest';
import { NO_INSETS_ERROR } from '../fixtures/safe-area-context/expected/core';
import type { ICornerAdaptedInsets, IEdgeInsets, IRect } from '../fixtures/safe-area-context/expected/core';
import {
  SafeAreaCornerAdaptedInsetsContext,
  SafeAreaFrameContext,
  SafeAreaInsetsContext,
  injectSafeAreaFrame,
  injectSafeAreaInsets,
} from '../fixtures/safe-area-context/expected/angular';

const PORTRAIT: IEdgeInsets = { top: 47, right: 0, bottom: 34, left: 0 };
const LANDSCAPE: IEdgeInsets = { top: 0, right: 47, bottom: 21, left: 47 };
const CORNER: ICornerAdaptedInsets = {
  vertical: { top: 59, right: 0, bottom: 40, left: 0 },
  horizontal: { top: 0, right: 59, bottom: 21, left: 59 },
};
const FRAME: IRect = { x: 0, y: 0, width: 390, height: 844 };

function inject<TValue>(providers: Provider[], read: () => TValue): TValue {
  return runInInjectionContext(Injector.create({ providers }), read);
}

describe('the Angular twin of useSafeAreaInsets', () => {
  it('reads the insets and the frame the providers give', () => {
    const providers = [
      SafeAreaInsetsContext.provide(() => signal(PORTRAIT)),
      SafeAreaFrameContext.provide(() => signal(FRAME)),
    ];

    expect(inject(providers, () => injectSafeAreaInsets())()).toEqual(PORTRAIT);
    expect(inject(providers, () => injectSafeAreaFrame())()).toEqual(FRAME);
  });

  it('follows the provided signal when its insets change', () => {
    const insets = signal<IEdgeInsets | null>(PORTRAIT);
    const read = inject([SafeAreaInsetsContext.provide(() => insets)], () =>
      injectSafeAreaInsets(),
    );

    insets.set(LANDSCAPE);

    expect(read()).toEqual(LANDSCAPE);
  });

  it('takes the corner-adapted insets for the asked axis', () => {
    const providers = [
      SafeAreaInsetsContext.provide(() => signal(PORTRAIT)),
      SafeAreaCornerAdaptedInsetsContext.provide(() => signal(CORNER)),
    ];
    const read = inject(providers, () => injectSafeAreaInsets({ cornerAdaptation: 'vertical' }));

    expect(read()).toEqual(CORNER.vertical);
  });

  it('falls back to the regular insets without a corner provider', () => {
    const read = inject([SafeAreaInsetsContext.provide(() => signal(PORTRAIT))], () =>
      injectSafeAreaInsets({ cornerAdaptation: 'vertical' }),
    );

    expect(read()).toEqual(PORTRAIT);
  });

  it('throws at inject without a provider, where React throws at render', () => {
    expect(() => inject([], () => injectSafeAreaInsets())).toThrow(new Error(NO_INSETS_ERROR));
  });
});
