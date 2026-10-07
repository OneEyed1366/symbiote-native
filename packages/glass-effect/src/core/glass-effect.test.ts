// Ядро `GlassView` и `GlassContainer`, порт expo-glass-effect, нативное только на iOS

import { beforeEach, describe, expect, expectTypeOf, it, vi } from 'vitest';

const platform = vi.hoisted(() => ({
  OS: 'ios',
  select(spec: Record<string, unknown>): unknown {
    return spec[this.OS] ?? spec['default'];
  },
}));
const requireNativeViewManager = vi.hoisted(() => vi.fn());
const requireNativeModule = vi.hoisted(() => vi.fn());

vi.mock('expo-modules-core', () => ({
  Platform: platform,
  requireNativeViewManager,
  requireNativeModule,
}));

const loadCore = async () => {
  vi.resetModules();
  return import('./glass-effect');
};

const GLASS_VIEW = 'ViewManagerAdapter_ExpoGlassEffect_GlassView';
const GLASS_CONTAINER = 'ViewManagerAdapter_ExpoGlassEffect_GlassContainer';

beforeEach(() => {
  vi.restoreAllMocks();
  requireNativeViewManager.mockReset();
  requireNativeModule.mockReset();
  platform.OS = 'ios';
  Reflect.deleteProperty(globalThis, 'expo');
});

describe('view names and registration', () => {
  it('names each Expo view after the module and the view', async () => {
    const core = await loadCore();

    expect(core.GLASS_EFFECT_MODULE_NAME).toBe('ExpoGlassEffect');
    expect(core.glassViewName()).toBe(GLASS_VIEW);
    expect(core.glassContainerName()).toBe(GLASS_CONTAINER);
  });

  it('registers each view by module and view name', async () => {
    const core = await loadCore();

    expect(core.ensureGlassViewRegistered()).toBe(true);
    expect(core.ensureGlassContainerRegistered()).toBe(true);
    expect(requireNativeViewManager).toHaveBeenCalledWith(
      'ExpoGlassEffect',
      'GlassView',
    );
    expect(requireNativeViewManager).toHaveBeenCalledWith(
      'ExpoGlassEffect',
      'GlassContainer',
    );
  });

  it('reports false when registration throws instead of crashing the render', async () => {
    requireNativeViewManager.mockImplementation(() => {
      throw new Error('no view config');
    });
    const core = await loadCore();

    expect(core.ensureGlassViewRegistered()).toBe(false);
  });
});

describe('renderGlassView', () => {
  it('is the native view with every prop forwarded on iOS', async () => {
    const core = await loadCore();
    const tintColor = { semantic: ['systemBlue'] };

    const descriptor = core.renderGlassView({
      glassEffectStyle: { style: 'clear', animate: true },
      tintColor,
      isInteractive: true,
      colorScheme: 'dark',
      testID: 'glass-view',
    });

    expect(descriptor).toMatchObject({
      type: GLASS_VIEW,
      props: {
        glassEffectStyle: { style: 'clear', animate: true },
        tintColor,
        isInteractive: true,
        colorScheme: 'dark',
        testID: 'glass-view',
      },
    });
  });

  it('is a plain View without the glass props off iOS', async () => {
    platform.OS = 'android';
    const core = await loadCore();

    const descriptor = core.renderGlassView({
      glassEffectStyle: 'clear',
      tintColor: 'red',
      isInteractive: true,
      colorScheme: 'dark',
      testID: 'glass-view',
    });

    expect(descriptor.type).toBe('view');
    expect(descriptor.props).toEqual({ testID: 'glass-view' });
    expect(requireNativeViewManager).not.toHaveBeenCalled();
  });

  it('falls back to a plain View on iOS when registration fails', async () => {
    requireNativeViewManager.mockImplementation(() => {
      throw new Error('no view config');
    });
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const core = await loadCore();

    expect(core.renderGlassView({ testID: 'glass-view' }).type).toBe('view');
  });
});

describe('renderGlassContainer', () => {
  it('is the native container with spacing on iOS', async () => {
    const core = await loadCore();

    expect(
      core.renderGlassContainer({ spacing: 8, testID: 'c' }),
    ).toMatchObject({
      type: GLASS_CONTAINER,
      props: { spacing: 8, testID: 'c' },
    });
  });

  it('is a plain View without spacing off iOS', async () => {
    platform.OS = 'android';
    const core = await loadCore();

    const descriptor = core.renderGlassContainer({ spacing: 8, testID: 'c' });

    expect(descriptor.type).toBe('view');
    expect(descriptor.props).toEqual({ testID: 'c' });
  });
});

describe('availability', () => {
  it('reads the native constants on iOS and caches them', async () => {
    requireNativeModule.mockReturnValue({
      isLiquidGlassAvailable: true,
      isGlassEffectAPIAvailable: false,
    });
    const core = await loadCore();

    expect(core.isLiquidGlassAvailable()).toBe(true);
    expect(core.isLiquidGlassAvailable()).toBe(true);
    expect(core.isGlassEffectAPIAvailable()).toBe(false);
    expect(requireNativeModule).toHaveBeenCalledTimes(2);
    expect(requireNativeModule).toHaveBeenCalledWith('ExpoGlassEffect');
  });

  it('reports false without touching the native module off iOS', async () => {
    platform.OS = 'android';
    const core = await loadCore();

    expect(core.isLiquidGlassAvailable()).toBe(false);
    expect(core.isGlassEffectAPIAvailable()).toBe(false);
    expect(requireNativeModule).not.toHaveBeenCalled();
  });

  it('coerces a missing native constant to false', async () => {
    requireNativeModule.mockReturnValue({});
    const core = await loadCore();

    expect(core.isLiquidGlassAvailable()).toBe(false);
  });
});

describe('props (types)', () => {
  it('limits the glass style and color scheme to the upstream unions', async () => {
    const core = await loadCore();
    type IView = Parameters<typeof core.renderGlassView>[0];

    expectTypeOf<IView>().toBeObject();
    expectTypeOf<
      import('./glass-effect').IGlassViewProps['colorScheme']
    >().toEqualTypeOf<'auto' | 'light' | 'dark' | undefined>();
    expectTypeOf<import('./glass-effect').IGlassStyle>().toEqualTypeOf<
      'clear' | 'regular' | 'none'
    >();
  });
});
