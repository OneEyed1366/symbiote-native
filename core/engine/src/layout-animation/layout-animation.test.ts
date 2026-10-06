// Co-located unit test for the LayoutAnimation module: JS surface plus that
// configureNext ships its config to the native UIManager. A fake native module (installed via
// __turboModuleProxy) records configureNextLayoutAnimation calls.
//
// IMPORTANT: this only proves the JS surface and the dispatch. Whether the chosen native
// module NAME is the real one on a given platform is verified on-device, never headless (a
// headless fake answers to any name).

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { installRecordingFabric } from '@symbiote-native/test-utils';
import type { ILayoutAnimationConfig } from './index';

// The single correct TurboModule name. Kept in sync with index.ts's
// NATIVE_UI_MANAGER_MODULE_NAME.
const NATIVE_MODULE_NAME = 'UIManager';

type ICapturedCall = {
  config: ILayoutAnimationConfig;
  onSuccess: () => void;
  onError: () => void;
};

let LayoutAnimation: typeof import('./index').LayoutAnimation;
let PlatformUnderTest: typeof import('../platform').Platform;

let captured: ICapturedCall | null;

beforeEach(async () => {
  captured = null;

  const fakeUIManager = {
    configureNextLayoutAnimation(
      config: ILayoutAnimationConfig,
      onSuccess: () => void,
      onError: () => void,
    ): void {
      captured = { config, onSuccess, onError };
    },
  };

  globalThis.__turboModuleProxy = <T>(name: string): T | null =>
    name === NATIVE_MODULE_NAME && isPresent<T>(fakeUIManager)
      ? fakeUIManager
      : null;

  vi.resetModules();
  ({ LayoutAnimation } = await import('./index'));
  ({ Platform: PlatformUnderTest } = await import('../platform'));
});

afterEach(() => {
  vi.restoreAllMocks();
  globalThis.__turboModuleProxy = undefined;
  globalThis.nativeFabricUIManager = undefined;
  vi.useRealTimers();
});

function isPresent<T>(value: unknown): value is T {
  return value !== null && value !== undefined;
}

describe('LayoutAnimation JS surface', () => {
  it('Presets.easeInEaseOut has the expected shape', () => {
    const preset = LayoutAnimation.Presets.easeInEaseOut;
    expect(preset.duration).toBe(300);
    expect(preset.create?.type).toBe('easeInEaseOut');
    expect(preset.create?.property).toBe('opacity');
    expect(preset.update?.type).toBe('easeInEaseOut');
    expect(preset.delete?.type).toBe('easeInEaseOut');
    expect(preset.delete?.property).toBe('opacity');
  });

  it('create(...) builds a well-formed config (update carries only type)', () => {
    const built = LayoutAnimation.create(
      300,
      LayoutAnimation.Types.linear,
      LayoutAnimation.Properties.scaleXY,
    );
    expect(built.duration).toBe(300);
    expect(built.create?.type).toBe('linear');
    expect(built.create?.property).toBe('scaleXY');
    expect(built.update?.type).toBe('linear');
    expect(built.update?.property).toBeUndefined();
    expect(built.delete?.type).toBe('linear');
    expect(built.delete?.property).toBe('scaleXY');
  });

  // why: unlike easeInEaseOut/linear (built uniformly via createLayoutAnimation with
  // one type for create/update/delete), spring is hand-authored ASYMMETRICALLY --
  // create/delete fade with a linear opacity while only update actually springs.
  // That asymmetry is the whole point of the preset (an item springs INTO place but
  // fades in/out linearly), so it deserves its own shape assertion, not just
  // exercising it as a generic "some preset" in the dispatch tests below.
  it('Presets.spring uses a linear create/delete but a spring update', () => {
    const preset = LayoutAnimation.Presets.spring;
    expect(preset.duration).toBe(700);
    expect(preset.create).toEqual({ type: 'linear', property: 'opacity' });
    expect(preset.update).toEqual({ type: 'spring', springDamping: 0.4 });
    expect(preset.delete).toEqual({ type: 'linear', property: 'opacity' });
  });
});

describe('LayoutAnimation.coerceType', () => {
  it('resolves a known easing string to its matching type', () => {
    expect(LayoutAnimation.coerceType('linear')).toBe('linear');
    expect(LayoutAnimation.coerceType('spring')).toBe('spring');
  });

  it("falls back to 'keyboard' for an easing string that isn't a known type", () => {
    expect(LayoutAnimation.coerceType('easeOutCubic')).toBe('keyboard');
    expect(LayoutAnimation.coerceType('')).toBe('keyboard');
  });
});

describe('LayoutAnimation.configureNext dispatch', () => {
  it('dispatches the config to native and fires onAnimationDidEnd once on native success', () => {
    vi.useFakeTimers();
    const preset = LayoutAnimation.Presets.easeInEaseOut;

    let didEndCount = 0;
    LayoutAnimation.configureNext(preset, () => {
      didEndCount += 1;
    });

    expect(captured).not.toBeNull();
    expect(captured?.config).toBe(preset);

    captured?.onSuccess();
    expect(didEndCount).toBe(1);

    // Идемпотентность: повторный success, поздняя ошибка и сработавший таймер не удваивают вызов
    captured?.onSuccess();
    captured?.onError();
    vi.advanceTimersByTime(preset.duration + 100);
    expect(didEndCount).toBe(1);
  });

  // RN гоняет нативный callback с `setTimeout(duration + 17)`: если native не отозвался,
  // `onAnimationDidEnd` всё равно придёт
  it('fires onAnimationDidEnd from the duration + 17ms timer when native never calls back', () => {
    vi.useFakeTimers();
    const preset = LayoutAnimation.Presets.easeInEaseOut;
    let didEndCount = 0;
    LayoutAnimation.configureNext(preset, () => {
      didEndCount += 1;
    });

    vi.advanceTimersByTime(preset.duration + 16);
    expect(didEndCount).toBe(0);
    vi.advanceTimersByTime(1);
    expect(didEndCount).toBe(1);

    captured?.onSuccess();
    expect(didEndCount).toBe(1);
  });

  it('arms the timer even with no native UIManager (headless)', () => {
    vi.useFakeTimers();
    globalThis.__turboModuleProxy = <T>(_name: string): T | null => null;
    let didEndCount = 0;
    LayoutAnimation.configureNext(LayoutAnimation.Presets.linear, () => {
      didEndCount += 1;
    });

    vi.advanceTimersByTime(LayoutAnimation.Presets.linear.duration + 17);
    expect(didEndCount).toBe(1);
  });

  it('is a no-op when Platform.isDisableAnimations is set', () => {
    vi.useFakeTimers();
    vi.spyOn(PlatformUnderTest, 'isDisableAnimations', 'get').mockReturnValue(
      true,
    );
    let didEndCount = 0;
    LayoutAnimation.configureNext(LayoutAnimation.Presets.linear, () => {
      didEndCount += 1;
    });

    vi.advanceTimersByTime(1_000);
    expect(captured).toBeNull();
    expect(didEndCount).toBe(0);
  });

  // why: onAnimationDidFail is a real, distinct callback (native config parsing
  // failed) -- it must actually reach the caller, not just be swallowed like a
  // late/repeat error after success already fired.
  it('drives onAnimationDidFail from a native error, exactly once', () => {
    let didFailCount = 0;
    LayoutAnimation.configureNext(
      LayoutAnimation.Presets.linear,
      () => {},
      () => {
        didFailCount += 1;
      },
    );
    captured?.onError();
    expect(didFailCount).toBe(1);
  });

  // why: onAnimationDidFail is documented optional -- native calling the error
  // callback with none supplied must not throw (the default is a plain no-op).
  it('does not throw when native errors and no onAnimationDidFail was given', () => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.linear);
    expect(() => captured?.onError()).not.toThrow();
  });

  // why: easeInEaseOut/linear/spring are documented shortcuts for
  // configureNext(Presets.X, cb) -- each must dispatch its OWN matching preset, not
  // some shared default.
  it('the easeInEaseOut/linear/spring shortcuts each dispatch their matching preset', () => {
    LayoutAnimation.easeInEaseOut();
    expect(captured?.config).toBe(LayoutAnimation.Presets.easeInEaseOut);

    LayoutAnimation.linear();
    expect(captured?.config).toBe(LayoutAnimation.Presets.linear);

    LayoutAnimation.spring();
    expect(captured?.config).toBe(LayoutAnimation.Presets.spring);
  });
});

describe('LayoutAnimation.setEnabled', () => {
  // why: this is the documented kill switch for the whole feature (e.g. a
  // reduce-motion setting) -- once disabled, configureNext must never reach
  // native, regardless of which module is linked.
  it('makes configureNext a no-op while disabled', () => {
    vi.useFakeTimers();
    LayoutAnimation.setEnabled(false);
    let didEndCount = 0;
    LayoutAnimation.configureNext(LayoutAnimation.Presets.linear, () => {
      didEndCount += 1;
    });
    vi.advanceTimersByTime(1_000);
    expect(captured).toBeNull();
    expect(didEndCount).toBe(0);
  });

  it('is the same function as setLayoutAnimationEnabled', () => {
    LayoutAnimation.setLayoutAnimationEnabled(false);
    LayoutAnimation.setEnabled(true);
    LayoutAnimation.configureNext(LayoutAnimation.Presets.linear);
    expect(captured).not.toBeNull();
  });

  // why: the gate must be reversible -- re-enabling must restore normal dispatch,
  // proving it's a toggle, not a one-way kill switch.
  it('re-enabling restores normal dispatch', () => {
    LayoutAnimation.setEnabled(false);
    LayoutAnimation.setEnabled(true);
    LayoutAnimation.configureNext(LayoutAnimation.Presets.linear);
    expect(captured).not.toBeNull();
  });
});

describe('LayoutAnimation native resolution mechanism', () => {
  it('prefers the Fabric global slot when it exposes configureNextLayoutAnimation', () => {
    installRecordingFabric();
    const slot: unknown = Reflect.get(globalThis, 'nativeFabricUIManager');
    if (typeof slot !== 'object' || slot === null) {
      throw new Error('installRecordingFabric did not install a slot');
    }
    let fabricCalls = 0;
    Object.assign(slot, {
      configureNextLayoutAnimation(
        _config: ILayoutAnimationConfig,
        onSuccess: () => void,
        _onError: () => void,
      ): void {
        fabricCalls += 1;
        onSuccess();
      },
    });

    let didEndCount = 0;
    LayoutAnimation.configureNext(LayoutAnimation.Presets.linear, () => {
      didEndCount += 1;
    });

    expect(fabricCalls).toBe(1);
    expect(didEndCount).toBe(1);
    // The TurboModule fallback (registered under NATIVE_MODULE_NAME in beforeEach)
    // must NOT have been consulted once the Fabric global slot handled it.
    expect(captured).toBeNull();
  });

  it('falls back to the "UIManager" TurboModule when the Fabric global slot is absent', () => {
    expect(globalThis.nativeFabricUIManager).toBeUndefined();

    LayoutAnimation.configureNext(LayoutAnimation.Presets.linear);

    expect(captured).not.toBeNull();
  });

  it('does not resolve a module registered only under the phantom "FabricUIManager" name', () => {
    const fakeUIManagerUnderWrongName = {
      configureNextLayoutAnimation(
        config: ILayoutAnimationConfig,
        onSuccess: () => void,
        onError: () => void,
      ): void {
        captured = { config, onSuccess, onError };
      },
    };
    globalThis.__turboModuleProxy = <T>(name: string): T | null =>
      name === 'FabricUIManager' && isPresent<T>(fakeUIManagerUnderWrongName)
        ? fakeUIManagerUnderWrongName
        : null;

    LayoutAnimation.configureNext(LayoutAnimation.Presets.linear);

    expect(captured).toBeNull();
  });

  // why: resolveUIManager's TurboModule fallback resolves ANY module registered
  // under the right name, without checking it actually carries
  // configureNextLayoutAnimation (an older/partial native binary) -- configureNext's
  // own `manager.configureNextLayoutAnimation === undefined` guard must catch that
  // and no-op, distinct from "no module resolved at all".
  it('is a no-op when the resolved UIManager module lacks configureNextLayoutAnimation', () => {
    const moduleWithoutTheMethod = {};
    globalThis.__turboModuleProxy = <T>(name: string): T | null =>
      name === NATIVE_MODULE_NAME && isPresent<T>(moduleWithoutTheMethod)
        ? moduleWithoutTheMethod
        : null;

    expect(() =>
      LayoutAnimation.configureNext(LayoutAnimation.Presets.linear),
    ).not.toThrow();
    expect(captured).toBeNull();
  });
});

describe('LayoutAnimation (no native module)', () => {
  it('configureNext is a safe no-op and never calls native', async () => {
    globalThis.__turboModuleProxy = <T>(_name: string): T | null => null;
    vi.resetModules();
    const fresh = await import('./index');

    captured = null;
    expect(() => {
      fresh.LayoutAnimation.configureNext(
        fresh.LayoutAnimation.Presets.easeInEaseOut,
      );
    }).not.toThrow();
    expect(captured).toBeNull();
  });
});

describe('LayoutAnimation.checkConfig', () => {
  // RN retired this validator: any call logs one `console.error` and does nothing else
  it('logs the disabled notice through console.error for any arguments', () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    LayoutAnimation.checkConfig(LayoutAnimation.Presets.linear, () => {});
    expect(error).toHaveBeenCalledExactlyOnceWith(
      'LayoutAnimation.checkConfig(...) has been disabled.',
    );
  });
});
