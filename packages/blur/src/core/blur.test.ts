// Ядро `BlurView` и `BlurTargetView`, порт `BlurView.tsx` из expo-blur
// Нативный blur лежит внутри View, который держит стиль и детей

import { beforeEach, describe, expect, expectTypeOf, it, vi } from 'vitest';

const platform = vi.hoisted(() => ({
  OS: 'ios',
  select(spec: Record<string, unknown>): unknown {
    return spec[this.OS] ?? spec['default'];
  },
}));
const requireNativeViewManager = vi.hoisted(() => vi.fn());

vi.mock('expo-modules-core', () => ({
  Platform: platform,
  requireNativeViewManager,
}));

const {
  BLUR_MODULE_NAME,
  blurViewName,
  blurTargetViewName,
  ensureBlurRegistered,
  ensureBlurTargetRegistered,
  renderBlurView,
  renderBlurTargetView,
  warnBlurProps,
  watchBlurTarget,
} = await import('./blur');
import type { IBlurViewProps } from './blur';

const BLUR_VIEW = 'ViewManagerAdapter_ExpoBlur_ExpoBlurView';
const TARGET_VIEW = 'ViewManagerAdapter_ExpoBlur_ExpoBlurTargetView';
const ABSOLUTE_FILL = {
  position: 'absolute',
  left: 0,
  right: 0,
  top: 0,
  bottom: 0,
};

beforeEach(() => {
  vi.restoreAllMocks();
  requireNativeViewManager.mockReset();
  platform.OS = 'ios';
  Reflect.deleteProperty(globalThis, 'expo');
});

describe('view names', () => {
  it('names each Expo view after the module and the view', () => {
    expect(BLUR_MODULE_NAME).toBe('ExpoBlur');
    expect(blurViewName()).toBe(BLUR_VIEW);
    expect(blurTargetViewName()).toBe(TARGET_VIEW);
  });
});

describe('registration', () => {
  it('registers the blur view by module and view name', () => {
    expect(ensureBlurRegistered()).toBe(true);
    expect(requireNativeViewManager).toHaveBeenCalledWith(
      'ExpoBlur',
      'ExpoBlurView',
    );
  });

  it('registers the target view by module and view name', () => {
    expect(ensureBlurTargetRegistered()).toBe(true);
    expect(requireNativeViewManager).toHaveBeenCalledWith(
      'ExpoBlur',
      'ExpoBlurTargetView',
    );
  });

  it('reports false when registration throws instead of crashing the render', () => {
    requireNativeViewManager.mockImplementation(() => {
      throw new Error('no view config');
    });

    expect(ensureBlurRegistered()).toBe(false);
  });
});

describe('renderBlurView (Positive)', () => {
  it('wraps a native blur that fills a transparent View', () => {
    const descriptor = renderBlurView({ testID: 'blur' }, undefined);

    expect(descriptor.type).toBe('view');
    expect(descriptor.props.testID).toBe('blur');
    expect(descriptor.props.style).toEqual([
      { backgroundColor: 'transparent' },
      undefined,
    ]);
    expect(descriptor.children).toEqual([
      {
        type: BLUR_VIEW,
        props: {
          tint: 'default',
          intensity: 50,
          blurReductionFactor: 4,
          blurMethod: 'none',
          style: ABSOLUTE_FILL,
        },
        children: [],
        key: undefined,
      },
    ]);
  });

  it('forwards tint, intensity and the Android reduction factor', () => {
    const [native] = renderBlurView(
      { tint: 'light', intensity: 0.65, blurReductionFactor: 2 },
      undefined,
    ).children;

    expect(native).toMatchObject({
      props: { tint: 'light', intensity: 0.65, blurReductionFactor: 2 },
    });
  });

  it('passes the resolved blur target id to the native view', () => {
    const [native] = renderBlurView({}, 42).children;

    expect(native).toMatchObject({ props: { blurTargetId: 42 } });
  });

  it('keeps the author style after the transparent container', () => {
    const style = { opacity: 0.5 };

    expect(renderBlurView({ style }, undefined).props.style).toEqual([
      { backgroundColor: 'transparent' },
      style,
    ]);
  });

  it('prefers blurMethod over the deprecated experimentalBlurMethod', () => {
    const [native] = renderBlurView(
      { blurMethod: 'dimezisBlurView', experimentalBlurMethod: 'none' },
      undefined,
    ).children;

    expect(native).toMatchObject({ props: { blurMethod: 'dimezisBlurView' } });
  });

  it('falls back to the deprecated experimentalBlurMethod', () => {
    const [native] = renderBlurView(
      { experimentalBlurMethod: 'dimezisBlurViewSdk31Plus' },
      undefined,
    ).children;

    expect(native).toMatchObject({
      props: { blurMethod: 'dimezisBlurViewSdk31Plus' },
    });
  });

  it('keeps the blur-only props off the wrapper View', () => {
    const { props } = renderBlurView(
      { tint: 'dark', intensity: 10, blurMethod: 'none', testID: 'x' },
      undefined,
    );

    expect(Object.keys(props).sort()).toEqual(['style', 'testID']);
  });

  it('renders a plain View without a native child when registration fails', () => {
    requireNativeViewManager.mockImplementation(() => {
      throw new Error('no view config');
    });
    vi.spyOn(console, 'warn').mockImplementation(() => {});

    const descriptor = renderBlurView({ testID: 'blur' }, undefined);

    expect(descriptor.type).toBe('view');
    expect(descriptor.children).toEqual([]);
  });
});

describe('renderBlurTargetView', () => {
  it('is a plain View on iOS', () => {
    const descriptor = renderBlurTargetView({ testID: 'target' });

    expect(descriptor).toMatchObject({
      type: 'view',
      props: { testID: 'target' },
    });
    expect(requireNativeViewManager).not.toHaveBeenCalled();
  });

  it('is the native target view on Android', () => {
    platform.OS = 'android';

    const descriptor = renderBlurTargetView({ testID: 'target' });

    expect(descriptor).toMatchObject({
      type: TARGET_VIEW,
      props: { testID: 'target' },
    });
    expect(requireNativeViewManager).toHaveBeenCalledWith(
      'ExpoBlur',
      'ExpoBlurTargetView',
    );
  });

  it('falls back to a plain View on Android when registration fails', () => {
    platform.OS = 'android';
    requireNativeViewManager.mockImplementation(() => {
      throw new Error('no view config');
    });
    vi.spyOn(console, 'warn').mockImplementation(() => {});

    expect(renderBlurTargetView({}).type).toBe('view');
  });
});

describe('warnBlurProps', () => {
  it('warns that experimentalBlurMethod is deprecated', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    warnBlurProps({ experimentalBlurMethod: 'none' }, false);

    expect(warn).toHaveBeenCalledWith(
      'The `experimentalBlurMethod` prop has been depracated. Please use the `blurMethod` prop instead.',
    );
  });

  it('warns on Android when a dimezis method has no blur target', () => {
    platform.OS = 'android';
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    warnBlurProps({ blurMethod: 'dimezisBlurView' }, false);

    expect(warn).toHaveBeenCalledOnce();
    expect(warn.mock.calls[0]?.[0]).toContain('"dimezisBlurView" blur method');
  });

  it('stays silent with a blur target, on iOS and for the none method', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    warnBlurProps({ blurMethod: 'dimezisBlurView' }, false);
    platform.OS = 'android';
    warnBlurProps({ blurMethod: 'dimezisBlurView' }, true);
    warnBlurProps({}, false);

    expect(warn).not.toHaveBeenCalled();
  });
});

describe('watchBlurTarget', () => {
  it('reports no id for a missing or foreign target', () => {
    const onId = vi.fn();

    watchBlurTarget(null, onId);
    watchBlurTarget(undefined, onId);
    watchBlurTarget({}, onId);

    expect(onId).toHaveBeenCalledTimes(3);
    expect(onId.mock.calls.flat()).toEqual([undefined, undefined, undefined]);
  });

  it('hands back a cancel that is safe to call for a missing target', () => {
    expect(() => watchBlurTarget(null, vi.fn())()).not.toThrow();
  });
});

describe('IBlurViewProps (types)', () => {
  it('limits tint and blurMethod to the upstream unions', () => {
    expectTypeOf<IBlurViewProps['tint']>().toEqualTypeOf<
      | 'light'
      | 'dark'
      | 'default'
      | 'extraLight'
      | 'regular'
      | 'prominent'
      | 'systemUltraThinMaterial'
      | 'systemThinMaterial'
      | 'systemMaterial'
      | 'systemThickMaterial'
      | 'systemChromeMaterial'
      | 'systemUltraThinMaterialLight'
      | 'systemThinMaterialLight'
      | 'systemMaterialLight'
      | 'systemThickMaterialLight'
      | 'systemChromeMaterialLight'
      | 'systemUltraThinMaterialDark'
      | 'systemThinMaterialDark'
      | 'systemMaterialDark'
      | 'systemThickMaterialDark'
      | 'systemChromeMaterialDark'
      | undefined
    >();
    expectTypeOf<IBlurViewProps['blurMethod']>().toEqualTypeOf<
      'none' | 'dimezisBlurView' | 'dimezisBlurViewSdk31Plus' | undefined
    >();
  });
});
