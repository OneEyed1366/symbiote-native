// Vue `SymbolView` через recording fabric с подставленным view config
import { h, type VNode } from '@vue/runtime-core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { processColor } from '@symbiote-native/engine';
import {
  mount,
  setNativeViewConfigSource,
  unmount,
} from '@symbiote-native/vue';
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

const ROOT_TAG = 1642;
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
          resizeMode: true,
        },
      }
    : undefined,
);

const tick = (): Promise<void> =>
  new Promise(resolve => setTimeout(resolve, 0));

async function mountRoot(render: () => VNode): Promise<void> {
  mount(ROOT_TAG, { render });
  await tick();
}

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

const fallbackSlot = { fallback: () => h('view', { testID: 'fallback' }) };

function fallbackNode() {
  return live.findLive(
    live.appRoot(),
    node => node.payload.testID === 'fallback',
  );
}

describe('SymbolView on iOS', () => {
  it('paints the native view with the processed tint and the sized style', async () => {
    await mountRoot(() =>
      h(SymbolView, { name: 'star.fill', tintColor: 'red', size: 32 }),
    );

    expect(nodeNamed(NATIVE_VIEW).payload).toMatchObject({
      name: 'star.fill',
      type: 'monochrome',
      animated: false,
      tint: processColor('red'),
      width: 32,
      height: 32,
    });
  });

  it('reads kebab-case attributes the way a template writes them', async () => {
    await mountRoot(() =>
      h(SymbolView, { name: 'star', 'resize-mode': 'center' }),
    );

    expect(nodeNamed(NATIVE_VIEW).payload.resizeMode).toBe('center');
  });

  it('renders the fallback slot when the platform has no name', async () => {
    await mountRoot(() =>
      h(SymbolView, { name: { android: 'home' } }, fallbackSlot),
    );

    expect(fallbackNode()).toBeDefined();
    expect(fabric.find(node => node.viewName === NATIVE_VIEW)).toBeUndefined();
  });
});

describe('SymbolView on Android', () => {
  beforeEach(() => {
    platform.OS = 'android';
  });

  it('draws the glyph once the font loaded', async () => {
    await mountRoot(() => h(SymbolView, { name: { android: 'home' } }));
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

    await mountRoot(() => h(SymbolView, { name: { android: 'home' } }));
    await tick();

    expect(
      live.findLive(live.appRoot(), node => node.viewName === 'RCTRawText'),
    ).toBeUndefined();
  });

  it('renders the fallback slot when the name has no Android entry', async () => {
    await mountRoot(() => h(SymbolView, { name: 'star.fill' }, fallbackSlot));

    expect(fallbackNode()).toBeDefined();
  });
});
