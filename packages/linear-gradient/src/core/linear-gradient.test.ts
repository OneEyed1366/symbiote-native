// Ядро `LinearGradient`, порт `LinearGradient.tsx` из expo-linear-gradient
// На Android нативный view лежит внутри View, который держит стиль и детей

import {
  afterEach,
  beforeEach,
  describe,
  expect,
  expectTypeOf,
  it,
  vi,
} from 'vitest';
import {
  clearGlobalStyles,
  processColor,
  registerRules,
} from '@symbiote-native/engine';

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
  LINEAR_GRADIENT_MODULE_NAME,
  linearGradientViewName,
  ensureLinearGradientRegistered,
  normalizePoint,
  renderLinearGradient,
} = await import('./linear-gradient');
import type { ILinearGradientProps } from './linear-gradient';

const VIEW_NAME = 'ViewManagerAdapter_ExpoLinearGradient';
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

describe('linearGradientViewName', () => {
  it('names the Expo view-manager adapter after the module', () => {
    expect(LINEAR_GRADIENT_MODULE_NAME).toBe('ExpoLinearGradient');
    expect(linearGradientViewName()).toBe(VIEW_NAME);
  });
});

describe('ensureLinearGradientRegistered', () => {
  it('registers the view config through requireNativeViewManager', () => {
    expect(ensureLinearGradientRegistered()).toBe(true);
    expect(requireNativeViewManager).toHaveBeenCalledWith(
      LINEAR_GRADIENT_MODULE_NAME,
    );
  });

  it('reports false when registration throws instead of crashing the render', () => {
    requireNativeViewManager.mockImplementation(() => {
      throw new Error('no view config');
    });

    expect(ensureLinearGradientRegistered()).toBe(false);
  });
});

describe('normalizePoint', () => {
  it('turns an {x, y} object into an [x, y] tuple', () => {
    expect(normalizePoint({ x: 0.1, y: 0.2 })).toEqual([0.1, 0.2]);
  });

  it('keeps an [x, y] tuple as it is', () => {
    expect(normalizePoint([0.3, 0.4])).toEqual([0.3, 0.4]);
  });

  it.each([undefined, null])('reads %s as no point', point => {
    expect(normalizePoint(point)).toBeUndefined();
  });

  it('warns and drops an array that is not a pair', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    expect(normalizePoint([0.1, 0.2, 0.3])).toBeUndefined();
    expect(warn).toHaveBeenCalledOnce();
  });
});

describe('renderLinearGradient on iOS', () => {
  it('renders a complex gradient as one native view with processed colors', () => {
    const descriptor = renderLinearGradient({
      colors: ['red', 'blue'],
      start: { x: 0, y: 0 },
      end: { x: 1, y: 1 },
      locations: [0.5, 1],
      testID: 'gradient',
    });

    expect(descriptor).toEqual({
      type: VIEW_NAME,
      props: {
        testID: 'gradient',
        colors: [processColor('red'), processColor('blue')],
        startPoint: [0, 0],
        endPoint: [1, 1],
        locations: [0.5, 1],
      },
      children: [],
      key: undefined,
    });
  });

  it('keeps dither off the native props, it is an Android prop', () => {
    const descriptor = renderLinearGradient({
      colors: ['red', 'blue'],
      dither: false,
    });

    expect(descriptor?.props).not.toHaveProperty('dither');
  });

  it('drops locations beyond the colors and warns about the mismatch', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const descriptor = renderLinearGradient({
      colors: ['red', 'blue'],
      locations: [0, 0.5, 1],
    });

    expect(descriptor?.props.locations).toEqual([0, 0.5]);
    expect(warn).toHaveBeenCalledOnce();
  });

  it('falls back to a plain view when the view manager is missing', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    requireNativeViewManager.mockImplementation(() => {
      throw new Error('no view config');
    });

    const descriptor = renderLinearGradient({
      colors: ['red', 'blue'],
      testID: 'gradient',
    });

    expect(descriptor).toEqual({
      type: 'view',
      props: { testID: 'gradient' },
      children: [],
      key: undefined,
    });
  });
});

describe('renderLinearGradient on Android', () => {
  beforeEach(() => {
    platform.OS = 'android';
  });

  it('wraps the native view in a View with the style and the other props', () => {
    const descriptor = renderLinearGradient({
      colors: ['red', 'blue'],
      style: { width: 10 },
      testID: 'gradient',
      dither: false,
    });

    expect(descriptor?.type).toBe('view');
    expect(descriptor?.props).toEqual({
      style: { width: 10 },
      testID: 'gradient',
    });
    expect(descriptor?.children).toHaveLength(1);
  });

  it('fills the wrapper with the native view and passes dither through', () => {
    const descriptor = renderLinearGradient({
      colors: ['red', 'blue'],
      dither: false,
    });

    expect(descriptor?.children[0]).toMatchObject({
      type: VIEW_NAME,
      props: {
        style: ABSOLUTE_FILL,
        colors: [processColor('red'), processColor('blue')],
        dither: false,
      },
    });
  });

  it('spreads one border radius over all eight corner values', () => {
    const native = renderLinearGradient({
      colors: ['red', 'blue'],
      style: { borderRadius: 6 },
    })?.children[0];

    expect(native).toMatchObject({
      props: { borderRadii: [6, 6, 6, 6, 6, 6, 6, 6] },
    });
  });

  it('lets a per-corner radius win over the shared one', () => {
    const native = renderLinearGradient({
      colors: ['red', 'blue'],
      style: {
        borderRadius: 6,
        borderTopLeftRadius: 1,
        borderBottomRightRadius: 2,
      },
    })?.children[0];

    expect(native).toMatchObject({
      props: { borderRadii: [1, 1, 6, 6, 2, 2, 6, 6] },
    });
  });

  it('uses a zero radius when the style has none', () => {
    const native = renderLinearGradient({ colors: ['red', 'blue'] })
      ?.children[0];

    expect(native).toMatchObject({
      props: { borderRadii: [0, 0, 0, 0, 0, 0, 0, 0] },
    });
  });

  describe('with the radius coming from a CSS class', () => {
    beforeEach(() => {
      registerRules([
        {
          tokens: ['rounded'],
          specificity: [0, 1, 0],
          order: 0,
          style: { borderRadius: 12 },
        },
      ]);
    });
    afterEach(() => clearGlobalStyles());

    it('rounds the native leaf by `className`, the same as by `style`', () => {
      const native = renderLinearGradient({
        colors: ['red', 'blue'],
        className: 'rounded',
      })?.children[0];

      expect(native).toMatchObject({
        props: { borderRadii: [12, 12, 12, 12, 12, 12, 12, 12] },
      });
    });

    it('reads `class` too, the name Vue and Angular use', () => {
      const native = renderLinearGradient({
        colors: ['red', 'blue'],
        class: 'rounded',
      })?.children[0];

      expect(native).toMatchObject({
        props: { borderRadii: [12, 12, 12, 12, 12, 12, 12, 12] },
      });
    });

    it('lets an inline style win over the class, as on any view', () => {
      const native = renderLinearGradient({
        colors: ['red', 'blue'],
        className: 'rounded',
        style: { borderRadius: 4 },
      })?.children[0];

      expect(native).toMatchObject({
        props: { borderRadii: [4, 4, 4, 4, 4, 4, 4, 4] },
      });
    });
  });
});

// Минимум два цвета, как в `fails to typecheck with less than two colors` у upstream
describe('ILinearGradientProps', () => {
  it('accepts two or more colors and refuses fewer', () => {
    type IColors = ILinearGradientProps['colors'];
    expectTypeOf<readonly ['red', 'blue']>().toExtend<IColors>();
    expectTypeOf<readonly ['red']>().not.toExtend<IColors>();
    expectTypeOf<readonly []>().not.toExtend<IColors>();
  });
});
