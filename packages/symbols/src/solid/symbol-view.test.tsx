// Solid `SymbolView` через recording fabric с подставленным view config
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { processColor } from '@symbiote-native/engine';
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
const loadAsync = vi.hoisted(() => vi.fn());

vi.mock('expo-modules-core', () => ({
  Platform: platform,
  requireNativeViewManager,
}));
vi.mock('@symbiote-native/font', () => ({
  loadAsync,
  renderToImageAsync: vi.fn(),
}));
vi.mock('@expo-google-fonts/material-symbols/400Regular', () => ({
  MaterialSymbols_400Regular: 400,
}));

const { SymbolView } = await import('./symbol-view');

const ROOT_TAG = 1643;
const NATIVE_VIEW = 'ViewManagerAdapter_SymbolModule';
const HOME_GLYPH = String.fromCharCode(59530);

const fabric = installRecordingFabric();
const live = createLiveTree(fabric);
setNativeViewConfigSource(name =>
  name === NATIVE_VIEW
    ? {
        validAttributes: {
          name: true,
          type: true,
          weight: true,
          animated: true,
          colors: true,
          tint: true,
        },
      }
    : undefined,
);

const tick = (): Promise<void> =>
  new Promise(resolve => setTimeout(resolve, 0));

beforeEach(() => {
  fabric.reset();
  vi.clearAllMocks();
  loadAsync.mockResolvedValue(undefined);
  platform.OS = 'ios';
});

afterEach(() => unmount(ROOT_TAG));

function nodeNamed(viewName: string) {
  const node = fabric.find(candidate => candidate.viewName === viewName);
  if (node === undefined) throw new Error(`no ${viewName} was created`);
  return live.nodeOf(node.handle);
}

function fallbackNode() {
  return live.findLive(
    live.appRoot(),
    node => node.payload.testID === 'fallback',
  );
}

describe('SymbolView on iOS', () => {
  it('paints the native view with the processed tint and the sized style', async () => {
    mount(ROOT_TAG, () => (
      <view>
        <SymbolView name="star.fill" tintColor="red" size={32} />
      </view>
    ));
    await tick();

    expect(nodeNamed(NATIVE_VIEW).payload).toMatchObject({
      name: 'star.fill',
      type: 'monochrome',
      animated: false,
      tint: processColor('red'),
      width: 32,
      height: 32,
    });
  });

  it('renders the fallback when the platform has no name', async () => {
    mount(ROOT_TAG, () => (
      <view>
        <SymbolView
          name={{ android: 'home' }}
          fallback={<view testID="fallback" />}
        />
      </view>
    ));
    await tick();

    expect(fallbackNode()).toBeDefined();
    expect(fabric.find(node => node.viewName === NATIVE_VIEW)).toBeUndefined();
  });
});

describe('SymbolView on Android', () => {
  beforeEach(() => {
    platform.OS = 'android';
  });

  it('is an empty View first and draws the glyph once the font loaded', async () => {
    mount(ROOT_TAG, () => (
      <view>
        <SymbolView name={{ android: 'home' }} size={32} />
      </view>
    ));
    await tick();
    await tick();

    const glyph = live.findLive(
      live.appRoot(),
      node => node.viewName === 'RCTRawText',
    );
    expect(glyph?.payload.text).toBe(HOME_GLYPH);
    expect(loadAsync).toHaveBeenCalledTimes(1);
  });

  it('stays an empty View when the font fails to load', async () => {
    loadAsync.mockRejectedValue(new Error('network'));

    mount(ROOT_TAG, () => (
      <view>
        <SymbolView name={{ android: 'home' }} />
      </view>
    ));
    await tick();
    await tick();

    expect(
      live.findLive(live.appRoot(), node => node.viewName === 'RCTRawText'),
    ).toBeUndefined();
  });

  it('renders the fallback when the name has no Android entry', async () => {
    mount(ROOT_TAG, () => (
      <view>
        <SymbolView name="star.fill" fallback={<view testID="fallback" />} />
      </view>
    ));
    await tick();

    expect(fallbackNode()).toBeDefined();
  });
});
