// Solid `GlassView` и `GlassContainer` через recording fabric с подставленным view config
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DynamicColorIOS, PlatformColor } from '@symbiote-native/engine';
import {
  mount,
  setNativeViewConfigSource,
  unmount,
} from '@symbiote-native/solid';
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

const ROOT_TAG = 1633;
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

const tick = (): Promise<void> =>
  new Promise(resolve => setTimeout(resolve, 0));

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
    async style => {
      mount(ROOT_TAG, () => (
        <GlassView glassEffectStyle={style} testID="glass-view" />
      ));
      await tick();

      const { payload } = nodeNamed(GLASS_VIEW);
      expect(payload.glassEffectStyle).toBe(style);
      expect(payload.testID).toBe('glass-view');
    },
  );

  it.each([
    ['a string', 'rgba(255, 59, 48, 0.7)'],
    ['a PlatformColor', PlatformColor('systemBlue')],
    ['a DynamicColorIOS', DynamicColorIOS({ light: 'white', dark: 'black' })],
  ])('renders a liquid glass view tinted with %s', async (_name, tintColor) => {
    mount(ROOT_TAG, () => <GlassView tintColor={tintColor} />);
    await tick();

    expect(nodeNamed(GLASS_VIEW).payload.tintColor).toEqual(tintColor);
  });

  it('holds the children inside the native view', async () => {
    mount(ROOT_TAG, () => (
      <GlassView>
        <view testID="inner" />
      </GlassView>
    ));
    await tick();

    expect(
      nodeNamed(GLASS_VIEW).children.map(child => child.payload.testID),
    ).toEqual(['inner']);
  });

  it('registers the view manager when it renders', async () => {
    mount(ROOT_TAG, () => <GlassView />);
    await tick();

    expect(requireNativeViewManager).toHaveBeenCalledWith(
      'ExpoGlassEffect',
      'GlassView',
    );
  });
});

describe('GlassContainer (Positive)', () => {
  it('renders a liquid glass container holding glass views', async () => {
    mount(ROOT_TAG, () => (
      <GlassContainer spacing={8}>
        <GlassView testID="glass-children-1" />
        <GlassView testID="glass-children-2" />
      </GlassContainer>
    ));
    await tick();

    const container = nodeNamed(GLASS_CONTAINER);
    expect(container.payload.spacing).toBe(8);
    expect(container.children.map(child => child.payload.testID)).toEqual([
      'glass-children-1',
      'glass-children-2',
    ]);
  });
});

describe('off iOS', () => {
  it('renders a plain View without native glass props and keeps the children', async () => {
    platform.OS = 'android';

    mount(ROOT_TAG, () => (
      <GlassView glassEffectStyle="clear" tintColor="red" testID="plain">
        <view testID="inner" />
      </GlassView>
    ));
    await tick();

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
