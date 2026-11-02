// Dev warnings of react-native-screens about option combinations, each printed once per message

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { IScreenOptions } from './navigator-props';

const BLUR_MESSAGE =
  '[RNScreens] Using both `blurEffect` and `scrollEdgeEffects` simultaneously may cause overlapping effects.';
const HEADER_TOGGLE_MESSAGE =
  "Dynamically changing header's visibility in modals will result in remounting the screen and losing all local state.";

let warn = vi.spyOn(console, 'warn');

beforeEach(() => {
  vi.resetModules();
  Reflect.set(globalThis, '__DEV__', true);
  warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  Reflect.set(globalThis, '__DEV__', false);
  vi.restoreAllMocks();
});

describe('warnOnce', () => {
  it('prints a message once however often its condition holds', async () => {
    const { warnOnce } = await import('./warn-once');

    warnOnce(true, 'same');
    warnOnce(true, 'same');
    warnOnce(true, 'other');

    expect(warn.mock.calls.map(call => call[0])).toEqual(['same', 'other']);
  });

  it('stays silent while the condition is false', async () => {
    const { warnOnce } = await import('./warn-once');

    warnOnce(false, 'quiet');

    expect(warn).not.toHaveBeenCalled();
  });

  it('stays silent in a release build', async () => {
    Reflect.set(globalThis, '__DEV__', false);
    const { warnOnce } = await import('./warn-once');

    warnOnce(true, 'release');

    expect(warn).not.toHaveBeenCalled();
  });
});

type IWarnInput = {
  options?: IScreenOptions;
  isAndroid?: boolean;
  isIOS26OrHigher?: boolean;
  seenKeys?: Set<string>;
};

async function warnOn(input: IWarnInput) {
  const { warnOnScreenOptions } = await import('./screen-warnings');
  warnOnScreenOptions({
    options: input.options ?? {},
    routeKey: 'route-1',
    isAndroid: input.isAndroid ?? false,
    isIOS26OrHigher: input.isIOS26OrHigher ?? true,
    seenKeys: input.seenKeys ?? new Set(),
  });
}

describe('a stack route plan', () => {
  it('warns about a header that flips in a modal across two renders', async () => {
    const { resolveStackRoutePlan } = await import('./screen-wiring');
    const { createEmitterStore } = await import('./navigator-wiring');
    const route = { key: 'route-1', name: 'Home' };
    const loggedKeys = new Set<string>();
    const emitter = createEmitterStore().emitterFor(route.key);
    const plan = (options: IScreenOptions) =>
      resolveStackRoutePlan({
        route,
        index: 0,
        routeCount: 1,
        options,
        emitter,
        onPop: () => {},
        loggedKeys,
      });

    plan({ stackPresentation: 'modal' });
    plan({ stackPresentation: 'modal', headerShown: false });

    expect(warn).toHaveBeenCalledWith(HEADER_TOGGLE_MESSAGE);
  });
});

describe('blurEffect together with scrollEdgeEffects', () => {
  it('warns on iOS 26 when the edge effects are not all hidden', async () => {
    await warnOn({ options: { headerBlurEffect: 'light' } });

    expect(warn).toHaveBeenCalledWith(BLUR_MESSAGE);
  });

  it('stays silent below iOS 26', async () => {
    await warnOn({
      options: { headerBlurEffect: 'light' },
      isIOS26OrHigher: false,
    });

    expect(warn).not.toHaveBeenCalled();
  });

  it('stays silent when the blur is none or every edge is hidden', async () => {
    await warnOn({ options: { headerBlurEffect: 'none' } });
    await warnOn({
      options: {
        headerBlurEffect: 'light',
        scrollEdgeEffects: { top: 'hidden', bottom: 'hidden' },
      },
    });

    expect(warn).not.toHaveBeenCalled();
  });
});

describe('header visibility that changes in a modal', () => {
  const modal: IScreenOptions = { stackPresentation: 'modal' };

  it('warns once the visibility differs from the last render', async () => {
    const seenKeys = new Set<string>();

    await warnOn({ options: modal, seenKeys });
    expect(warn).not.toHaveBeenCalled();
    await warnOn({ options: { ...modal, headerShown: false }, seenKeys });

    expect(warn).toHaveBeenCalledWith(HEADER_TOGGLE_MESSAGE);
  });

  it('stays silent while the visibility holds', async () => {
    const seenKeys = new Set<string>();

    await warnOn({ options: modal, seenKeys });
    await warnOn({ options: modal, seenKeys });

    expect(warn).not.toHaveBeenCalled();
  });

  it('stays silent for a pushed screen and on Android', async () => {
    const pushSeen = new Set<string>();
    const androidSeen = new Set<string>();

    await warnOn({ options: {}, seenKeys: pushSeen });
    await warnOn({ options: { headerShown: false }, seenKeys: pushSeen });
    await warnOn({ options: modal, isAndroid: true, seenKeys: androidSeen });
    await warnOn({
      options: { ...modal, headerShown: false },
      isAndroid: true,
      seenKeys: androidSeen,
    });

    expect(warn).not.toHaveBeenCalled();
  });
});
