// React `GlassView` и `GlassContainer` через recording fabric с подставленным view config
import { createElement } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DynamicColorIOS, PlatformColor } from '@symbiote-native/engine';
import {
  mount,
  setNativeViewConfigSource,
  unmount,
} from '@symbiote-native/react';
import {
  createLiveTree,
  installRecordingFabric,
} from '@symbiote-native/test-utils';

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
  requireNativeModule: vi.fn(),
}));

const { GlassView, GlassContainer } = await import('./glass-effect');

const ROOT_TAG = 1631;
const GLASS_VIEW = 'ViewManagerAdapter_ExpoGlassEffect_GlassView';
const GLASS_CONTAINER = 'ViewManagerAdapter_ExpoGlassEffect_GlassContainer';

const fabric = installRecordingFabric();
const live = createLiveTree(fabric);
const keepColor = (value: unknown): unknown => value;
setNativeViewConfigSource(name => {
  if (name === GLASS_VIEW) {
    return {
      validAttributes: {
        glassEffectStyle: true,
        tintColor: { process: keepColor },
        isInteractive: true,
        colorScheme: true,
      },
    };
  }
  return name === GLASS_CONTAINER
    ? { validAttributes: { spacing: true } }
    : undefined;
});

beforeEach(() => {
  fabric.reset();
  vi.clearAllMocks();
  platform.OS = 'ios';
});

afterEach(() => unmount(ROOT_TAG));

function nodeNamed(viewName: string) {
  const node = fabric.find(candidate => candidate.viewName === viewName);
  if (node === undefined) throw new Error(`no ${viewName} was created`);
  return live.nodeOf(node.handle);
}

describe('GlassView (Positive)', () => {
  it.each(['regular', 'clear'] as const)(
    'renders a %s liquid glass view',
    style => {
      mount(
        ROOT_TAG,
        createElement(GlassView, {
          glassEffectStyle: style,
          testID: 'glass-view',
        }),
      );

      const { payload } = nodeNamed(GLASS_VIEW);
      expect(payload.glassEffectStyle).toBe(style);
      expect(payload.testID).toBe('glass-view');
    },
  );

  it.each([
    ['a string', 'rgba(255, 59, 48, 0.7)'],
    ['a PlatformColor', PlatformColor('systemBlue')],
    ['a DynamicColorIOS', DynamicColorIOS({ light: 'white', dark: 'black' })],
  ])('renders a liquid glass view tinted with %s', (_name, tintColor) => {
    mount(ROOT_TAG, createElement(GlassView, { tintColor }));

    expect(nodeNamed(GLASS_VIEW).payload.tintColor).toEqual(tintColor);
  });

  it('forwards interactivity, color scheme and the style config', () => {
    mount(
      ROOT_TAG,
      createElement(GlassView, {
        isInteractive: true,
        colorScheme: 'dark',
        glassEffectStyle: { style: 'clear', animate: true },
      }),
    );

    expect(nodeNamed(GLASS_VIEW).payload).toMatchObject({
      isInteractive: true,
      colorScheme: 'dark',
      glassEffectStyle: { style: 'clear', animate: true },
    });
  });

  it('holds the children inside the native view', () => {
    mount(
      ROOT_TAG,
      createElement(GlassView, {}, createElement('view', { testID: 'inner' })),
    );

    expect(
      nodeNamed(GLASS_VIEW).children.map(child => child.payload.testID),
    ).toEqual(['inner']);
  });

  it('registers the view manager when it renders', () => {
    mount(ROOT_TAG, createElement(GlassView, {}));

    expect(requireNativeViewManager).toHaveBeenCalledWith(
      'ExpoGlassEffect',
      'GlassView',
    );
  });
});

describe('GlassContainer (Positive)', () => {
  it('renders a liquid glass container holding glass views', () => {
    mount(
      ROOT_TAG,
      createElement(
        GlassContainer,
        { spacing: 8, testID: 'glass-container' },
        createElement(GlassView, { testID: 'glass-children-1' }),
        createElement(GlassView, { testID: 'glass-children-2' }),
      ),
    );

    const container = nodeNamed(GLASS_CONTAINER);
    expect(container.payload.spacing).toBe(8);
    expect(container.children.map(child => child.payload.testID)).toEqual([
      'glass-children-1',
      'glass-children-2',
    ]);
  });
});

describe('off iOS', () => {
  it('renders a plain View without native glass props and keeps the children', () => {
    platform.OS = 'android';

    mount(
      ROOT_TAG,
      createElement(
        GlassView,
        { glassEffectStyle: 'clear', tintColor: 'red', testID: 'plain' },
        createElement('view', { testID: 'inner' }),
      ),
    );

    const plain = live.findLive(
      live.appRoot(),
      node => node.payload.testID === 'plain',
    );
    expect(plain?.viewName).toBe('RCTView');
    expect(plain?.payload.glassEffectStyle).toBeUndefined();
    expect(plain?.children).toHaveLength(1);
    expect(requireNativeViewManager).not.toHaveBeenCalled();
  });
});
